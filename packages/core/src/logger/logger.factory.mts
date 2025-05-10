import { z } from 'zod'

import {
  Injectable,
  InjectableType,
  InjectionToken,
} from '../service-locator/index.mjs'
import { LoggerInstance } from './logger.service.mjs'

export const LoggerInjectionToken = 'LoggerInjectionToken'

export const LoggerOptions = z
  .object({
    context: z.string().optional(),
    options: z
      .object({
        timestamp: z.boolean().optional(),
      })
      .optional(),
  })
  .optional()

export const Logger = InjectionToken.create<
  LoggerInstance,
  typeof LoggerOptions
>(LoggerInjectionToken, LoggerOptions)

@Injectable({
  type: InjectableType.Factory,
  token: Logger,
})
export class LoggerFactory {
  create(ctx: any, args: z.infer<typeof LoggerOptions>) {
    // @ts-expect-error We don't need to support this in the current version
    return new LoggerInstance(args?.context, args?.options)
  }
}
