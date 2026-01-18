import { globalRegistry, Injectable, Registry } from '@navios/core'

import type { ClassType } from '@navios/core'

import { getScheduleMetadata } from '../metadata/index.mjs'

/**
 * Decorator that marks a class as schedulable and makes it injectable.
 *
 * Classes decorated with `@Schedulable()` can contain methods decorated with `@Cron()`
 * that will be automatically scheduled and executed. This decorator also applies
 * the `@Injectable()` decorator, making the class available for dependency injection.
 *
 * @example
 * ```typescript
 * @Schedulable()
 * class TaskService {
 *   @Cron('0 0 * * *')
 *   async dailyTask() {
 *     // This will run daily at midnight
 *   }
 * }
 *
 * // Register the service
 * schedulerService.register(TaskService)
 * ```
 *
 * @throws {Error} If applied to something other than a class
 *
 * @public
 */
export function Schedulable({ registry }: { registry?: Registry } = {}) {
  return (target: ClassType, context: ClassDecoratorContext) => {
    if (context.kind !== 'class') {
      throw new Error(`SchedulableDecorator can only be applied to classes, not ${context.kind}`)
    }
    if (context.metadata) {
      getScheduleMetadata(target, context)
    }
    return Injectable({ registry: registry ?? globalRegistry })(target, context)
  }
}
