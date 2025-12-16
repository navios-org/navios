# JSX XML Stream Adapter Specification

## Overview

This specification describes a new adapter type that allows developers to create Stream endpoints that return XML responses rendered from JSX. The implementation will be in a new `@navios/adapter-xml` package containing the JSX runtime, decorator, and a runtime-agnostic adapter that detects the environment (Fastify/Bun) at runtime.

## Motivation

- Enable developers to return structured XML responses (e.g., RSS feeds, sitemap.xml, API responses in XML format) using familiar JSX syntax
- Leverage TypeScript's JSX type checking for XML generation
- Maintain consistency with existing Stream/Endpoint patterns in Navios
- Support XML namespaces with type-safe tag definitions using Zod schemas

## Architecture Decision

- **JSX Runtime & Decorator**: New `@navios/adapter-xml` package (separate adapter)
- **Response Mode**: Buffered response (v1)
- **Namespace Support**: `defineTag(name, propsSchema)` helper for creating type-safe namespaced tags
- **Runtime Agnostic**: Single adapter that detects Fastify vs Bun by checking if `reply` argument is defined

## Feasibility Analysis

The approach is **fully feasible** because:

1. **Handler signature**: `AbstractHttpHandlerAdapterInterface.provideHandler` returns:
   ```typescript
   (context: RequestContextHolder, request: any, reply: any) => Promise<any>
   ```

2. **Environment detection**:
   - Fastify: `reply` is a `FastifyReply` object
   - Bun: `reply` is `undefined`

3. **Response handling**:
   - Bun: Return `new Response(xml, { status, headers })`
   - Fastify: `reply.status(code).header('Content-Type', type).send(xml)`

4. **No modifications** to `adapter-fastify` or `adapter-bun` packages required

---

## Task Breakdown

### Phase 1: New `@navios/adapter-xml` Package Setup

| # | Task | Status | Dependencies | Package |
|---|------|--------|--------------|---------|
| 1.1 | Create package structure (`packages/adapter-xml`) | ⬜ Pending | - | `@navios/adapter-xml` |
| 1.2 | Configure `package.json` with dependencies | ⬜ Pending | 1.1 | `@navios/adapter-xml` |
| 1.3 | Configure `project.json` (nx) | ⬜ Pending | 1.1 | `@navios/adapter-xml` |
| 1.4 | Configure `tsconfig.json`, `tsconfig.lib.json`, `tsconfig.spec.json` | ⬜ Pending | 1.1 | `@navios/adapter-xml` |
| 1.5 | Configure `tsup.config.mts` for build | ⬜ Pending | 1.1 | `@navios/adapter-xml` |
| 1.6 | Configure `vitest.config.mts` for testing | ⬜ Pending | 1.1 | `@navios/adapter-xml` |

### Phase 2: JSX Runtime Implementation

| # | Task | Status | Dependencies | Package |
|---|------|--------|--------------|---------|
| 2.1 | Define `XmlNode`, `AsyncXmlNode`, `CDataNode`, `RawXmlNode`, `AnyXmlNode` types | ⬜ Pending | 1.1 | `@navios/adapter-xml` |
| 2.2 | Implement `createElement` function | ⬜ Pending | 2.1 | `@navios/adapter-xml` |
| 2.3 | Implement `Fragment` support | ⬜ Pending | 2.1 | `@navios/adapter-xml` |
| 2.4 | Implement async component detection in `createElement` | ⬜ Pending | 2.2 | `@navios/adapter-xml` |
| 2.5 | Implement `CData` component for CDATA sections | ⬜ Pending | 2.1 | `@navios/adapter-xml` |
| 2.6 | Implement `DangerouslyInsertRawXml` component for raw content | ⬜ Pending | 2.1 | `@navios/adapter-xml` |
| 2.7 | Implement async `renderToXml` serializer (with CDATA/RawXml support) | ⬜ Pending | 2.2-2.6 | `@navios/adapter-xml` |
| 2.8 | Add XML declaration/doctype support | ⬜ Pending | 2.7 | `@navios/adapter-xml` |
| 2.9 | Add proper XML escaping (content & attributes) | ⬜ Pending | 2.7 | `@navios/adapter-xml` |
| 2.10 | Export JSX runtime (`jsx-runtime.mts`) | ⬜ Pending | 2.2, 2.3 | `@navios/adapter-xml` |
| 2.11 | Write unit tests for JSX runtime (sync, async, CDATA, RawXml) | ⬜ Pending | 2.7 | `@navios/adapter-xml` |

### Phase 3: Tag Definition Helper (`defineTag`)

