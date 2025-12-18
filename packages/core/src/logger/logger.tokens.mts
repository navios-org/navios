import { InjectionToken } from '@navios/di'

import z from 'zod/v4'

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
export const loggerOptionsSchema = z
  .object({
    context: z.string().optional(),
  })
  .optional()

/**
 * Options for creating a logger instance.
 */
export type LoggerOptions = z.infer<typeof loggerOptionsSchema>

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
export const Logger = InjectionToken.create<
  LoggerInstance,
  typeof loggerOptionsSchema
>('Logger', loggerOptionsSchema)
