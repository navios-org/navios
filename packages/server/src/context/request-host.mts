import type { ContextHost } from '@navios/core/transport'

import type { RequestContext } from './request-context.mjs'

/** What the contexts of a route's requests share. */
export interface RequestHost extends ContextHost {
  /** Whether a request runs inside the async context, for `currentContext()`. */
  readonly asyncContext: boolean
  /** The requests that hold something to release. */
  readonly live: Set<RequestContext>
  /** The path of a request to the route, from its url params. */
  readonly path: (urlParams: Record<string, string>) => string
  /** Receives an error that has no response to become. */
  readonly report: (error: unknown, ctx: RequestContext) => void
}
