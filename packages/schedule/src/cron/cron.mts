import type { JobRun } from '../jobs/scheduled-job.mjs'

import { getCronMetadata, takeInheritedCronMetadata } from './cron-metadata.mjs'

/**
 * What happens when a job is due while a run of it is still in progress in
 * this process: `'skip'` leaves that run out, `'allow'` starts it next to the
 * other one.
 *
 * @public
 */
export type OverlapPolicy = 'skip' | 'allow'

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

  /**
   * IANA time zone the cron expression is evaluated in, for example
   * `'Europe/Kyiv'`. Defaults to the `timeZone` of `scheduleTransport()`, and
   * without one to the time zone of the process.
   */
  timeZone?: string

  /**
   * What happens when the job is due while a run of it is still in progress.
   * Only runs in this process count: several instances of an application each
   * run the job.
   *
   * @default 'skip'
   */
  overlap?: OverlapPolicy
}

/**
 * Decorator that marks a method to run on a cron schedule.
 *
 * The method must be in a class decorated with `@Schedulable()`. It may be
 * synchronous or return a promise, and may take the {@link JobRun} it is
 * called with; what it returns is ignored. A method takes one `@Cron()`.
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
 *   // Use pre-defined schedule, and stop early when the application closes
 *   @Cron(Schedule.EveryFiveMinutes)
 *   async frequentTask({ signal }: JobRun) {
 *     await fetch('https://example.com/refresh', { signal })
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
 * @throws {Error} If applied to something other than a public instance method with a string name
 * @throws {Error} If the method already has a `@Cron()`
 *
 * @public
 */
export function Cron(cronTime: string, options?: CronOptions) {
  return <T extends (run: JobRun) => unknown>(
    target: T,
    context: ClassMethodDecoratorContext,
  ): T => {
    if (context.kind !== 'method') {
      throw new Error(
        `[Navios-Schedule] @Cron can only be applied to methods, not ${context.kind as string}`,
      )
    }
    // A job is called by name on an instance of its class.
    const unsupported = context.private
      ? 'private'
      : context.static
        ? 'static'
        : typeof context.name === 'symbol'
          ? 'symbol-named'
          : null
    if (unsupported !== null) {
      throw new Error(
        `[Navios-Schedule] @Cron cannot be applied to the ${unsupported} method ${String(context.name)}. ` +
          `A job must be a public instance method with a string name.`,
      )
    }
    const metadata = getCronMetadata(context)
    if (metadata.cronTime !== null && !takeInheritedCronMetadata(metadata)) {
      throw new Error(
        `[Navios-Schedule] Method ${metadata.classMethod} has more than one @Cron. A method can have one schedule.`,
      )
    }
    metadata.cronTime = cronTime
    metadata.disabled = options?.disabled ?? false
    metadata.overlap = options?.overlap ?? 'skip'
    metadata.timeZone = options?.timeZone
    return target
  }
}
