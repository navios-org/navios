import { Token } from '@navios/di'

import type { AbstractExecutionContext } from '../interfaces/index.mjs'

export const ExecutionContextInjectionToken = 'ExecutionContextInjectionToken'

export const ExecutionContext = Token.create<AbstractExecutionContext>(
  ExecutionContextInjectionToken,
)
