import type { Guard } from '@navios/core'
import type { Interceptor } from '@navios/core'

import type { RequestContext } from '../context/request-context.mjs'
import type { EndpointReply } from '../responses/reply.mjs'

import type { RouteResult } from './route-result.mjs'

/** A guard of HTTP routes. */
export type HttpGuard = Guard<RequestContext>

/** An interceptor around HTTP routes. It may answer with a `reply()` of its own. */
export interface HttpInterceptor {
  intercept(
    ctx: RequestContext,
    next: () => Promise<RouteResult>,
  ): RouteResult | EndpointReply | Promise<RouteResult | EndpointReply>
}

/* eslint-disable @typescript-eslint/no-explicit-any */

// As `@UseGuards` and `@UseInterceptors` take them: what may be attached to a
// class may be written for another transport that the class serves.

/** A class that guards are made of. */
export type HttpGuardClass = new (...args: any[]) => Guard<any>

/** A class that interceptors are made of. */
export type HttpInterceptorClass = new (...args: any[]) => Interceptor<any, any>
