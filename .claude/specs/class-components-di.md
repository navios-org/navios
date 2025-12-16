# Class Components with DI Support Specification

## Overview

This specification describes a new class-based component system for `@navios/adapter-xml` that integrates with `@navios/di`. Class components are marked with the `@Component()` decorator, which internally registers them as `Request` scoped injectables with optional Zod schema validation for props. Props are received in the constructor (like any other injectable with schema), and the `render()` method takes no arguments.

## Motivation

- Enable components to have access to injected services (loggers, repositories, config, etc.)
- Support complex components that need shared state or dependencies
- Leverage existing `@Injectable` schema validation for props
- Maintain consistency with the existing `@navios/di` patterns
- Allow mixing functional and class components freely

## Design Decisions

1. **Request Scope**: Class components use `InjectableScope.Request` by default - each render creates fresh instances
2. **Lazy Resolution**: JSX does not instantiate class components; `renderToXml` resolves them via the container
3. **Props via Constructor**: Props are passed to constructor (validated by Zod schema), consistent with `@Injectable({ schema })`
4. **Parameterless render()**: The `render()` method takes no arguments - props are already available as class properties
5. **Optional Container**: Container is optional in `renderToXml`, but required if class components are present
6. **Reuses @Injectable**: `@Component()` is essentially a thin wrapper around `@Injectable` with Request scope

---

## Technical Design

### 1. New Symbol for Class Components

```typescript
// types/xml-node.mts (additions)
export const ClassComponent = Symbol.for('xml.class-component')

/** Represents a class component that needs to be resolved via DI */
export interface ClassComponentNode {
  type: typeof ClassComponent
  componentClass: ComponentClass
  props: Record<string, unknown>
}

/** Union type for all possible node types (updated) */
export type AnyXmlNode =
  | XmlNode
  | AsyncXmlNode
  | CDataNode
  | RawXmlNode
  | ClassComponentNode
  | string
  | number
  | null
  | undefined
```

### 2. Component Interface

```typescript
// types/component.mts
import type { AnyXmlNode } from './xml-node.mjs'

/**
 * Base interface for class components.
 * The render method takes no arguments - props are received via constructor.
 */
export interface XmlComponent {
  render(): AnyXmlNode | Promise<AnyXmlNode>
}

/**
 * Type for class component constructors.
 */
export interface ComponentClass {
  new (...args: any[]): XmlComponent
}
```

### 3. `@Component()` Decorator

The decorator is a thin wrapper around `@Injectable` that:
- Sets `Request` scope by default
- Marks the class as a component for JSX runtime detection
- Validates the class has a `render()` method

```typescript
// decorators/component.decorator.mts
import type { z, ZodObject, ZodRawShape } from 'zod/v4'

import type { Registry } from '@navios/di'

import { InjectableScope, InjectionToken, globalRegistry } from '@navios/di'
import { InjectableType } from '@navios/di/enums'
import { InjectableTokenMeta } from '@navios/di/symbols'

import type { ComponentClass, XmlComponent } from '../types/component.mjs'

export const ComponentMeta = Symbol.for('xml.component.meta')

// #1 Component without props (no schema)
export function Component(): <T extends ComponentClass>(
  target: T,
  context?: ClassDecoratorContext,
) => T

// #2 Component with props schema
export function Component<Schema extends ZodObject<ZodRawShape>>(options: {
  schema: Schema
  registry?: Registry
}): <T extends new (props: z.output<Schema>, ...args: any[]) => XmlComponent>(
  target: T,
  context?: ClassDecoratorContext,
) => T

// #3 Component with custom registry only
export function Component(options: {
  registry: Registry
}): <T extends ComponentClass>(
  target: T,
  context?: ClassDecoratorContext,
) => T

export function Component(
  options: {
    schema?: ZodObject<ZodRawShape>
    registry?: Registry
  } = {},
) {
  const { schema, registry = globalRegistry } = options

  return <T extends ComponentClass>(
    target: T,
    context?: ClassDecoratorContext,
  ): T => {
    if (
      (context && context.kind !== 'class') ||
      (target instanceof Function && !context)
    ) {
      throw new Error(
        '[@navios/adapter-xml] @Component decorator can only be used on classes.',
      )
    }

    // Verify the class has a render method
    if (typeof target.prototype.render !== 'function') {
      throw new Error(
        `[@navios/adapter-xml] @Component class "${target.name}" must implement render() method.`,
      )
    }

    // Create token with schema if provided
    const injectableToken = schema
      ? InjectionToken.create<XmlComponent>(target, schema)
      : InjectionToken.create<XmlComponent>(target)

    // Register with Request scope - each render gets fresh instances
    registry.set(
      injectableToken,
      InjectableScope.Request,
      target,
      InjectableType.Class,
    )

    // Store token metadata on the class (same pattern as @Injectable)
    // @ts-expect-error - Adding metadata to class
    target[InjectableTokenMeta] = injectableToken

    // Mark as component for JSX runtime detection
    // @ts-expect-error - Adding metadata to class
    target[ComponentMeta] = true

    return target
  }
}

/**
 * Type guard to check if a class is a component
 */
export function isComponentClass(value: unknown): value is ComponentClass {
  return (
    typeof value === 'function' &&
    // @ts-expect-error - Checking metadata
    value[ComponentMeta] === true
  )
}
```

