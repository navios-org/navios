import { InjectableScope, InjectionToken } from '@navios/core'

import type { RequestContext } from './request-context.mjs'

/**
 * The request context, available to request-scoped services with
 * `inject(RequestContextToken)`.
 */
export const RequestContextToken = InjectionToken.create<RequestContext>('RequestContext', {
  scope: InjectableScope.Request,
})
