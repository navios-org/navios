import { Container, inject, InjectableScope, InjectionToken, registerInjectable } from '@navios/di'

import { schemaFromGuard } from '../internal/schema-from-guard.mjs'

import { LoggerOutput } from './logger-output.mjs'
import { pendingOutput } from './pending-output.mjs'

import type { LogLevel } from './log-levels.mjs'
import type { LoggerService } from './logger-output.mjs'

/**
 * Schema for logger options.
 */
export type LoggerOptions = { context?: string } | undefined

const loggerOptionsSchema = schemaFromGuard<LoggerOptions>(
  (value): value is LoggerOptions =>
    value === undefined ||
    (typeof value === 'object' &&
      value !== null &&
      ((value as { context?: unknown }).context === undefined ||
        typeof (value as { context?: unknown }).context === 'string')),
  'Logger options must be an object with an optional string `context`',
)

/**
 * Injection token for the Logger service.
 *
 * Use this token to inject a contextualized logger instance.
 *
 * @example
 * ```typescript
 * const logger = inject(Logger, { context: 'MyService' })
 * logger.log('Hello world') // Logs with context: [MyService]
 * ```
 */
export const Logger = InjectionToken.create<LoggerInstance, typeof loggerOptionsSchema>(
  'Logger',
  loggerOptionsSchema,
)

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
export class LoggerInstance implements LoggerService {
  protected localInstance: LoggerService = pendingOutput(inject(Container)) ?? inject(LoggerOutput)

  protected context?: string

  constructor(config: LoggerOptions = {}) {
    this.context = config?.context
  }

  /**
   * Write an 'error' level log.
   */
  error(message: any, stack?: string, context?: string): void
  error(message: any, ...optionalParams: [...any, string?, string?]): void
  error(message: any, ...optionalParams: any[]) {
    if (this.context && optionalParams.length === 0) {
      // The context of an error comes after its stack.
      optionalParams.push(undefined)
    }
    this.forward('error', message, optionalParams)
  }

  /**
   * Write a 'log' level log.
   */
  log(message: any, context?: string): void
  log(message: any, ...optionalParams: [...any, string?]): void
  log(message: any, ...optionalParams: any[]) {
    this.forward('log', message, optionalParams)
  }

  /**
   * Write a 'warn' level log.
   */
  warn(message: any, context?: string): void
  warn(message: any, ...optionalParams: [...any, string?]): void
  warn(message: any, ...optionalParams: any[]) {
    this.forward('warn', message, optionalParams)
  }

  /**
   * Write a 'debug' level log.
   */
  debug(message: any, context?: string): void
  debug(message: any, ...optionalParams: [...any, string?]): void
  debug(message: any, ...optionalParams: any[]) {
    this.forward('debug', message, optionalParams)
  }

  /**
   * Write a 'verbose' level log.
   */
  verbose(message: any, context?: string): void
  verbose(message: any, ...optionalParams: [...any, string?]): void
  verbose(message: any, ...optionalParams: any[]) {
    this.forward('verbose', message, optionalParams)
  }

  /**
   * Write a 'fatal' level log.
   */
  fatal(message: any, context?: string): void
  fatal(message: any, ...optionalParams: [...any, string?]): void
  fatal(message: any, ...optionalParams: any[]) {
    this.forward('fatal', message, optionalParams)
  }

  /** Writes to the output, the context last. `params` is the caller's own array. */
  private forward(level: LogLevel, message: any, params: any[]): void {
    if (this.context) {
      params.push(this.context)
    }
    this.localInstance[level]?.(message, ...params)
  }
}

// Transient: the context is free text, so a stored instance per context would
// be one for every id that is logged with.
registerInjectable(LoggerInstance, { token: Logger, scope: InjectableScope.Transient })