### 4. Updated `createElement` / `jsx`

The JSX runtime detects class components and creates `ClassComponentNode` instead of invoking them:

```typescript
// runtime/create-element.mts (updated)
import type { AnyXmlNode, AsyncXmlNode, ClassComponentNode, XmlNode } from '../types/xml-node.mjs'
import type { ComponentClass } from '../types/component.mjs'

import { isComponentClass } from '../decorators/component.decorator.mjs'
import { AsyncComponent, ClassComponent, Fragment } from '../types/xml-node.mjs'

type SyncComponent = (props: any) => XmlNode | AsyncXmlNode
type AsyncComponentFn = (props: any) => Promise<XmlNode | AsyncXmlNode>
type FunctionalComponent = SyncComponent | AsyncComponentFn
type ComponentType = FunctionalComponent | ComponentClass

function flattenChildren(children: any): AnyXmlNode[] {
  if (children == null || children === false) {
    return []
  }
  if (Array.isArray(children)) {
    return children.flat(Infinity).filter((c) => c != null && c !== false)
  }
  return [children]
}

/**
 * JSX automatic runtime function.
 * Used by the JSX transformer when jsxImportSource is set.
 * Children are passed as part of props.children.
 */
export function jsx(
  type: string | typeof Fragment | ComponentType,
  props: Record<string, unknown> | null,
): XmlNode | AsyncXmlNode | ClassComponentNode {
  const { children, ...restProps } = props ?? {}
  const flatChildren = flattenChildren(children)

  // Handle class components - create ClassComponentNode for later resolution
  if (isComponentClass(type)) {
    return {
      type: ClassComponent,
      componentClass: type,
      props: { ...restProps, children: flatChildren },
    }
  }

  // Handle function components (sync or async)
  if (typeof type === 'function') {
    const result = type({ ...restProps, children: flatChildren })

    // If component returns a Promise, wrap it in AsyncXmlNode
    if (result instanceof Promise) {
      return {
        type: AsyncComponent,
        promise: result,
      }
    }

    return result
  }

  return {
    type,
    props: restProps,
    children: flatChildren,
  }
}

/**
 * JSX automatic runtime function for static children.
 * Identical to jsx() for XML - React uses this for optimization hints.
 */
export const jsxs = jsx

/**
 * Classic createElement for manual usage.
 * Children are passed as rest arguments.
 */
export function createElement(
  type: string | typeof Fragment | ComponentType,
  props: Record<string, unknown> | null,
  ...children: any[]
): XmlNode | AsyncXmlNode | ClassComponentNode {
  const flatChildren = flattenChildren(children)

  // Handle class components - create ClassComponentNode for later resolution
  if (isComponentClass(type)) {
    return {
      type: ClassComponent,
      componentClass: type,
      props: { ...props, children: flatChildren },
    }
  }

  // Handle function components (sync or async)
  if (typeof type === 'function') {
    const result = type({ ...props, children: flatChildren })

    // If component returns a Promise, wrap it in AsyncXmlNode
    if (result instanceof Promise) {
      return {
        type: AsyncComponent,
        promise: result,
      }
    }

    return result
  }

  return {
    type,
    props: props ?? {},
    children: flatChildren,
  }
}

export { Fragment }
```

### 5. Updated `renderToXml`

The renderer accepts an optional container and resolves class components by calling `container.get(ComponentClass, props)`:

