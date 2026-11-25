import { createClassContext } from '@navios/core/legacy-compat'

import type { ClassType } from '@navios/core'

import { CronMetadataKey, getAllCronMetadata, inheritCronMetadata } from '../cron/cron-metadata.mjs'
import { Schedulable as OriginalSchedulable } from '../schedulable/schedulable.mjs'

import type { CronMetadata } from '../cron/cron-metadata.mjs'
import type { SchedulableOptions } from '../schedulable/schedulable.mjs'

/**
 * Legacy-compatible Schedulable decorator.
 *
 * Works with TypeScript experimental decorators (legacy API).
 * Marks a class as schedulable and makes it injectable.
 *
 * @param options - Optional configuration: the DI scope of the class
 * @returns A class decorator compatible with legacy decorator API
 *
 * @example
 * ```typescript
 * @Schedulable()
 * class TaskService {
 *   @Cron('0 0 * * *')
 *   async dailyTask() {
 *     console.log('Running daily task')
 *   }
 * }
 *
 * // Register the service
 * schedulerService.register(TaskService)
 * ```
 */
export function Schedulable(options: SchedulableOptions = {}) {
  return function <T extends ClassType>(target: T): T {
    const context = createClassContext(target)
    // Legacy metadata is kept per class and, unlike Stage 3 metadata, does not
    // inherit from the parent class. Copy the jobs of the parent classes, so a
    // subclass has them as it does with Stage 3 decorators.
    const jobs = getAllCronMetadata(context)
    for (
      let parent = Object.getPrototypeOf(target);
      typeof parent === 'function' && parent !== Function.prototype;
      parent = Object.getPrototypeOf(parent)
    ) {
      const parentJobs = createClassContext(parent).metadata?.[CronMetadataKey] as
        | Set<CronMetadata>
        | undefined
      if (parentJobs) {
        inheritCronMetadata(jobs, parentJobs)
      }
    }
    const originalDecorator = OriginalSchedulable(options)
    return originalDecorator(target, context)
  }
}
