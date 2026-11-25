import type { RequestContext } from '../context/request-context.mjs'
import type { RouteResult } from '../routing/route-result.mjs'

export interface Interceptor {
  intercept(
    ctx: RequestContext,
    next: () => Promise<RouteResult>,
  ): RouteResult | Promise<RouteResult>
}
