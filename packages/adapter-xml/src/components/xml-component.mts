import type { RequestContext } from '@navios/core'

import type { XmlRenderable } from '../nodes/xml-node.mjs'

/**
 * Base interface for class components.
 *
 * A class component is a class registered with `@Component()` (or
 * `Component()(TheClass)`). A new instance is built by the DI container for
 * every place the component appears in a tree: props arrive in the
 * constructor, `inject()` works in field initialisers, and `render(ctx)`
 * receives the context of the request being served.
 *
 * ```tsx
 * @Component()
 * class LatestPosts implements XmlComponent {
 *   private readonly posts = inject(PostService)
 *
 *   async render(ctx: RequestContext) {
 *     const user = await ctx.get(CurrentUser)
 *     const posts = await this.posts.latestFor(user)
 *     return <>{posts.map((post) => <item>{post.title}</item>)}</>
 *   }
 * }
 * ```
 */
export interface XmlComponent {
  /**
   * Renders the component. `ctx` is the context of the request the document
   * is rendered for; outside a request it throws `MissingContextError` on
   * first use.
   */
  render(ctx: RequestContext): XmlRenderable | Promise<XmlRenderable>
}

/** A class component constructor. */
export interface ComponentClass {
  new (...args: any[]): XmlComponent
}