```typescript
// runtime/render-to-xml.mts (updated)
import type { Container } from '@navios/di'

import type {
  AnyXmlNode,
  AsyncXmlNode,
  CDataNode,
  ClassComponentNode,
  RawXmlNode,
} from '../types/xml-node.mjs'

import {
  AsyncComponent,
  CDataSymbol,
  ClassComponent,
  Fragment,
  RawXmlSymbol,
} from '../types/xml-node.mjs'

export interface RenderOptions {
  /** Include XML declaration (<?xml version="1.0"?>) - defaults to true */
  declaration?: boolean
  /** XML encoding, defaults to 'UTF-8' */
  encoding?: string
  /** Pretty print with indentation */
  pretty?: boolean
  /**
   * DI container for resolving class components.
   * Required if the tree contains any class components.
   */
  container?: Container
}

export class MissingContainerError extends Error {
  constructor(componentName: string) {
    super(
      `[@navios/adapter-xml] Cannot render class component "${componentName}" without a container. ` +
      `Pass a container to renderToXml options: renderToXml(node, { container })`
    )
    this.name = 'MissingContainerError'
  }
}

export async function renderToXml(
  node: AnyXmlNode,
  options: RenderOptions = {},
): Promise<string> {
  const { declaration = true, encoding = 'UTF-8', pretty = false, container } = options

  let xml = ''
  if (declaration) {
    xml += `<?xml version="1.0" encoding="${encoding}"?>`
    if (pretty) xml += '\n'
  }

  xml += await renderNode(node, pretty ? 0 : -1, container)
  return xml
}

async function renderNode(
  node: AnyXmlNode,
  indent: number,
  container: Container | undefined,
): Promise<string> {
  if (node == null) return ''
  if (typeof node === 'string') return escapeXml(node)
  if (typeof node === 'number') return String(node)

  // Handle class components - resolve via DI container
  if (isClassComponentNode(node)) {
    if (!container) {
      throw new MissingContainerError(node.componentClass.name)
    }

    // Resolve the component instance from the container, passing props as schema args
    // This validates props via Zod schema if defined on the component
    const instance = await container.get(node.componentClass, node.props)

    // Call render() - no arguments, props are already in the instance
    const result = instance.render()

    // Handle async render methods
    const resolved = result instanceof Promise ? await result : result

    // Recursively render the result
    return renderNode(resolved, indent, container)
  }

  // Handle async components - resolve the promise first
  if (isAsyncNode(node)) {
    const resolved = await node.promise
    return renderNode(resolved, indent, container)
  }

  // Handle CDATA nodes
  if (isCDataNode(node)) {
    return renderCData(node.content)
  }

  // Handle Raw XML nodes - no escaping
  if (isRawXmlNode(node)) {
    return node.content
  }

  const { type, props, children } = node

  if (type === Fragment) {
    const renderedChildren = await Promise.all(
      children.filter((c) => c != null).map((c) => renderNode(c, indent, container)),
    )
    return renderedChildren.join('')
  }

  const prefix = indent >= 0 ? '  '.repeat(indent) : ''
  const newline = indent >= 0 ? '\n' : ''

  const attrs = Object.entries(props)
    .filter(([_, v]) => v != null)
    .map(([k, v]) => ` ${k}="${escapeAttr(String(v))}"`)
    .join('')

  if (children.length === 0) {
    return `${prefix}<${type}${attrs}/>${newline}`
  }

  const childIndent = indent >= 0 ? indent + 1 : -1

  // Resolve all children (including async and class components) in parallel
  const resolvedChildren = await Promise.all(
    children.filter((c) => c != null).map((c) => renderNode(c, childIndent, container)),
  )
  const childContent = resolvedChildren.join('')

  // Check if children are simple (text, numbers, CDATA, or raw XML)
  const hasOnlySimpleContent = children.every(
    (c) =>
      typeof c === 'string' ||
      typeof c === 'number' ||
      isCDataNode(c) ||
      isRawXmlNode(c),
  )
  if (hasOnlySimpleContent) {
    return `${prefix}<${type}${attrs}>${childContent}</${type}>${newline}`
  }

  return `${prefix}<${type}${attrs}>${newline}${childContent}${prefix}</${type}>${newline}`
}

function isClassComponentNode(node: any): node is ClassComponentNode {
  return node && typeof node === 'object' && node.type === ClassComponent
}

function isAsyncNode(node: any): node is AsyncXmlNode {
  return node && typeof node === 'object' && node.type === AsyncComponent
}

function isCDataNode(node: any): node is CDataNode {
  return node && typeof node === 'object' && node.type === CDataSymbol
}

function isRawXmlNode(node: any): node is RawXmlNode {
  return node && typeof node === 'object' && node.type === RawXmlSymbol
}

/**
 * Renders content as CDATA section.
 * If content contains "]]>", splits into multiple CDATA sections.
 */
function renderCData(content: string): string {
  if (content.includes(']]>')) {
    const escaped = content.replace(/]]>/g, ']]]]><![CDATA[>')
    return `<![CDATA[${escaped}]]>`
  }
  return `<![CDATA[${content}]]>`
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
```

