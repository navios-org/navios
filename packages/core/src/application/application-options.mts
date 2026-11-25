import type { Container, Provider } from '@navios/di'

import type { LogLevel } from '../logger/log-levels.mjs'
import type { LoggerService } from '../logger/logger-output.mjs'
import type { PluginInstance } from '../plugins/plugin.mjs'
import type { TransportInstance } from '../transports/transport.mjs'

export interface ApplicationOptions {
  /** How work reaches the application. None is valid, for a process that only runs scheduled work. */
  transports?: TransportInstance[]
  /** Providers that replace or supply defaults, application-wide. */
  providers?: Provider[]
  plugins?: PluginInstance[]
  /** Use an existing container instead of creating one. */
  container?: Container
  /**
   * `false` disables logging, an array selects the console logger's levels,
   * and an object is used as the logger.
   */
  logger?: LoggerService | LogLevel[] | false
  /**
   * Keep the current execution context in an `AsyncLocalStorage`, so that
   * `currentContext()` works in code that cannot receive it as an argument.
   * @default false
   */
  asyncContext?: boolean
  /**
   * What happens the first time a handler uses a request-scoped service
   * through `ctx.use()` / `ctx.resolve()`.
   * @default 'warn' outside production, 'allow' in production
   */
  requestScopedServices?: 'allow' | 'warn' | 'forbid'
  /** How long `close()` waits for work in flight, in milliseconds. @default 10000 */
  shutdownTimeout?: number
}
