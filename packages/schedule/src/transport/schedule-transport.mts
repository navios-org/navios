import { defineTransport } from '@navios/core/transport'

import type { ClassType, Transport } from '@navios/core'
import type { ModuleNode, TransportHost } from '@navios/core/transport'

import { prepareJobs, SchedulerService, warnAboutUnregistered } from '../scheduler-service.mjs'

import type { JobRun } from '../jobs/scheduled-job.mjs'

import { moduleJobs } from './module-options.mjs'
import { driveScheduler } from './schedule-settings.mjs'

/**
 * Options of `scheduleTransport()`.
 *
 * @public
 */
export interface ScheduleTransportOptions {
  /**
   * Classes decorated with `@Schedulable()` whose jobs should run, next to
   * those that modules list in `jobs`.
   */
  services?: ClassType[]

  /**
   * Whether jobs are started. With `false` the classes are registered and
   * built, but nothing runs on a schedule: for tests, or for a process that
   * shares its modules with a worker.
   *
   * @default true
   */
  enabled?: boolean

  /** Time zone of the jobs that do not name one. Defaults to the one of the process. */
  timeZone?: string

  /**
   * Called with the error of every run that failed on its schedule, after it
   * has been logged. The run ends when a promise it returns has settled.
   */
  onError?: (error: unknown, run: JobRun) => void | Promise<void>
}

/**
 * Runs the application's cron jobs: the `@Cron` methods of the classes that
 * modules list in `jobs`, and of those given as `services`.
 *
 * `app.start()`, or `app.listen()` of an HTTP application, starts the jobs
 * once the application is initialised; `app.init()` starts nothing.
 * `app.close()` takes them off their schedule, aborts the signal their runs
 * were given and waits for the runs in progress, at most `shutdownTimeout`
 * milliseconds. Only then are the services they use shut down.
 *
 * @example
 * ```typescript
 * @Module({ jobs: [TaskService] })
 * class AppModule {}
 *
 * const app = createApplication(AppModule, {
 *   transports: [scheduleTransport()],
 * })
 * await app.start()
 * ```
 *
 * @public
 */
export const scheduleTransport = defineTransport<ScheduleTransportOptions | void, Transport>({
  name: 'schedule',
  create(host: TransportHost, options) {
    const { services = [], enabled = true, timeZone, onError } = options ?? {}
    driveScheduler(host.container, { timeZone, onError })
    let scheduler: SchedulerService | null = null
    return {
      async setup(graph: readonly ModuleNode[]) {
        scheduler = await host.container.get(SchedulerService)
        for (const service of new Set([...services, ...graph.flatMap(moduleJobs)])) {
          scheduler.register(service)
        }
        await scheduler[prepareJobs]()
      },
      start() {
        if (enabled) {
          scheduler![warnAboutUnregistered]()
          scheduler!.start()
        }
      },
      async stop(timeoutMs: number) {
        await scheduler?.stop(timeoutMs)
      },
    }
  },
})
