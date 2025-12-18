import type { CronJobParams } from 'cron'

import { getCronMetadata } from '../metadata/index.mjs'

/**
 * Options for configuring a cron job.
 * 
 * @public
 */
export interface CronOptions {
  /**
   * Whether the job should be disabled by default.
   * Disabled jobs won't start automatically but can be manually started later.
   * 
   * @default false
   */
  disabled?: boolean
}

/**
 * Decorator that marks a method to run on a cron schedule.
 * 
 * The method must be in a class decorated with `@Schedulable()`.
 * The method will be automatically executed according to the provided cron expression.
 * 
 * @param cronTime - Cron expression (5 or 6 fields) or a pre-defined Schedule constant
 * @param options - Optional configuration for the cron job
 * 
 * @example
 * ```typescript
 * @Schedulable()
 * class TaskService {
 *   // Run daily at midnight
 *   @Cron('0 0 * * *')
 *   async dailyTask() {
 *     console.log('Running daily task')
 *   }
 * 
 *   // Use pre-defined schedule
 *   @Cron(Schedule.EveryFiveMinutes)
 *   async frequentTask() {
 *     console.log('Running every 5 minutes')
 *   }
 * 
 *   // Disabled job (won't start automatically)
 *   @Cron('0 2 * * *', { disabled: true })
 *   async maintenanceTask() {
 *     console.log('Maintenance task')
 *   }
 * }
 * ```
 * 
 * @throws {Error} If applied to something other than a method
 * 
 * @public
 */
export function Cron(
  cronTime: CronJobParams['cronTime'],
  options?: CronOptions,
) {
  return (
    target: () => Promise<void>,
    context: ClassMethodDecoratorContext,
  ) => {
    if (context.kind !== 'method') {
      throw new Error(
        `Cron can only be applied to methods, not ${context.kind}`,
      )
    }
    if (context.metadata) {
      const metadata = getCronMetadata(target, context)
      metadata.cronTime = cronTime
      metadata.disabled = options?.disabled ?? false
    }
    return target
  }
}
