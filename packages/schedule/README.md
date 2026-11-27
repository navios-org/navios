# @navios/schedule

Cron jobs for [Navios](https://navios.tech) applications. Mark a method with `@Cron` and it runs on a schedule, in a service that injects the same dependencies your handlers do. Jobs start when the application has started and stop when it closes. Built on the [`cron`](https://github.com/kelektiv/node-cron) package.

**[Documentation](https://navios.tech/docs/server/guides/scheduled-jobs)**

## Install

```bash
npm install @navios/schedule@next @navios/core@next
```

The 2.0 alpha is published under the `next` tag. All `@navios` packages of a project must have the same alpha version, because an alpha may break between releases.

`@navios/core` is a peer dependency. Jobs are kept on their schedule by timers of the process, so the package is for long-lived processes; on Cloudflare Workers or AWS Lambda, let the platform's scheduler call `getJob(Jobs, 'method')?.run()`, see [Long-lived processes only](https://navios.tech/docs/server/guides/scheduled-jobs#long-lived-processes-only). Nothing else is needed: the example is a worker that only runs scheduled jobs. In an HTTP application, pass the same transport to `NaviosFactory.create` from `@navios/server`.

## Example

```ts
import { createApplication, inject, Injectable, Logger, Module } from '@navios/core'
import { Cron, Schedulable, Schedule, scheduleTransport } from '@navios/schedule'

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
    // created but not started: start or run it by hand through SchedulerService
  }
}

@Module({ jobs: [MaintenanceJobs] })
class AppModule {}

const app = createApplication(AppModule, {
  transports: [scheduleTransport()],
})

app.enableShutdownHooks()

await app.start()
```

`@Schedulable()` registers the class as a service, so it takes no `@Injectable()`. Jobs start with `app.start()`, or with `app.listen()` of an HTTP application, and not with `app.init()`. `app.close()` stops them and waits for the runs in progress, at most `shutdownTimeout`, before anything they use is shut down. An error thrown by a job is logged and the job stays on its schedule.

## What else it does

| Need                                     | How                                                                                  | Docs                                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Five- and six-field expressions, presets | `@Cron('*/30 * * * * *')`, the `Schedule` enum                                       | [Cron expressions](https://navios.tech/docs/server/guides/scheduled-jobs#cron-expressions)                                 |
| Keep a feature's jobs in its module      | `@Module({ jobs: [Jobs] })`, or `scheduleTransport({ jobs: [Jobs] })`                | [Running them with an application](https://navios.tech/docs/server/guides/scheduled-jobs#running-them-with-an-application) |
| A schedule in a given time zone          | `@Cron('0 4 * * *', { timeZone: 'Europe/Kyiv' })`, `scheduleTransport({ timeZone })` | [Cron expressions](https://navios.tech/docs/server/guides/scheduled-jobs#cron-expressions)                                 |
| Stop early when the application closes   | `job({ signal }: JobRun)`                                                            | [What a job is called with](https://navios.tech/docs/server/guides/scheduled-jobs#what-a-job-is-called-with)               |
| Runs that may overlap                    | `@Cron(expression, { overlap: 'allow' })`; they are skipped by default               | [Overlapping runs](https://navios.tech/docs/server/guides/scheduled-jobs#overlapping-runs)                                 |
| Fresh services for every run             | `@Schedulable({ scope: InjectableScope.Request })`                                   | [A DI scope per run](https://navios.tech/docs/server/guides/scheduled-jobs#a-di-scope-per-run)                             |
| Start, stop or run a job at run time     | `SchedulerService`: `getJob(Jobs, 'method')?.run()`                                  | [Managing jobs at run time](https://navios.tech/docs/server/guides/scheduled-jobs#managing-jobs-at-run-time)               |
| Report failed jobs                       | `scheduleTransport({ onError })`                                                     | [Errors](https://navios.tech/docs/server/guides/scheduled-jobs#errors)                                                     |
| No jobs in tests or in a web process     | `scheduleTransport({ enabled: false })`                                              | [Running them with an application](https://navios.tech/docs/server/guides/scheduled-jobs#running-them-with-an-application) |
| Jobs without an application              | `new Container()`, `scheduler.start()`                                               | [Without an application](https://navios.tech/docs/server/guides/scheduled-jobs#without-an-application)                     |

A job is a public instance method, synchronous or `async`, with one `@Cron()`; a second one on the same method throws. A subclass that is itself `@Schedulable()` inherits the jobs of its parent and may reschedule one by decorating its override. A job that cannot be scheduled, because its expression or time zone is invalid or empty or because the expression never occurs, fails the start of the application with an error that names the class and the method.

A job runs in every process that starts it: there is no lock between several instances of an application, and no retry. Interceptors and guards do not apply to jobs. Projects that keep `experimentalDecorators` on import `Schedulable` and `Cron` from `@navios/schedule/legacy-compat`; see [Legacy decorators](https://navios.tech/docs/server/reference/legacy-decorators).

## Upgrading from 1.x

Jobs now follow the application lifecycle instead of starting on `register()`, runs of one job no longer overlap, and every run has its own DI scope. See [Migrating to 2.0](https://navios.tech/docs/server/reference/migrating-to-2#naviosschedule), or [CHANGELOG.md](./CHANGELOG.md) for the full list.

## License

MIT