| # | Task | Status | Dependencies | Package |
|---|------|--------|--------------|---------|
| 3.1 | Define `TagDefinition` type with Zod schema support | ⬜ Pending | 2.1 | `@navios/adapter-xml` |
| 3.2 | Implement `defineTag(name, propsSchema)` function | ⬜ Pending | 3.1 | `@navios/adapter-xml` |
| 3.3 | Add namespace prefix support in tag names | ⬜ Pending | 3.2 | `@navios/adapter-xml` |
| 3.4 | Integrate with JSX type system | ⬜ Pending | 3.2 | `@navios/adapter-xml` |
| 3.5 | Write unit tests for `defineTag` | ⬜ Pending | 3.2 | `@navios/adapter-xml` |

### Phase 4: Core Token & Factory

| # | Task | Status | Dependencies | Package |
|---|------|--------|--------------|---------|
| 4.1 | Create `XmlStreamAdapterToken` injection token | ⬜ Pending | - | `@navios/core` |
| 4.2 | Create `XmlStreamAdapterFactory` | ⬜ Pending | 4.1 | `@navios/core` |
| 4.3 | Export token and factory from core index | ⬜ Pending | 4.1, 4.2 | `@navios/core` |

### Phase 5: XML Stream Adapter (Runtime Agnostic)

| # | Task | Status | Dependencies | Package |
|---|------|--------|--------------|---------|
| 5.1 | Define `BaseXmlStreamConfig` type | ⬜ Pending | 1.1 | `@navios/adapter-xml` |
| 5.2 | Create `XmlStreamAdapterService` (implements `AbstractHttpHandlerAdapterInterface`) | ⬜ Pending | 2.5, 4.1, 5.1 | `@navios/adapter-xml` |
| 5.3 | Inject `StreamAdapterToken` and proxy `hasSchema`, `prepareArguments`, `provideSchema` to it | ⬜ Pending | 5.2 | `@navios/adapter-xml` |
| 5.4 | Implement `provideHandler` with XML rendering and environment detection | ⬜ Pending | 5.2, 5.3 | `@navios/adapter-xml` |
| 5.5 | Create `defineXmlEnvironment()` function | ⬜ Pending | 5.2, 4.1 | `@navios/adapter-xml` |
| 5.6 | Create `@XmlStream` decorator | ⬜ Pending | 5.1, 4.1 | `@navios/adapter-xml` |
| 5.7 | Create `declareXmlStream` builder function | ⬜ Pending | 5.1 | `@navios/adapter-xml` |
| 5.8 | Export all public APIs from package index | ⬜ Pending | 5.1-5.7 | `@navios/adapter-xml` |
| 5.9 | Write unit tests for adapter | ⬜ Pending | 5.4 | `@navios/adapter-xml` |

### Phase 6: Documentation & Examples

| # | Task | Status | Dependencies | Package |
|---|------|--------|--------------|---------|
| 6.1 | Add README for `@navios/adapter-xml` | ⬜ Pending | 5.7 | `@navios/adapter-xml` |
| 6.2 | Create example RSS feed controller | ⬜ Pending | 5.7 | examples |
| 6.3 | Create example sitemap.xml controller | ⬜ Pending | 5.7 | examples |
| 6.4 | Create example with namespaced tags (Atom feed) | ⬜ Pending | 3.2, 5.7 | examples |

---

## Technical Design

### 1. Package Structure (`@navios/adapter-xml`)

```
packages/adapter-xml/
├── src/
│   ├── index.mts                    # Public exports
│   ├── jsx-runtime.mts              # JSX runtime entry (for tsconfig)
│   ├── jsx-dev-runtime.mts          # Dev runtime (same as jsx-runtime)
│   ├── define-environment.mts       # defineXmlEnvironment()
│   ├── types/
│   │   ├── index.mts
│   │   ├── xml-node.mts             # XmlNode, CDataNode, RawXmlNode types
│   │   ├── config.mts               # BaseXmlStreamConfig
│   │   └── jsx.d.ts                 # JSX namespace declarations
│   ├── runtime/
│   │   ├── index.mts
│   │   ├── create-element.mts
│   │   ├── fragment.mts
│   │   ├── special-nodes.mts        # CData, DangerouslyInsertRawXml components
│   │   └── render-to-xml.mts
│   ├── tags/
│   │   ├── index.mts
│   │   └── define-tag.mts           # defineTag helper
│   ├── decorators/
│   │   ├── index.mts
│   │   └── xml-stream.decorator.mts
│   ├── adapters/
│   │   ├── index.mts
│   │   └── xml-stream-adapter.service.mts
│   └── handlers/
│       ├── index.mts
│       └── xml-stream.mts           # declareXmlStream builder
├── package.json
├── project.json
├── tsconfig.json
├── tsconfig.lib.json
├── tsconfig.spec.json
├── tsup.config.mts
└── vitest.config.mts
```

### 1.1 Package Configuration Files

