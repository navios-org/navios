import { InjectionToken } from '@navios/core'

import type { CommanderExecutionContext } from '../interfaces/index.mjs'

const CommandExecutionContextInjectionToken =
  'CommanderExecutionContextInjectionToken'

/**
 * Injection token for accessing the current command execution context.
 *
 * Use this token with `inject()` to access the `CommanderExecutionContext` in services
 * that need information about the currently executing command.
 *
 * @example
 * ```typescript
 * import { inject, Injectable } from '@navios/di'
 * import { CommandExecutionContext } from '@navios/commander'
 *
 * @Injectable()
 * class MyService {
 *   private ctx = inject(CommandExecutionContext)
 *
 *   doSomething() {
 *     const commandPath = this.ctx.getCommandPath()
 *     const options = this.ctx.getOptions()
 *     // Use context information...
 *   }
 * }
 * ```
 */
export const CommandExecutionContext =
  InjectionToken.create<CommanderExecutionContext>(
    CommandExecutionContextInjectionToken,
  )
