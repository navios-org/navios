import type { Container, Provider } from '@navios/di'

import type { LogLevel } from '../logger/log-levels.mjs'
import type { LoggerService } from '../logger/logger-output.mjs'
import type { PluginInstance } from '../plugins/plugin.mjs'
import type { TransportInstance } from '../transports/transport.mjs'

export interface ApplicationOptions {
  /** How work reaches the application. None is valid, for a process that does its work in hooks. */
  transports?: TransportInstance[]
  /**
   * Providers that replace or supply defaults, application-wide. They win over
   * those of plugins and modules.
   */
  providers?: Provider[]
  plugins?: PluginInstance[]
  /**
   * Use an existing container instead of creating one. It backs one open
   * application at a time, and `close()` disposes it. What it provides, or
   * already holds because it was put there, wins over everything else: a test
   * replaces a service by binding it there.
   */
  container?: Container
  /**
   * `false` disables logging, an array selects the levels of the console
   * logger or of the output that is provided instead, and an object is used as
   * the output.
   */
  logger?: LoggerService | LogLevel[] | false
  /**
   * Keep the current execution context in an `AsyncLocalStorage`, so that
   * `currentContext()` works in code that cannot receive it as an argument.
   * @default false
   */
  asyncContext?: boolean
  /**
   * What happens when a handler uses a service that is not a singleton through
   * `ctx.use()` / `ctx.resolve()`, which needs a DI scope for the execution:
   * nothing, a warning the first time, or an error.
   * @default 'warn' outside production, 'allow' in production
   */
  requestScopedServices?: 'allow' | 'warn' | 'forbid'
  /**
   * How long `close()` waits, in milliseconds: for work in flight, and for
   * each further step, such as one shutdown hook. A step that takes longer is
   * reported and left behind.
   * @default 10000
   */
  shutdownTimeout?: number
}
