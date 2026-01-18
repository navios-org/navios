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

// Export legacy-compatible decorators
export {
  Cron,
  Schedulable,
  type CronOptions,
  type SchedulableOptions,
} from './decorators/index.mjs'

// Re-export Schedule constants for convenience
export { Schedule } from '../cron.constants.mjs'

// Re-export metadata types and functions (these work with both decorator styles)
export type { CronMetadata, ScheduleMetadata } from '../metadata/index.mjs'
export {
  getAllCronMetadata,
  getCronMetadata,
  getScheduleMetadata,
  extractScheduleMetadata,
  hasScheduleMetadata,
} from '../metadata/index.mjs'

// Re-export SchedulerService (works with both decorator styles)
export { SchedulerService } from '../scheduler.service.mjs'

// Re-export context compatibility utilities from core
export { createClassContext, createMethodContext } from '@navios/core/legacy-compat'
