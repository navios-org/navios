import type { Guard } from '@navios/core'
import type { Interceptor } from '@navios/core'

import type { RequestContext } from '../context/request-context.mjs'

import type { RouteResult } from './route-result.mjs'

/** A guard of HTTP routes. */
export type HttpGuard = Guard<RequestContext>

/** An interceptor around HTTP routes. */
export type HttpInterceptor = Interceptor<RequestContext, RouteResult>
