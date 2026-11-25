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

// Adds `jobs` to the options of `@Module`.
import '../transport/module-options.mjs'

export type { CronOptions, OverlapPolicy } from '../cron/index.mjs'
export type { JobRun } from '../jobs/scheduled-job.mjs'
export type { SchedulableOptions } from '../schedulable/index.mjs'
export { Cron } from './cron.mjs'
export { Schedulable } from './schedulable.mjs'
