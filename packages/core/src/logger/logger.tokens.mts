import { InjectionToken } from '@navios/di'

import { schemaFromGuard } from '../schema/simple-schema.mjs'

import type { LoggerService } from './logger-service.interface.mjs'
import type { LoggerInstance } from './logger.service.mjs'

/**
 * Injection token for the logger output service.
 *
 * This token is used to provide a custom logger implementation.
 * By default, it's bound to ConsoleLogger.
 */
export const LoggerOutput = InjectionToken.create<LoggerService>('LoggerOutput')

/**
 * Schema for logger options.
 */
export type LoggerOptions = { context?: string } | undefined

export const loggerOptionsSchema = schemaFromGuard<LoggerOptions>(
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
