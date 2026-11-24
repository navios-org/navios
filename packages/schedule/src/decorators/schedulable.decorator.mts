import { registerInjectable } from '@navios/core'

import type { ClassType, InjectableScope } from '@navios/core'

import { getScheduleMetadata } from '../metadata/index.mjs'

/**
 * Options for the `@Schedulable()` decorator.
 *
 * @public
 */
export interface SchedulableOptions {
  /**
   * DI scope of the class. Defaults to `InjectableScope.Singleton`: one
   * instance runs every tick. With `InjectableScope.Request` each tick gets
   * its own instance, created in that tick's DI scope and destroyed after it.
   */
  scope?: InjectableScope
}

/**
 * Decorator that marks a class as schedulable and makes it injectable.
 *
 * Classes decorated with `@Schedulable()` can contain methods decorated with `@Cron()`.
 * The decorator also registers the class for dependency injection, as
 * `@Injectable()` does, so do not apply `@Injectable()` as well.
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
export function Schedulable({ scope }: SchedulableOptions = {}) {
  return <T extends ClassType>(target: T, context: ClassDecoratorContext): T => {
    if (context.kind !== 'class') {
      throw new Error(`SchedulableDecorator can only be applied to classes, not ${context.kind}`)
    }
    if (context.metadata) {
      getScheduleMetadata(target, context)
    }
    registerInjectable(target, { scope })
    return target
  }
}
