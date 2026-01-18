import {
  globalRegistry,
  InjectableScope,
  InjectableTokenMeta,
  InjectableType,
  InjectionToken,
} from '@navios/core'

import type { Registry } from '@navios/core'
import type { z, ZodObject, ZodRawShape } from 'zod/v4'

import type { ComponentClass, XmlComponent } from '../types/component.mjs'

export const ComponentMeta = Symbol.for('xml.component.meta')

/**
 * Decorator for class-based XML components with dependency injection support.
 *
 * Class components must implement the `XmlComponent` interface with a `render()` method.
 * They can optionally accept props via constructor, validated with a Zod schema.
 *
 * @overload
 * Component without props (no schema).
 *
 * @example
 * ```tsx
 * @Component()
 * class LatestPostsComponent implements XmlComponent {
 *   private readonly postService = inject(PostService)
 *
 *   async render() {
 *     const posts = await this.postService.getLatestPosts()
 *     return <>{posts.map(post => <item>...</item>)}</>
 *   }
 * }
 * ```
 *
 * @overload
 * Component with props schema for type-safe props.
 *
 * @param options - Configuration object with schema and optional registry.
 * @param options.schema - Zod schema for validating and typing component props.
 * @param options.registry - Optional custom DI registry (defaults to global registry).
 *
 * @example
 * ```tsx
 * const DescriptionSchema = z.object({
 *   content: z.string(),
 *   wrapInCData: z.boolean().optional(),
 * })
 *
 * @Component({ schema: DescriptionSchema })
 * class DescriptionComponent implements XmlComponent {
 *   constructor(private props: z.output<typeof DescriptionSchema>) {}
 *
 *   async render() {
 *     return <description>{this.props.wrapInCData ? <CData>{this.props.content}</CData> : this.props.content}</description>
 *   }
 * }
 * ```
 *
 * @overload
 * Component with custom registry only (no props).
 *
 * @param options - Configuration object with registry.
 * @param options.registry - Custom DI registry to use for this component.
 */
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
}): <T extends ComponentClass>(target: T, context?: ClassDecoratorContext) => T

export function Component(
  options: {
    schema?: ZodObject<ZodRawShape>
    registry?: Registry
  } = {},
) {
  const { schema, registry = globalRegistry } = options

  return <T extends ComponentClass>(target: T, context?: ClassDecoratorContext): T => {
    if ((context && context.kind !== 'class') || (target instanceof Function && !context)) {
      throw new Error('[@navios/adapter-xml] @Component decorator can only be used on classes.')
    }

    // Verify the class has a render method
    if (typeof target.prototype.render !== 'function') {
      throw new Error(
        `[@navios/adapter-xml] @Component class "${target.name}" must implement render() method.`,
      )
    }

    // Create token with schema if provided
    const injectableToken = schema
      ? InjectionToken.create(target, schema)
      : InjectionToken.create(target)

    // Register with Request scope - each render gets fresh instances
    registry.set(injectableToken, InjectableScope.Request, target, InjectableType.Class)

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
 * Type guard to check if a value is a component class.
 *
 * Component classes are classes decorated with `@Component` that implement
 * the `XmlComponent` interface.
 *
 * @param value - The value to check.
 * @returns `true` if the value is a component class, `false` otherwise.
 *
 * @example
 * ```ts
 * if (isComponentClass(MyClass)) {
 *   // MyClass is a component class
 *   const instance = await container.get(MyClass)
 * }
 * ```
 */
export function isComponentClass(value: unknown): value is ComponentClass {
  return (
    typeof value === 'function' &&
    // @ts-expect-error - Checking metadata
    value[ComponentMeta] === true
  )
}
