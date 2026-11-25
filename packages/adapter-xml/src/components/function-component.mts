import type { RequestContext } from '@navios/core'

import type { XmlRenderable } from '../nodes/xml-node.mjs'

/**
 * A function component. It is called when the tree is rendered, with its
 * props and the context of the request the document is rendered for.
 *
 * ```tsx
 * async function Greeting({ greeting }: { greeting: string }, ctx: RequestContext) {
 *   const user = await ctx.get(CurrentUser)
 *   return <greeting>{greeting}, {user.name}</greeting>
 * }
 * ```
 *
 * Outside a request (`renderToXml(tree)` without `ctx`) the second argument
 * throws `MissingContextError` on first use.
 */
export type FunctionComponent<Props = any> = (
  props: Props,
  ctx: RequestContext,
) => XmlRenderable | Promise<XmlRenderable>