**package.json:**
```json
{
  "name": "@navios/adapter-xml",
  "version": "0.1.0",
  "author": {
    "name": "Oleksandr Hanzha",
    "email": "alex@granted.name"
  },
  "repository": {
    "directory": "packages/adapter-xml",
    "type": "git",
    "url": "https://github.com/Arilas/navios.git"
  },
  "license": "MIT",
  "peerDependencies": {
    "@navios/core": "workspace:^",
    "@navios/di": "workspace:^",
    "@navios/builder": "workspace:^"
  },
  "typings": "./lib/index.d.mts",
  "main": "./lib/index.js",
  "module": "./lib/index.mjs",
  "exports": {
    ".": {
      "import": {
        "types": "./lib/index.d.mts",
        "default": "./lib/index.mjs"
      },
      "require": {
        "types": "./lib/index.d.ts",
        "default": "./lib/index.js"
      }
    },
    "./jsx-runtime": {
      "import": {
        "types": "./lib/jsx-runtime.d.mts",
        "default": "./lib/jsx-runtime.mjs"
      },
      "require": {
        "types": "./lib/jsx-runtime.d.ts",
        "default": "./lib/jsx-runtime.js"
      }
    },
    "./jsx-dev-runtime": {
      "import": {
        "types": "./lib/jsx-dev-runtime.d.mts",
        "default": "./lib/jsx-dev-runtime.mjs"
      },
      "require": {
        "types": "./lib/jsx-dev-runtime.d.ts",
        "default": "./lib/jsx-dev-runtime.js"
      }
    }
  },
  "devDependencies": {
    "@navios/core": "workspace:^",
    "@navios/di": "workspace:^",
    "@navios/builder": "workspace:^",
    "tsx": "^4.21.0",
    "typescript": "^5.9.3",
    "vitest": "^3.2.4"
  },
  "dependencies": {
    "zod": "^4.1.13"
  }
}
```

**project.json (nx):**
```json
{
  "name": "@navios/adapter-xml",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "packages/adapter-xml/src",
  "prefix": "adapter-xml",
  "tags": [],
  "projectType": "library",
  "targets": {
    "check": {
      "executor": "nx:run-commands",
      "outputs": ["{projectRoot}/dist"],
      "inputs": [
        "^projectSources",
        "projectSources",
        "{projectRoot}/tsconfig.json",
        "{projectRoot}/tsconfig.lib.json"
      ],
      "options": {
        "command": ["tsc -b"],
        "cwd": "packages/adapter-xml"
      }
    },
    "lint": {
      "executor": "nx:run-commands",
      "inputs": ["^projectSources", "project"],
      "options": {
        "command": "oxlint --fix",
        "cwd": "packages/adapter-xml"
      }
    },
    "test:ci": {
      "executor": "nx:run-commands",
      "inputs": ["^projectSources", "project"],
      "options": {
        "command": "vitest run",
        "cwd": "packages/adapter-xml"
      }
    },
    "build": {
      "executor": "nx:run-commands",
      "inputs": ["projectSources", "{projectRoot}/tsup.config.mts"],
      "outputs": ["{projectRoot}/lib"],
      "dependsOn": ["check", "test:ci", "lint"],
      "options": {
        "command": "tsup",
        "cwd": "packages/adapter-xml"
      }
    },
    "publish": {
      "executor": "nx:run-commands",
      "dependsOn": ["build"],
      "options": {
        "command": "yarn npm publish --access public",
        "cwd": "packages/adapter-xml"
      }
    }
  }
}
```

**tsup.config.mts:**
```typescript
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.mts', 'src/jsx-runtime.mts', 'src/jsx-dev-runtime.mts'],
  outDir: 'lib',
  format: ['esm', 'cjs'],
  clean: true,
  tsconfig: 'tsconfig.lib.json',
  treeshake: 'smallest',
  sourcemap: true,
  platform: 'node',
  experimentalDts: true,
})
```

**tsconfig.json:**
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "module": "Node18",
    "outDir": "dist"
  },
  "references": [
    { "path": "./tsconfig.lib.json" },
    { "path": "./tsconfig.spec.json" },
    { "path": "../core" },
    { "path": "../di" },
    { "path": "../builder" }
  ]
}
```

**tsconfig.lib.json:**
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist"
  },
  "include": ["src/**/*.mts"],
  "exclude": ["src/**/*.spec.mts", "src/**/__tests__/**"]
}
```

**vitest.config.mts:**
```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.mts', 'src/**/__tests__/*.spec.mts'],
  },
})
```

### 2. Type Definitions

