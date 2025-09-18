import { InjectionToken } from '@navios/di'

import z from 'zod/v4'

import type { LoggerService } from './logger-service.interface.mjs'
import type { LoggerInstance } from './logger.service.mjs'

export const LoggerOutput = InjectionToken.create<LoggerService>('LoggerOutput')

export const loggerOptionsSchema = z
  .object({
    context: z.string().optional(),
  })
  .optional()

export type LoggerOptions = z.infer<typeof loggerOptionsSchema>

export const Logger = InjectionToken.create<
  LoggerInstance,
  typeof loggerOptionsSchema
>('Logger', loggerOptionsSchema)
