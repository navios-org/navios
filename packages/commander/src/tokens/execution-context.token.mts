import { InjectionToken } from '@navios/core'

import type { CommanderExecutionContext } from '../interfaces/index.mjs'

const CommandExecutionContextInjectionToken =
  'CommanderExecutionContextInjectionToken'

export const CommandExecutionContext =
  InjectionToken.create<CommanderExecutionContext>(
    CommandExecutionContextInjectionToken,
  )
