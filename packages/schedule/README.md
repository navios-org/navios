# @navios/schedule

Cron jobs for [Navios](https://navios.tech) applications. Mark a method with `@Cron` and it runs on a schedule, in a service that injects the same dependencies your handlers do. Jobs start when the application is ready and stop when it closes. Built on the [`cron`](https://github.com/kelektiv/node-cron) package.

**[Documentation](https://navios.tech/docs/server/guides/scheduled-jobs)**

## Install

```bash
npm install @navios/schedule
```

`@navios/core` is a peer dependency. Nothing else is needed: the example is a worker that only runs scheduled jobs. In an HTTP application, pass the same plugin to `NaviosFactory.create` from `@navios/server`.

## Example

```ts
import { createApplication, inject, Injectable, Logger, Module } from '@navios/core'
import { Cron, Schedulable, Schedule, schedulePlugin } from '@navios/schedule'

@Injectable()
class SessionsService {
  async deleteExpired() {
    return 0
  }
}

@Schedulable()
class MaintenanceJobs {
  private readonly sessions = inject(SessionsService)
  private readonly logger = inject(Logger, { context: 'MaintenanceJobs' })

  @Cron(Schedule.EveryHour)
  async purgeSessions() {
    const removed = await this.sessions.deleteExpired()
    this.logger.log(`Removed ${removed} expired sessions`)
  }

  @Cron('0 4 * * *', { disabled: true })
  async rebuildSearchIndex() {
    // created but not started: start it by hand through SchedulerService
  }
}

@Module()
class AppModule {}

const app = createApplication(AppModule, {
  plugins: [schedulePlugin({ services: [MaintenanceJobs] })],
})

await app.start()
app.enableShutdownHooks()
```

`@Schedulable()` registers the class as a service, so it takes no `@Injectable()`. Jobs start at the end of `app.init()`; `app.close()` stops them and waits for the runs in progress. An error thrown by a job is logged and the job stays on its schedule.

## What else it does

| Need                                     | How                                                         | Docs                                                                                                                       |
| ---------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Five- and six-field expressions, presets | `@Cron('*/30 * * * * *')`, the `Schedule` enum              | [Cron expressions](https://navios.tech/docs/server/guides/scheduled-jobs#cron-expressions)                                 |
| Keep a feature's jobs in its module      | `inject(SchedulerService).register(Jobs)` in `onModuleInit` | [Running them with an application](https://navios.tech/docs/server/guides/scheduled-jobs#running-them-with-an-application) |
| A schedule in a given time zone          | `@Cron('0 4 * * *', { timeZone: 'Europe/Kyiv' })`           | [Cron expressions](https://navios.tech/docs/server/guides/scheduled-jobs#cron-expressions)                                 |
| Fresh services for every run             | `@Schedulable({ scope: InjectableScope.Request })`          | [A DI scope per run](https://navios.tech/docs/server/guides/scheduled-jobs#a-di-scope-per-run)                             |
| Start, stop or trigger a job at run time | `SchedulerService`: `getJob()`, `startAll()`, `stopAll()`   | [Managing jobs at run time](https://navios.tech/docs/server/guides/scheduled-jobs#managing-jobs-at-run-time)               |
| Know what happens when a job throws      | logged, not retried, other jobs unaffected                  | [Errors](https://navios.tech/docs/server/guides/scheduled-jobs#errors)                                                     |
| Jobs without an HTTP application         | `new Container()`, `scheduler.start()`                      | [Without an application](https://navios.tech/docs/server/guides/scheduled-jobs#without-an-application)                     |

A job method may be synchronous or `async` and takes one `@Cron()`; a second one on the same method throws. A subclass of a schedulable class inherits its jobs and may reschedule one by decorating its override. `register()` throws, naming the class and the method, when a cron expression or time zone is invalid, and then registers none of the jobs of that class.

Runs of one job are not serialised: a run that outlasts its interval overlaps with the next one. Projects that keep `experimentalDecorators` on import `Schedulable` and `Cron` from `@navios/schedule/legacy-compat`; see [Legacy decorators](https://navios.tech/docs/server/reference/legacy-decorators).

## Upgrading from 1.x

Jobs now follow the application lifecycle instead of starting on `register()`, and every run has its own DI scope. See [Migrating to 2.0](https://navios.tech/docs/server/reference/migrating-to-2#naviosschedule), or [CHANGELOG.md](./CHANGELOG.md) for the full list.

## License

MIT
