import { InjectionToken } from '@navios/di'

import { ExecutionContext } from '../services/index.mjs'

export const ExecutionContextInjectionToken = 'ExecutionContextInjectionToken'

export const ExecutionContextToken = InjectionToken.create<ExecutionContext>(
  ExecutionContextInjectionToken,
)