### 6. Updated XML Stream Adapter Service

The adapter passes the container to `renderToXml`:

```typescript
// adapters/xml-stream-adapter.service.mts (updated provideHandler section)

/**
 * Custom handler - renders JSX to XML and handles response for both Fastify and Bun
 */
provideHandler(
  controller: ClassType,
  handlerMetadata: HandlerMetadata<BaseXmlStreamConfig>,
): (context: RequestContextHolder, request: any, reply: any) => Promise<any> {
  const getters = this.prepareArguments(handlerMetadata)
  const config = handlerMetadata.config

  const formatArguments = async (request: any) => {
    const argument: Record<string, any> = {}
    const promises: Promise<void>[] = []
    for (const getter of getters) {
      const res = getter(argument, request)
      if (res instanceof Promise) {
        promises.push(res)
      }
    }
    await Promise.all(promises)
    return argument
  }

  const contentType = config.contentType ?? 'application/xml'
  const renderOptions = {
    declaration: config.xmlDeclaration ?? true,
    encoding: config.encoding ?? 'UTF-8',
  }

  return async (context: RequestContextHolder, request: any, reply: any) => {
    const controllerInstance = await this.container.get(controller)
    const argument = await formatArguments(request)

    // Call controller method - returns XmlNode (JSX), may contain async/class components
    const xmlNode: AnyXmlNode = await controllerInstance[handlerMetadata.classMethod](argument)

    // Render JSX to XML string (async - resolves all async and class components)
    // Pass the container for class component resolution
    const xml = await renderToXml(xmlNode, {
      ...renderOptions,
      container: this.container,
    })

    // Environment detection: Bun doesn't have reply
    const isBun = reply === undefined

    if (isBun) {
      const headers: Record<string, string> = {
        'Content-Type': contentType,
      }
      for (const [key, value] of Object.entries(handlerMetadata.headers)) {
        if (value != null) {
          headers[key] = String(value)
        }
      }
      return new Response(xml, {
        status: handlerMetadata.successStatusCode,
        headers,
      })
    } else {
      reply
        .status(handlerMetadata.successStatusCode)
        .header('Content-Type', contentType)
        .headers(handlerMetadata.headers)
        .send(xml)
    }
  }
}
```

---

## Task Breakdown

### Phase 1: Type Definitions

| # | Task | Status | Dependencies |
|---|------|--------|--------------|
| 1.1 | Add `ClassComponent` symbol and `ClassComponentNode` interface to `xml-node.mts` | ✅ Done | - |
| 1.2 | Create `types/component.mts` with `XmlComponent`, `ComponentClass` | ✅ Done | 1.1 |
| 1.3 | Export new types from `types/index.mts` | ✅ Done | 1.2 |

### Phase 2: Component Decorator

| # | Task | Status | Dependencies |
|---|------|--------|--------------|
| 2.1 | Create `decorators/component.decorator.mts` with `@Component()` decorator | ✅ Done | 1.2 |
| 2.2 | Implement `isComponentClass` type guard | ✅ Done | 2.1 |
| 2.3 | Export from `decorators/index.mts` | ✅ Done | 2.2 |
| 2.4 | Write unit tests for `@Component()` decorator | ✅ Done | 2.3 |

### Phase 3: JSX Runtime Updates

| # | Task | Status | Dependencies |
|---|------|--------|--------------|
| 3.1 | Update `jsx` function to detect class components | ✅ Done | 2.2 |
| 3.2 | Update `createElement` function to detect class components | ✅ Done | 2.2 |
| 3.3 | Write unit tests for class component JSX creation | ✅ Done | 3.2 |

### Phase 4: Renderer Updates

| # | Task | Status | Dependencies |
|---|------|--------|--------------|
| 4.1 | Add `container` option to `RenderOptions` | ✅ Done | 1.1 |
| 4.2 | Create `MissingContainerError` error class | ✅ Done | 4.1 |
| 4.3 | Implement class component resolution in `renderNode` | ✅ Done | 4.2 |
| 4.4 | Write unit tests for class component rendering | ✅ Done | 4.3 |
| 4.5 | Write unit tests for missing container error | ✅ Done | 4.3 |
| 4.6 | Write unit tests for props validation via schema | ✅ Done | 4.3 |

