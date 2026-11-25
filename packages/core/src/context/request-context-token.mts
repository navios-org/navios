import { InjectableScope, InjectionToken } from '@navios/di'

import type { RequestContext } from './request-context.mjs'

/**
 * The request context, available to request-scoped services with
 * `inject(RequestContextToken)`.
 */
export const RequestContextToken = InjectionToken.create<RequestContext>('RequestContext', {
  scope: InjectableScope.Request,
})
