import { InjectionToken } from '@navios/di'

import type { AbstractExecutionContext } from '../interfaces/index.mjs'

export const ExecutionContextInjectionToken = 'ExecutionContextInjectionToken'

export const ExecutionContext = InjectionToken.create<AbstractExecutionContext>(
  ExecutionContextInjectionToken,
)
