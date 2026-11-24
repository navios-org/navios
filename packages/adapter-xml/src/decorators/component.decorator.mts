import { InjectableScope, registerInjectable } from '@navios/core'

import type { InferOutput, StandardSchemaV1 } from '@navios/core'

import type { ComponentClass, XmlComponent } from '../types/component.mjs'

export const ComponentMeta = Symbol.for('xml.component.meta')

export interface ComponentOptions<Schema extends StandardSchemaV1 = StandardSchemaV1> {
  /**
   * Schema for the component's props (any Standard Schema, for example a Zod
   * object). The props are validated when the component is built and the
   * parsed value is the constructor argument.
   */
  schema?: Schema
}

/**
 * Registers a class as an XML component.
 *
 * The class must have a `render(ctx)` method. A new instance is built by the
 * DI container for every place the component appears in a tree (the class is
 * registered with transient scope), so:
 *
 * - the props are the constructor argument, validated against `schema` when
 *   one is given;
 * - field initialisers may `inject()` singletons;
 * - per-request data and request-scoped services come from the `ctx` argument
 *   of `render`: `ctx.get(SomeRequestValue)`, `ctx.use(SomeScopedService)`.
 *
 * @example
 * ```tsx
 * @Component()
 * class LatestPosts implements XmlComponent {
 *   private readonly posts = inject(PostService)
 *
 *   async render(ctx: RequestContext) {
 *     const posts = await this.posts.latest(ctx.get(CurrentTenant))
 *     return <>{posts.map((post) => <item>{post.title}</item>)}</>
 *   }
 * }
 * ```
 *
 * @example
 * ```tsx
 * const DescriptionSchema = z.object({ content: z.string() })
 *
 * @Component({ schema: DescriptionSchema })
 * class Description implements XmlComponent {
 *   constructor(private props: z.output<typeof DescriptionSchema>) {}
 *
 *   render() {
 *     return <description><CData>{this.props.content}</CData></description>
 *   }
 * }
 * ```
 *
 * Without decorator syntax: `Component()(LatestPosts)`.
 */
// #1 Component without a props schema
export function Component(): <T extends ComponentClass>(
  target: T,
  context?: ClassDecoratorContext,
) => T
// #2 Component with a props schema
export function Component<Schema extends StandardSchemaV1>(options: {
  schema: Schema
}): <T extends new (props: InferOutput<Schema>, ...args: any[]) => XmlComponent>(
  target: T,
  context?: ClassDecoratorContext,
) => T
export function Component(options: ComponentOptions = {}) {
  const { schema } = options

  return <T extends ComponentClass>(target: T, context?: ClassDecoratorContext): T => {
    if (typeof target !== 'function' || (context && context.kind !== 'class')) {
      throw new Error('[@navios/adapter-xml] @Component decorator can only be used on classes.')
    }

    if (typeof target.prototype.render !== 'function') {
      throw new Error(
        `[@navios/adapter-xml] @Component class "${target.name}" must implement render() method.`,
      )
    }

    // Transient: every occurrence in a tree gets its own instance, built
    // against the root container, so a component never holds request state
    // in a place a singleton could reach.
    registerInjectable(target, { scope: InjectableScope.Transient, schema })

    // Mark as component for JSX runtime detection
    Object.defineProperty(target, ComponentMeta, { value: true, enumerable: false })

    return target
  }
}

/**
 * Type guard to check if a value is a component class registered with
 * `Component`.
 */
export function isComponentClass(value: unknown): value is ComponentClass {
  return typeof value === 'function' && (value as any)[ComponentMeta] === true
}
