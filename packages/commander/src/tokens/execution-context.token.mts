import { InjectionToken } from '@navios/di'

import type { CommanderExecutionContext } from '../interfaces/index.mjs'

export const ExecutionContextInjectionToken =
  'CommanderExecutionContextInjectionToken'

export const ExecutionContext = InjectionToken.create<CommanderExecutionContext>(
  ExecutionContextInjectionToken,
)
