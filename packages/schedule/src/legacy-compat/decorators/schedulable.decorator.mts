import { createClassContext } from '@navios/core/legacy-compat'

import type { ClassType, Registry } from '@navios/core'

import { Schedulable as OriginalSchedulable } from '../../decorators/schedulable.decorator.mjs'

/**
 * Options for the Schedulable decorator.
 */
export interface SchedulableOptions {
  /**
   * The registry to register the service with.
   * If not provided, the global registry will be used.
   */
  registry?: Registry
}

/**
 * Legacy-compatible Schedulable decorator.
 *
 * Works with TypeScript experimental decorators (legacy API).
 * Marks a class as schedulable and makes it injectable.
 *
 * @param options - Optional configuration including the registry to use
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
  return function (target: ClassType) {
    const context = createClassContext(target)
    const originalDecorator = OriginalSchedulable(options)
    return originalDecorator(target, context)
  }
}
