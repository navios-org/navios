import { InjectableScope, InjectionToken } from '@navios/di'

import type { ExecutionContext } from './execution-context.mjs'

/**
 * The context of the current execution, on any transport. Injectable in
 * request-scoped services.
 */
export const ExecutionContextToken = InjectionToken.create<ExecutionContext>('ExecutionContext', {
  scope: InjectableScope.Request,
})