```typescript
// types/xml-node.mts
export const Fragment = Symbol.for('xml.fragment')
export const AsyncComponent = Symbol.for('xml.async')
export const CDataSymbol = Symbol.for('xml.cdata')
export const RawXmlSymbol = Symbol.for('xml.raw')

export interface XmlNode {
  type: string | typeof Fragment
  props: Record<string, unknown>
  children: (XmlNode | string | number | null | undefined)[]
}

/** Represents an async component that needs to be resolved before rendering */
export interface AsyncXmlNode {
  type: typeof AsyncComponent
  promise: Promise<XmlNode | string | number | null>
}

/** Represents a CDATA section - content is wrapped in <![CDATA[...]]> */
export interface CDataNode {
  type: typeof CDataSymbol
  content: string
}

/** Represents raw XML content - inserted without any escaping or wrapping */
export interface RawXmlNode {
  type: typeof RawXmlSymbol
  content: string
}

/** Union type for all possible node types */
export type AnyXmlNode = XmlNode | AsyncXmlNode | CDataNode | RawXmlNode | string | number | null | undefined

// types/config.mts
import type { BaseStreamConfig, HttpMethod } from '@navios/builder'

export interface BaseXmlStreamConfig<
  Method extends HttpMethod = HttpMethod,
  Url extends string = string,
  QuerySchema = undefined,
  RequestSchema = undefined,
> extends BaseStreamConfig<Method, Url, QuerySchema, RequestSchema> {
  /** Content-Type header, defaults to 'application/xml' */
  contentType?: 'application/xml' | 'text/xml' | 'application/rss+xml' | 'application/atom+xml'
  /** Include XML declaration (<?xml version="1.0"?>) - defaults to true */
  xmlDeclaration?: boolean
  /** XML encoding, defaults to 'UTF-8' */
  encoding?: string
}
```

### 3. `defineTag` Helper

```typescript
// tags/define-tag.mts
import type { ZodObject, ZodRawShape, z } from 'zod/v4'
import type { XmlNode } from '../types/xml-node.mjs'

export interface TagComponent<Props extends Record<string, unknown>> {
  (props: Props & { children?: XmlNode['children'] }): XmlNode
  tagName: string
}

export function defineTag<T extends ZodRawShape>(
  name: string,
  propsSchema?: ZodObject<T>,
): TagComponent<T extends ZodRawShape ? z.infer<ZodObject<T>> : Record<string, never>> {
  const component = (props: any): XmlNode => {
    const { children, ...rest } = props ?? {}

    // Validate props if schema provided
    if (propsSchema) {
      propsSchema.parse(rest)
    }

    return {
      type: name,
      props: rest,
      children: Array.isArray(children) ? children : children ? [children] : [],
    }
  }

  component.tagName = name
  return component as any
}
```

**Usage:**

```typescript
import { defineTag } from '@navios/adapter-xml'
import { z } from 'zod/v4'

// Simple tag
const item = defineTag('item')

// Namespaced tag with Zod validation
const atomLink = defineTag('atom:link', z.object({
  href: z.string().url(),
  rel: z.enum(['self', 'alternate', 'enclosure']),
  type: z.string().optional(),
}))

// In JSX
<atomLink href="https://example.com/feed" rel="self" type="application/rss+xml" />
```

### 3.1 CDATA and Raw XML Components

For inserting content that should not be escaped:

```typescript
// runtime/special-nodes.mts
import type { CDataNode, RawXmlNode } from '../types/xml-node.mjs'
import { CDataSymbol, RawXmlSymbol } from '../types/xml-node.mjs'

/**
 * CDATA component - wraps content in <![CDATA[...]]>
 * Use for text content that may contain characters like < > &
 * that would otherwise need escaping.
 *
 * Note: If content contains "]]>", it will be split into multiple CDATA sections.
 */
export function CData({ children }: { children: string }): CDataNode {
  return {
    type: CDataSymbol,
    content: String(children),
  }
}

/**
 * DangerouslyInsertRawXml - inserts raw XML/HTML without any escaping or wrapping
 *
 * ⚠️ WARNING: This bypasses all XML escaping. Only use with trusted content!
 * Use cases:
 * - Pre-rendered XML fragments
 * - HTML content in RSS/Atom feeds (in description/content:encoded)
 * - Including XML from external sources that's already valid
 */
export function DangerouslyInsertRawXml({ children }: { children: string }): RawXmlNode {
  return {
    type: RawXmlSymbol,
    content: String(children),
  }
}
```

**Usage:**

```typescript
import { CData, DangerouslyInsertRawXml } from '@navios/adapter-xml'

// CDATA - for text that might contain special characters
const description = defineTag('description')

<description>
  <CData>{`This content has <special> characters & more`}</CData>
</description>
// Output: <description><![CDATA[This content has <special> characters & more]]></description>

// Raw XML - for pre-rendered HTML/XML content (use with caution!)
const contentEncoded = defineTag('content:encoded')

const htmlContent = '<p>Hello <strong>World</strong></p>'
<contentEncoded>
  <DangerouslyInsertRawXml>{htmlContent}</DangerouslyInsertRawXml>
</contentEncoded>
// Output: <content:encoded><p>Hello <strong>World</strong></p></content:encoded>

// Combined example - RSS item with HTML description
<item>
  <title>{post.title}</title>
  <link>{post.url}</link>
  <description>
    <CData>{post.excerpt}</CData>
  </description>
  <contentEncoded>
    <DangerouslyInsertRawXml>{post.htmlContent}</DangerouslyInsertRawXml>
  </contentEncoded>
</item>
```

