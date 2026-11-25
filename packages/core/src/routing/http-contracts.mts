import type { RequestContext } from '../context/request-context.mjs'
import type { Guard } from '../guards/guard.mjs'
import type { Interceptor } from '../interceptors/interceptor.mjs'

import type { RouteResult } from './route-result.mjs'

/** A guard of HTTP routes. */
export type HttpGuard = Guard<RequestContext>

/** An interceptor around HTTP routes. */
export type HttpInterceptor = Interceptor<RequestContext, RouteResult>