### Phase 5: Adapter Integration

| # | Task | Status | Dependencies |
|---|------|--------|--------------|
| 5.1 | Update `XmlStreamAdapterService.provideHandler` to pass container | ✅ Done | 4.3 |
| 5.2 | Write integration tests with real DI container | ✅ Done | 5.1 |

### Phase 6: Exports & Documentation

| # | Task | Status | Dependencies |
|---|------|--------|--------------|
| 6.1 | Export `Component`, `XmlComponent`, `ComponentClass` from package index | ✅ Done | 5.1 |
| 6.2 | Update package README with class component documentation | Pending | 6.1 |

---

## Usage Examples

### Basic Class Component (No Props)

```typescript
import { Component, XmlComponent } from '@navios/adapter-xml'
import { inject } from '@navios/di'

@Component()
class Footer implements XmlComponent {
  private config = inject(ConfigService)

  render() {
    return <footer>Copyright {this.config.copyrightYear}</footer>
  }
}

// Usage in JSX
<Footer />
```

### Class Component with Props Schema

```typescript
import { Component, XmlComponent } from '@navios/adapter-xml'
import { inject } from '@navios/di'
import { z } from 'zod/v4'

const GreetingSchema = z.object({
  name: z.string(),
  formal: z.boolean().optional().default(false),
})

@Component({ schema: GreetingSchema })
class Greeting implements XmlComponent {
  private logger = inject(Logger)

  constructor(private props: z.output<typeof GreetingSchema>) {}

  render() {
    this.logger.debug(`Rendering greeting for ${this.props.name}`)
    const prefix = this.props.formal ? 'Dear' : 'Hello'
    return <message>{prefix}, {this.props.name}!</message>
  }
}

// Usage - props are validated by Zod schema
<Greeting name="World" />
<Greeting name="Mr. Smith" formal />
```

### Class Component with Dependency Injection

```typescript
import { Component, XmlComponent } from '@navios/adapter-xml'
import { inject } from '@navios/di'
import { z } from 'zod/v4'

const UserCardSchema = z.object({
  userId: z.string(),
  children: z.array(z.any()).optional(),
})

@Component({ schema: UserCardSchema })
class UserCard implements XmlComponent {
  private userService = inject(UserService)
  private logger = inject(Logger)

  constructor(private props: z.output<typeof UserCardSchema>) {}

  async render() {
    this.logger.debug(`Rendering user card for ${this.props.userId}`)

    const user = await this.userService.findById(this.props.userId)

    return (
      <user id={user.id}>
        <name>{user.name}</name>
        <email>{user.email}</email>
        {this.props.children}
      </user>
    )
  }
}

// Usage
<UserCard userId="123">
  <status>active</status>
</UserCard>
```

### Mixing Functional and Class Components

```typescript
// Functional component - simple, no DI needed
function Header({ title }: { title: string }) {
  return <header>{title}</header>
}

// Class component with DI
const ItemListSchema = z.object({
  items: z.array(z.object({
    name: z.string(),
    price: z.number(),
  })),
})

@Component({ schema: ItemListSchema })
class ItemList implements XmlComponent {
  private formatter = inject(FormatterService)

  constructor(private props: z.output<typeof ItemListSchema>) {}

  render() {
    return (
      <items>
        {this.props.items.map(item => (
          <item>
            <name>{this.formatter.formatName(item.name)}</name>
            <price>{this.formatter.formatPrice(item.price)}</price>
          </item>
        ))}
      </items>
    )
  }
}

// Mixed usage in controller
@Controller('/api')
class CatalogController {
  @XmlStream(getCatalog)
  async getCatalog() {
    const items = await this.fetchItems()

    return (
      <catalog>
        <Header title="Product Catalog" />
        <ItemList items={items} />
      </catalog>
    )
  }
}
```

### Nested Class Components

```typescript
const CategorySectionSchema = z.object({
  categoryId: z.string(),
})

@Component({ schema: CategorySectionSchema })
class CategorySection implements XmlComponent {
  private categoryService = inject(CategoryService)

  constructor(private props: z.output<typeof CategorySectionSchema>) {}

  async render() {
    const category = await this.categoryService.findById(this.props.categoryId)

    return (
      <category name={category.name}>
        {category.products.map(product => (
          <ProductCard productId={product.id} />
        ))}
      </category>
    )
  }
}

const ProductCardSchema = z.object({
  productId: z.string(),
})

@Component({ schema: ProductCardSchema })
class ProductCard implements XmlComponent {
  private productService = inject(ProductService)
  private priceService = inject(PriceService)

  constructor(private props: z.output<typeof ProductCardSchema>) {}

  async render() {
    const product = await this.productService.findById(this.props.productId)
    const price = await this.priceService.getPrice(this.props.productId)

    return (
      <product>
        <name>{product.name}</name>
        <price currency="USD">{price}</price>
      </product>
    )
  }
}
```

