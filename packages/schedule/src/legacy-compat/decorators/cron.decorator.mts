import type { CronJobParams } from 'cron'

import { createMethodContext } from '@navios/core/legacy-compat'

import {
  Cron as OriginalCron,
  type CronOptions,
} from '../../decorators/cron.decorator.mjs'

export type { CronOptions }

/**
 * Legacy-compatible Cron decorator.
 *
 * Works with TypeScript experimental decorators (legacy API).
 * Marks a method to run on a cron schedule.
 *
 * @param cronTime - Cron expression (5 or 6 fields) or a pre-defined Schedule constant
 * @param options - Optional configuration for the cron job
 * @returns A method decorator compatible with legacy decorator API
 *
 * @example
 * ```typescript
 * @Schedulable()
 * class TaskService {
 *   @Cron('0 0 * * *')
 *   async dailyTask() {
 *     console.log('Running daily task')
 *   }
 *
 *   @Cron(Schedule.EveryFiveMinutes, { disabled: true })
 *   async frequentTask() {
 *     console.log('Running every 5 minutes')
 *   }
 * }
 * ```
 */
export function Cron(cronTime: CronJobParams['cronTime'], options?: CronOptions) {
  return function <T extends object>(
    target: T,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<() => Promise<void>>,
  ): PropertyDescriptor | void {
    if (!descriptor) {
      throw new Error(
        '[Navios] @Cron decorator requires a method descriptor. Make sure experimentalDecorators is enabled.',
      )
    }
    const context = createMethodContext(target, propertyKey, descriptor)
    const originalDecorator = OriginalCron(cronTime, options)
    // @ts-expect-error - we don't need to type the value
    const result = originalDecorator(descriptor.value, context)
    if (result !== descriptor.value) {
      descriptor.value = result as any
    }
    return descriptor
  }
}
