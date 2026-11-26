/**
 * The decorators for projects that keep `experimentalDecorators: true`.
 * Everything else comes from `@navios/schedule`, and works with both.
 *
 * @example
 * ```typescript
 * import { Schedule } from '@navios/schedule'
 * import { Cron, Schedulable } from '@navios/schedule/legacy-compat'
 *
 * @Schedulable()
 * class TaskService {
 *   @Cron(Schedule.EveryMinute)
 *   async everyMinuteTask() {
 *     console.log('Running every minute')
 *   }
 * }
 * ```
 */
import { legacy } from '@navios/core/legacy-compat'

import type { ClassType } from '@navios/core'

import { Cron as StandardCron } from '../cron/cron.mjs'
import { Schedulable as StandardSchedulable } from '../schedulable/schedulable.mjs'

import type { CronOptions } from '../cron/cron.mjs'
import type { JobRun } from '../jobs/scheduled-job.mjs'
import type { SchedulableOptions } from '../schedulable/schedulable.mjs'

// Adds `jobs` to the options of `@Module`.
import '../transport/module-options.mjs'

export type { CronOptions, OverlapPolicy } from '../cron/cron.mjs'
export type { JobRun } from '../jobs/scheduled-job.mjs'
export type { SchedulableOptions } from '../schedulable/schedulable.mjs'

/**
 * `@Cron` for legacy decorators: runs the method on a cron schedule. The
 * method takes the {@link JobRun} it is called with, or nothing.
 *
 * @param cronTime - Cron expression (5 or 6 fields) or a pre-defined Schedule constant
 * @param options - Optional configuration for the cron job
 */
export function Cron(cronTime: string, options?: CronOptions) {
  return legacy(StandardCron(cronTime, options)) as <M extends (run: JobRun) => unknown>(
    target: object,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<M>,
  ) => PropertyDescriptor | void
}

/**
 * `@Schedulable` for legacy decorators: marks a class whose `@Cron` methods
 * are jobs, and makes it injectable.
 *
 * @param options - Optional configuration: the DI scope of the class
 */
export function Schedulable(options: SchedulableOptions = {}) {
  return legacy(StandardSchedulable(options)) as <T extends ClassType>(target: T) => T
}
