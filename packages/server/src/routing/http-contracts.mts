import type { Guard as CoreGuard } from '@navios/core'

import type { RequestContext } from '../context/request-context.mjs'
import type { EndpointReply } from '../responses/reply.mjs'

import type { RouteResult } from './route-result.mjs'

/** A guard of HTTP routes. */
export type Guard = CoreGuard<RequestContext>

/** An interceptor around HTTP routes. It may answer with a `reply()` of its own. */
export interface Interceptor {
  intercept(
    ctx: RequestContext,
    next: () => Promise<RouteResult>,
  ): RouteResult | EndpointReply | Promise<RouteResult | EndpointReply>
}
