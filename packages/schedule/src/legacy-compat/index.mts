/**
 * Legacy-compatible decorators for projects that cannot use Stage 3 decorators.
 *
 * These decorators use the TypeScript experimental decorator API and convert
 * the arguments to Stage 3 format internally.
 *
 * @example
 * ```typescript
 * import { Schedulable, Cron, Schedule } from '@navios/schedule/legacy-compat'
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

// The context helpers live in `@navios/di` and are re-exported by core, so
// that every package's legacy decorators share one metadata store per class.
export { createClassContext, createMethodContext } from '@navios/core/legacy-compat'
// Metadata, constants, the scheduler and the plugin work with both decorator styles.
export type { CronOptions } from '../cron/index.mjs'
export { getAllCronMetadata, getCronMetadata, Schedule } from '../cron/index.mjs'
export type { CronMetadata } from '../cron/index.mjs'
export type { SchedulableOptions, ScheduleMetadata } from '../schedulable/index.mjs'
export {
  extractScheduleMetadata,
  getScheduleMetadata,
  hasScheduleMetadata,
} from '../schedulable/index.mjs'
export { schedulePlugin } from '../schedule-plugin.mjs'
export type { SchedulePluginOptions } from '../schedule-plugin.mjs'
export { SchedulerService } from '../scheduler-service.mjs'
export { Cron } from './cron.mjs'
export { Schedulable } from './schedulable.mjs'