### 4. JSX Runtime

```typescript
// runtime/create-element.mts
import type { XmlNode, AsyncXmlNode, AnyXmlNode } from '../types/xml-node.mjs'
import { Fragment, AsyncComponent } from '../types/xml-node.mjs'

type SyncComponent = (props: any) => XmlNode
type AsyncComponentFn = (props: any) => Promise<XmlNode>
type ComponentType = SyncComponent | AsyncComponentFn

export function createElement(
  type: string | typeof Fragment | ComponentType,
  props: Record<string, unknown> | null,
  ...children: any[]
): XmlNode | AsyncXmlNode {
  // Handle function components (sync or async)
  if (typeof type === 'function') {
    const result = type({ ...props, children: flattenChildren(children) })

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
    children: flattenChildren(children),
  }
}

function flattenChildren(children: any[]): AnyXmlNode[] {
  return children.flat(Infinity).filter(c => c != null && c !== false)
}

// jsx-runtime.mts
export { createElement as jsx, createElement as jsxs } from './runtime/create-element.mjs'
export { Fragment } from './types/xml-node.mjs'
```

### 5. XML Serializer (Async)

The serializer is async to support async components. It resolves all promises before rendering, and handles special nodes (CDATA, RawXml).

```typescript
// runtime/render-to-xml.mts
import type { XmlNode, AsyncXmlNode, CDataNode, RawXmlNode, AnyXmlNode } from '../types/xml-node.mjs'
import { Fragment, AsyncComponent, CDataSymbol, RawXmlSymbol } from '../types/xml-node.mjs'

export interface RenderOptions {
  declaration?: boolean
  encoding?: string
  pretty?: boolean
}

export async function renderToXml(node: AnyXmlNode, options: RenderOptions = {}): Promise<string> {
  const { declaration = true, encoding = 'UTF-8', pretty = false } = options

  let xml = ''
  if (declaration) {
    xml += `<?xml version="1.0" encoding="${encoding}"?>`
    if (pretty) xml += '\n'
  }

  xml += await renderNode(node, pretty ? 0 : -1)
  return xml
}

async function renderNode(node: AnyXmlNode, indent: number): Promise<string> {
  if (node == null) return ''
  if (typeof node === 'string') return escapeXml(node)
  if (typeof node === 'number') return String(node)

  // Handle async components - resolve the promise first
  if (isAsyncNode(node)) {
    const resolved = await node.promise
    return renderNode(resolved, indent)
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
      children.filter(c => c != null).map(c => renderNode(c, indent))
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

  // Resolve all children (including async ones) in parallel
  const resolvedChildren = await Promise.all(
    children.filter(c => c != null).map(c => renderNode(c, childIndent))
  )
  const childContent = resolvedChildren.join('')

  // Check if children are simple (text, numbers, CDATA, or raw XML)
  const hasOnlySimpleContent = children.every(
    c => typeof c === 'string' || typeof c === 'number' || isCDataNode(c) || isRawXmlNode(c)
  )
  if (hasOnlySimpleContent) {
    return `${prefix}<${type}${attrs}>${childContent}</${type}>${newline}`
  }

  return `${prefix}<${type}${attrs}>${newline}${childContent}${prefix}</${type}>${newline}`
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
  // Handle the edge case where content contains "]]>"
  // Split and create multiple CDATA sections
  if (content.includes(']]>')) {
    return content
      .split(']]>')
      .map((part, i, arr) => (i < arr.length - 1 ? `<![CDATA[${part}]]]]><![CDATA[>` : `<![CDATA[${part}]]>`))
      .join('')
  }
  return `<![CDATA[${content}]]>`
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
```

### 6. Runtime-Agnostic Adapter Service

This is the key component - a single adapter that works with both Fastify and Bun. It **proxies base methods** (`hasSchema`, `prepareArguments`, `provideSchema`) to the underlying `StreamAdapterToken` to avoid reimplementing logic. Only `provideHandler` contains custom XML rendering logic.

```typescript
// adapters/xml-stream-adapter.service.mts
import type { AbstractHttpHandlerAdapterInterface, HandlerMetadata, StreamAdapterToken } from '@navios/core'
import type { ClassType, RequestContextHolder } from '@navios/di'

import { Container, inject, Injectable, InjectionToken } from '@navios/di'

import type { BaseXmlStreamConfig } from '../types/config.mjs'
import type { AnyXmlNode } from '../types/xml-node.mjs'

import { renderToXml } from '../runtime/render-to-xml.mjs'

export const XmlStreamAdapterToken = InjectionToken.create<XmlStreamAdapterService>(
  Symbol.for('XmlStreamAdapterService'),
)

@Injectable({
  token: XmlStreamAdapterToken,
})
export class XmlStreamAdapterService implements AbstractHttpHandlerAdapterInterface {
  protected container = inject(Container)
  /** Base stream adapter - we proxy hasSchema, prepareArguments, provideSchema to it */
  protected streamAdapter = inject(StreamAdapterToken)

  /**
   * Proxy to base StreamAdapter - reuses existing schema detection logic
   */
  hasSchema(handlerMetadata: HandlerMetadata<BaseXmlStreamConfig>): boolean {
    return this.streamAdapter.hasSchema(handlerMetadata)
  }

  /**
   * Proxy to base StreamAdapter - reuses existing argument preparation logic
   * (handles querySchema, requestSchema, URL params for both Fastify and Bun)
   */
  prepareArguments(handlerMetadata: HandlerMetadata<BaseXmlStreamConfig>) {
    return this.streamAdapter.prepareArguments(handlerMetadata)
  }

  /**
   * Proxy to base StreamAdapter - reuses existing schema generation for Fastify validation
   */
  provideSchema(handlerMetadata: HandlerMetadata<BaseXmlStreamConfig>): Record<string, any> {
    return this.streamAdapter.provideSchema(handlerMetadata)
  }

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

      // Call controller method - returns XmlNode (JSX), may contain async components
      const xmlNode: AnyXmlNode = await controllerInstance[handlerMetadata.classMethod](argument)

      // Render JSX to XML string (async - resolves all async components)
      const xml = await renderToXml(xmlNode, renderOptions)

      // Environment detection: Bun doesn't have reply
      const isBun = reply === undefined

      if (isBun) {
        // Bun: return Response object
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
        // Fastify: use reply object
        reply
          .status(handlerMetadata.successStatusCode)
          .header('Content-Type', contentType)
          .headers(handlerMetadata.headers)
          .send(xml)
      }
    }
  }
}
```

### 7. Core Token & Factory

```typescript
// @navios/core - tokens/xml-stream-adapter.token.mts
import { InjectionToken } from '@navios/di'
import type { AbstractHttpHandlerAdapterInterface } from '../interfaces/index.mjs'

export const XmlStreamAdapterToken = InjectionToken.create<AbstractHttpHandlerAdapterInterface>(
  'XmlStreamAdapterToken',
)

// @navios/core - factories/xml-stream-adapter.factory.mts
import type { FactoryContext, InjectionToken } from '@navios/di'
import { Factory, inject } from '@navios/di'
import { NaviosEnvironment } from '../navios.environment.mjs'
import { XmlStreamAdapterToken } from '../tokens/index.mjs'

@Factory({
  token: XmlStreamAdapterToken,
})
export class XmlStreamAdapterFactory {
  private readonly environment = inject(NaviosEnvironment)

  create(ctx: FactoryContext) {
    const service = this.environment.getHttpToken(XmlStreamAdapterToken)
    if (!service) {
      throw new Error('XmlStreamAdapterToken service not found in environment')
    }
    return ctx.inject(service as InjectionToken<any, undefined>)
  }
}
```

### 8. Define XML Environment

The `defineXmlEnvironment` function registers the XML adapter token mapping. It should be merged with the base environment (Fastify or Bun):

```typescript
// define-environment.mts
import type { AnyInjectableType } from '@navios/di'

import { XmlStreamAdapterToken } from '@navios/core'
import { InjectionToken } from '@navios/di'

import { XmlStreamAdapterService } from './adapters/xml-stream-adapter.service.mjs'

export function defineXmlEnvironment() {
  const httpTokens = new Map<InjectionToken<any, undefined>, AnyInjectableType>([
    [XmlStreamAdapterToken, XmlStreamAdapterService],
  ])
  return {
    httpTokens,
  }
}
```

**Usage with Fastify:**
```typescript
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { defineXmlEnvironment } from '@navios/adapter-xml'
import { NaviosFactory } from '@navios/core'

import { AppModule } from './app.module.mjs'

async function bootstrap() {
  const fastifyEnv = defineFastifyEnvironment()
  const xmlEnv = defineXmlEnvironment()

  // Merge environments
  const mergedEnv = {
    httpTokens: new Map([
      ...fastifyEnv.httpTokens,
      ...xmlEnv.httpTokens,
    ]),
  }

  const app = await NaviosFactory.create(AppModule, {
    adapter: mergedEnv,
  })

  await app.init()
  await app.listen({ port: 3000 })
}
```

**Usage with Bun:**
```typescript
import { defineBunEnvironment } from '@navios/adapter-bun'
import { defineXmlEnvironment } from '@navios/adapter-xml'
import { NaviosFactory } from '@navios/core'

import { AppModule } from './app.module.mjs'

async function bootstrap() {
  const bunEnv = defineBunEnvironment()
  const xmlEnv = defineXmlEnvironment()

  const mergedEnv = {
    httpTokens: new Map([
      ...bunEnv.httpTokens,
      ...xmlEnv.httpTokens,
    ]),
  }

  const app = await NaviosFactory.create(AppModule, {
    adapter: mergedEnv,
  })

  await app.init()
  await app.listen({ port: 3000 })
}
```

### 8. Decorator

```typescript
// decorators/xml-stream.decorator.mts
import type { EndpointFunctionArgs, HttpMethod, Util_FlatObject } from '@navios/builder'
import type { ZodObject, ZodType } from 'zod/v4'

import { getEndpointMetadata } from '@navios/core'
import { XmlStreamAdapterToken } from '@navios/core'

import type { BaseXmlStreamConfig } from '../types/config.mjs'

export function XmlStream<
  Method extends HttpMethod = HttpMethod,
  Url extends string = string,
  QuerySchema = undefined,
  RequestSchema = ZodType,
>(endpoint: {
  config: BaseXmlStreamConfig<Method, Url, QuerySchema, RequestSchema>
}) {
  return (
    target: (
      params: QuerySchema extends ZodObject
        ? RequestSchema extends ZodType
          ? Util_FlatObject<EndpointFunctionArgs<Url, QuerySchema, RequestSchema, true>>
          : Util_FlatObject<EndpointFunctionArgs<Url, QuerySchema, undefined, true>>
        : RequestSchema extends ZodType
          ? Util_FlatObject<EndpointFunctionArgs<Url, undefined, RequestSchema, true>>
          : Util_FlatObject<EndpointFunctionArgs<Url, undefined, undefined, true>>,
    ) => Promise<any>, // Returns XmlNode
    context: ClassMethodDecoratorContext,
  ) => {
    if (typeof target !== 'function') {
      throw new Error('[Navios] XmlStream decorator can only be used on functions.')
    }
    if (context.kind !== 'method') {
      throw new Error('[Navios] XmlStream decorator can only be used on methods.')
    }

    const config = endpoint.config
    if (context.metadata) {
      const endpointMetadata = getEndpointMetadata<BaseXmlStreamConfig>(target, context)
      if (endpointMetadata.config && endpointMetadata.config.url) {
        throw new Error(
          `[Navios] Endpoint ${config.method} ${config.url} already exists.`,
        )
      }
      // @ts-expect-error We don't need to set correctly in the metadata
      endpointMetadata.config = config
      endpointMetadata.adapterToken = XmlStreamAdapterToken
      endpointMetadata.classMethod = target.name
      endpointMetadata.httpMethod = config.method
      endpointMetadata.url = config.url
    }
    return target
  }
}
```

---

## Usage Example

```typescript
// api.ts
import { declareXmlStream } from '@navios/adapter-xml'

export const getRssFeed = declareXmlStream({
  method: 'GET',
  url: '/feed.xml',
  querySchema: undefined,
  requestSchema: undefined,
  contentType: 'application/rss+xml',
  xmlDeclaration: true,
})

// tags.ts
import { defineTag } from '@navios/adapter-xml'
import { z } from 'zod/v4'

export const rss = defineTag('rss', z.object({
  version: z.literal('2.0'),
  'xmlns:atom': z.string().optional(),
}))
export const channel = defineTag('channel')
export const title = defineTag('title')
export const link = defineTag('link')
export const item = defineTag('item')
export const atomLink = defineTag('atom:link', z.object({
  href: z.string(),
  rel: z.string(),
  type: z.string().optional(),
}))

// feed.controller.tsx
import { Controller } from '@navios/core'
import { XmlStream } from '@navios/adapter-xml'
import { getRssFeed } from './api'
import { rss, channel, title, link, item, atomLink } from './tags'

@Controller('/api')
export class FeedController {
  @XmlStream(getRssFeed)
  async getFeed() {
    const posts = await this.fetchPosts()

    return (
      <rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
        <channel>
          <title>My Blog</title>
          <link>https://example.com</link>
          <atomLink href="https://example.com/feed.xml" rel="self" type="application/rss+xml" />
          {posts.map(post => (
            <item>
              <title>{post.title}</title>
              <link>{post.url}</link>
            </item>
          ))}
        </channel>
      </rss>
    )
  }
}
```

**tsconfig.json:**
```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@navios/adapter-xml"
  }
}
```

### Async Components Example

Async components allow fetching data within JSX components. They are resolved in parallel during rendering.

```typescript
// components/async-item.tsx
import { item, title, link, pubDate, description } from './tags'

interface PostItemProps {
  postId: string
}

// Async component - fetches data and returns JSX
async function PostItem({ postId }: PostItemProps) {
  const post = await fetchPostById(postId)

  return (
    <item>
      <title>{post.title}</title>
      <link>{post.url}</link>
      <pubDate>{post.publishedAt.toUTCString()}</pubDate>
      <description>{post.excerpt}</description>
    </item>
  )
}

// Async component that fetches related posts
async function RelatedPosts({ categoryId }: { categoryId: string }) {
  const posts = await fetchPostsByCategory(categoryId)

  return (
    <>
      {posts.map(post => (
        <PostItem postId={post.id} />
      ))}
    </>
  )
}

// feed.controller.tsx - using async components
@Controller('/api')
export class FeedController {
  @XmlStream(getRssFeed)
  async getFeed() {
    const categories = await this.getCategories()

    return (
      <rss version="2.0">
        <channel>
          <title>My Blog</title>
          <link>https://example.com</link>
          {/* Async components are resolved in parallel */}
          {categories.map(cat => (
            <RelatedPosts categoryId={cat.id} />
          ))}
        </channel>
      </rss>
    )
  }
}
```

**Key features:**
- Async components return `Promise<XmlNode>`
- Multiple async components at the same level are resolved in parallel via `Promise.all`
- Nested async components are supported
- Works with both sync and async components in the same tree

---

## Files to Create/Modify

### New Package: `@navios/adapter-xml`

**Config files:**
- `packages/adapter-xml/package.json`
- `packages/adapter-xml/project.json`
- `packages/adapter-xml/tsconfig.json`
- `packages/adapter-xml/tsconfig.lib.json`
- `packages/adapter-xml/tsconfig.spec.json`
- `packages/adapter-xml/tsup.config.mts`
- `packages/adapter-xml/vitest.config.mts`

**Source files:**
- `packages/adapter-xml/src/index.mts`
- `packages/adapter-xml/src/jsx-runtime.mts`
- `packages/adapter-xml/src/jsx-dev-runtime.mts`
- `packages/adapter-xml/src/define-environment.mts`
- `packages/adapter-xml/src/types/index.mts`
- `packages/adapter-xml/src/types/xml-node.mts`
- `packages/adapter-xml/src/types/config.mts`
- `packages/adapter-xml/src/types/jsx.d.ts`
- `packages/adapter-xml/src/runtime/index.mts`
- `packages/adapter-xml/src/runtime/create-element.mts`
- `packages/adapter-xml/src/runtime/fragment.mts`
- `packages/adapter-xml/src/runtime/special-nodes.mts` (CData, DangerouslyInsertRawXml)
- `packages/adapter-xml/src/runtime/render-to-xml.mts`
- `packages/adapter-xml/src/tags/index.mts`
- `packages/adapter-xml/src/tags/define-tag.mts`
- `packages/adapter-xml/src/decorators/index.mts`
- `packages/adapter-xml/src/decorators/xml-stream.decorator.mts`
- `packages/adapter-xml/src/adapters/index.mts`
- `packages/adapter-xml/src/adapters/xml-stream-adapter.service.mts`
- `packages/adapter-xml/src/handlers/index.mts`
- `packages/adapter-xml/src/handlers/xml-stream.mts`

### Modify: `@navios/core` (minimal changes)
- `packages/core/src/tokens/xml-stream-adapter.token.mts` (new)
- `packages/core/src/tokens/index.mts` (export)
- `packages/core/src/factories/xml-stream-adapter.factory.mts` (new)
- `packages/core/src/factories/index.mts` (export)

### NO changes to:
- ~~`@navios/adapter-fastify`~~
- ~~`@navios/adapter-bun`~~

---

## Progress Tracking

**Overall Progress:** 0 / 36 tasks completed (0%)

| Phase | Progress | Status |
|-------|----------|--------|
| Phase 1: Package Setup | 0/6 | ⬜ Not Started |
| Phase 2: JSX Runtime | 0/11 | ⬜ Not Started |
| Phase 3: defineTag Helper | 0/5 | ⬜ Not Started |
| Phase 4: Core Token & Factory | 0/3 | ⬜ Not Started |
| Phase 5: XML Stream Adapter | 0/9 | ⬜ Not Started |
| Phase 6: Documentation | 0/4 | ⬜ Not Started |

---

## Notes

- **Runtime agnostic**: Single adapter detects Fastify vs Bun by checking `reply === undefined`
- **No changes** to adapter-fastify or adapter-bun packages
- **Environment merging**: Use `defineXmlEnvironment()` and merge with base adapter (Fastify/Bun)
- **Proxy pattern**: `XmlStreamAdapterService` injects `StreamAdapterToken` and proxies `hasSchema`, `prepareArguments`, and `provideSchema` to it, avoiding reimplementation. Only `provideHandler` contains custom XML-specific logic.
- **Async components**: Components can be async functions that return `Promise<XmlNode>`, resolved in parallel during rendering
- **CDATA support**: `<CData>` component wraps content in `<![CDATA[...]]>` sections, properly handling the edge case where content contains `]]>`
- **Raw XML support**: `<DangerouslyInsertRawXml>` component inserts content without any escaping - use only with trusted content
- The `defineTag` helper provides type-safe XML tag creation with Zod validation
- Namespaced tags (e.g., `atom:link`) are supported via the tag name string
- JSX automatic transform requires `jsxImportSource` in tsconfig
- Buffered response is sufficient for v1; streaming can be added later
