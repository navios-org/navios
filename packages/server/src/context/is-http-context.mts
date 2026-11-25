import type { ExecutionContext } from '@navios/core'

import { RequestContext } from './request-context.mjs'

/**
 * Whether a context belongs to an HTTP request. A guard or interceptor that
 * is attached to a module or to the whole application runs on every
 * transport; this is how it reaches the request when there is one.
 *
 * ```ts
 * canActivate(ctx: ExecutionContext) {
 *   if (isHttpContext(ctx)) {
 *     return ctx.headers.get('x-api-key') === this.key
 *   }
 *   return true
 * }
 * ```
 */
export function isHttpContext(ctx: ExecutionContext): ctx is RequestContext {
  return ctx instanceof RequestContext
}
