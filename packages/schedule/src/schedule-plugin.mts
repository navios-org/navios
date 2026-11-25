import { definePlugin } from '@navios/core'

import type { ClassType } from '@navios/core'

import { SchedulerService } from './scheduler-service.mjs'

/**
 * Options of `schedulePlugin()`.
 *
 * @public
 */
export interface SchedulePluginOptions {
  /** Classes decorated with `@Schedulable()` whose cron jobs should run. */
  services: ClassType[]
}

/**
 * Plugin that registers schedulable services with the `SchedulerService`.
 *
 * The services are registered and their jobs started when the application has
 * been initialised, and the jobs are stopped by `app.close()`.
 *
 * @example
 * ```typescript
 * const app = await NaviosFactory.create(AppModule, {
 *   adapter: defineFastifyEnvironment(),
 *   plugins: [schedulePlugin({ services: [TaskService] })],
 * })
 * ```
 *
 * @public
 */
export const schedulePlugin = definePlugin<SchedulePluginOptions>({
  name: 'navios:schedule',
  setup(api, options) {
    let scheduler: SchedulerService | null = null
    api.onBootstrap(async () => {
      scheduler = await api.container.get(SchedulerService)
      for (const service of options.services) {
        scheduler.register(service)
      }
      // The service also starts itself in `onApplicationBootstrap`, which runs
      // right after this hook; `start()` and `stop()` can be called twice.
      scheduler.start()
    })
    api.onShutdown(async () => {
      await scheduler?.stop()
    })
  },
})
