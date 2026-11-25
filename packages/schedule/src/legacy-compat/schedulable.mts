import { createClassContext } from '@navios/core/legacy-compat'

import type { ClassType } from '@navios/core'

import { Schedulable as OriginalSchedulable } from '../schedulable/schedulable.mjs'

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
    const originalDecorator = OriginalSchedulable(options)
    return originalDecorator(target, context)
  }
}