### Manual Rendering with Container

```typescript
import { Container } from '@navios/di'
import { renderToXml, Component, XmlComponent } from '@navios/adapter-xml'
import { z } from 'zod/v4'

const AlertSchema = z.object({
  message: z.string(),
})

@Component({ schema: AlertSchema })
class Alert implements XmlComponent {
  private config = inject(ConfigService)

  constructor(private props: z.output<typeof AlertSchema>) {}

  render() {
    return (
      <alert level={this.config.defaultAlertLevel}>
        {this.props.message}
      </alert>
    )
  }
}

// Manual usage
const container = new Container()
const xml = await renderToXml(
  <Alert message="System ready" />,
  { container, declaration: false }
)
// Output: <alert level="info">System ready</alert>
```

### Error Case: Missing Container

```typescript
// This will throw MissingContainerError
const xml = await renderToXml(
  <Alert message="Hello" />,
  { declaration: false }
  // No container provided!
)
// Error: Cannot render class component "Alert" without a container.
```

### Error Case: Invalid Props (Schema Validation)

```typescript
const UserSchema = z.object({
  userId: z.string().uuid(),
  age: z.number().min(0),
})

@Component({ schema: UserSchema })
class UserBadge implements XmlComponent {
  constructor(private props: z.output<typeof UserSchema>) {}
  render() {
    return <badge>{this.props.userId}</badge>
  }
}

// This will throw Zod validation error
<UserBadge userId="not-a-uuid" age={-5} />
// ZodError: userId must be a valid UUID, age must be >= 0
```

---

## Files to Create/Modify

### New Files

- `packages/adapter-xml/src/types/component.mts`
- `packages/adapter-xml/src/decorators/component.decorator.mts`
- `packages/adapter-xml/src/decorators/component.decorator.spec.mts`
- `packages/adapter-xml/src/runtime/render-to-xml.class-components.spec.mts`

### Modified Files

- `packages/adapter-xml/src/types/xml-node.mts` - Add `ClassComponent` symbol and `ClassComponentNode`
- `packages/adapter-xml/src/types/index.mts` - Export new types
- `packages/adapter-xml/src/runtime/create-element.mts` - Detect class components
- `packages/adapter-xml/src/runtime/render-to-xml.mts` - Handle class component resolution
- `packages/adapter-xml/src/decorators/index.mts` - Export `Component`
- `packages/adapter-xml/src/adapters/xml-stream-adapter.service.mts` - Pass container
- `packages/adapter-xml/src/index.mts` - Export `Component`, `XmlComponent`, etc.

---

## Progress Tracking

**Overall Progress:** 18 / 19 tasks completed (95%)

| Phase | Progress | Status |
|-------|----------|--------|
| Phase 1: Type Definitions | 3/3 | ✅ Complete |
| Phase 2: Component Decorator | 4/4 | ✅ Complete |
| Phase 3: JSX Runtime Updates | 3/3 | ✅ Complete |
| Phase 4: Renderer Updates | 6/6 | ✅ Complete |
| Phase 5: Adapter Integration | 2/2 | ✅ Complete |
| Phase 6: Exports & Documentation | 1/2 | In Progress |

---

## Notes

- **Leverages @Injectable**: `@Component()` reuses the existing `@Injectable` infrastructure with Zod schema validation
- **Request Scope**: Class components are registered with `InjectableScope.Request` to ensure fresh instances per render pass
- **Props in Constructor**: Props are received in constructor (validated by Zod), making them available as `this.props`
- **Parameterless render()**: The `render()` method takes no arguments - cleaner API, props already available
- **Schema Validation**: Props are validated at resolution time by the DI container using `container.get(Component, props)`
- **Children Handling**: Children are included in props as `props.children` (array), passed through the schema
- **Async Render**: The `render()` method can be sync or async - the renderer handles both
- **Error Handling**: Clear error messages for:
  - `@Component` used on a class without `render()` method
  - Class component rendered without a container
  - Props failing Zod schema validation
