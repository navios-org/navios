import { inject, Injectable } from '@navios/di'

import type { LoggerService } from './logger-service.interface.mjs'
import type { LoggerOptions } from './logger.tokens.mjs'

import { Logger, LoggerOutput } from './logger.tokens.mjs'

/**
 * Logger service instance that can be injected into services and controllers.
 *
 * Provides contextualized logging with automatic context injection.
 * The context is set when the logger is injected using the `inject` function.
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class UserService {
 *   private logger = inject(Logger, { context: UserService.name })
 *
 *   async findUser(id: string) {
 *     this.logger.log(`Finding user ${id}`)
 *     // Logs with context: [UserService]
 *   }
 * }
 * ```
 */
@Injectable({
  token: Logger,
})
export class LoggerInstance implements LoggerService {
  protected localInstance = inject(LoggerOutput)

  protected context?: string

  constructor(config: LoggerOptions = {}) {
    this.context = config.context
  }

  /**
   * Write an 'error' level log.
   */
  error(message: any, stack?: string, context?: string): void
  error(message: any, ...optionalParams: [...any, string?, string?]): void
  error(message: any, ...optionalParams: any[]) {
    optionalParams = this.context
      ? (optionalParams.length ? optionalParams : [undefined]).concat(
          this.context,
        )
      : optionalParams

    this.localInstance?.error(message, ...optionalParams)
  }

  /**
   * Write a 'log' level log.
   */
  log(message: any, context?: string): void
  log(message: any, ...optionalParams: [...any, string?]): void
  log(message: any, ...optionalParams: any[]) {
    optionalParams = this.context
      ? optionalParams.concat(this.context)
      : optionalParams
    this.localInstance?.log(message, ...optionalParams)
  }

  /**
   * Write a 'warn' level log.
   */
  warn(message: any, context?: string): void
  warn(message: any, ...optionalParams: [...any, string?]): void
  warn(message: any, ...optionalParams: any[]) {
    optionalParams = this.context
      ? optionalParams.concat(this.context)
      : optionalParams
    this.localInstance?.warn(message, ...optionalParams)
  }

  /**
   * Write a 'debug' level log.
   */
  debug(message: any, context?: string): void
  debug(message: any, ...optionalParams: [...any, string?]): void
  debug(message: any, ...optionalParams: any[]) {
    optionalParams = this.context
      ? optionalParams.concat(this.context)
      : optionalParams
    this.localInstance?.debug?.(message, ...optionalParams)
  }

  /**
   * Write a 'verbose' level log.
   */
  verbose(message: any, context?: string): void
  verbose(message: any, ...optionalParams: [...any, string?]): void
  verbose(message: any, ...optionalParams: any[]) {
    optionalParams = this.context
      ? optionalParams.concat(this.context)
      : optionalParams
    this.localInstance?.verbose?.(message, ...optionalParams)
  }

  /**
   * Write a 'fatal' level log.
   */
  fatal(message: any, context?: string): void
  fatal(message: any, ...optionalParams: [...any, string?]): void
  fatal(message: any, ...optionalParams: any[]) {
    optionalParams = this.context
      ? optionalParams.concat(this.context)
      : optionalParams
    this.localInstance?.fatal?.(message, ...optionalParams)
  }
}
