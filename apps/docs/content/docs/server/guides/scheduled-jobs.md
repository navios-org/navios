---
title: Scheduled jobs
---

# Scheduled jobs

`@navios/schedule` runs methods of a service on a cron schedule. It is built on the [`cron`](https://github.com/kelektiv/node-cron) package and uses the application's DI container, so a job injects the same services your handlers do.

```bash
npm install @navios/schedule
```

The package depends on `@navios/core` only. In an HTTP application the jobs run next to the server; a worker that does nothing but run jobs needs no adapter at all, see [Other transports](/docs/server/guides/other-transports).

## Declaring jobs

`@Schedulable()` marks a class that contains jobs and registers it as a service; do not add `@Injectable()` to the same class. `@Cron` marks a job method. A job method is `async` and takes no arguments.

```ts title="maintenance.jobs.mts"
import { inject, Logger } from '@navios/server'
import { Cron, Schedulable, Schedule } from '@navios/schedule'

import { SessionsService } from './sessions.service.mjs'

@Schedulable()
export class MaintenanceJobs {
  private readonly sessions = inject(SessionsService)
  private readonly logger = inject(Logger, { context: 'MaintenanceJobs' })

  @Cron(Schedule.EveryHour)
  async purgeSessions() {
    const removed = await this.sessions.deleteExpired()
    this.logger.log(`Removed ${removed} expired sessions`)
  }

  @Cron('0 4 * * *', { disabled: true })
  async rebuildSearchIndex() {
    // created but not started; see "Managing jobs at run time"
  }
}
```

## Running them with an application

List the classes in `schedulePlugin`:

```ts title="main.mts"
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { NaviosFactory } from '@navios/server'
import { schedulePlugin } from '@navios/schedule'

import { AppModule } from './app.module.mjs'
import { MaintenanceJobs } from './maintenance.jobs.mjs'

const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
  plugins: [schedulePlugin({ services: [MaintenanceJobs] })],
})

await app.listen({ port: 3000 })
```

The scheduler follows the application:

| When                 | What happens                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| End of `app.init()`  | Every job that is not `disabled` starts. Routes are compiled; the server is not listening yet         |
| `app.close()`        | Every job stops, and `close()` waits for the runs that are in progress                               |

So a job never runs before the application is fully built, and never after `close()` has returned. `close()` waits for running jobs without a time limit: a job that never finishes keeps it from returning, so give long jobs their own timeout.

A module can register classes itself instead of the plugin, which keeps a feature's jobs next to the feature:

```ts
import { inject, Module } from '@navios/server'
import { SchedulerService } from '@navios/schedule'

@Module()
export class MaintenanceModule {
  private readonly scheduler = inject(SchedulerService)

  onModuleInit() {
    this.scheduler.register(MaintenanceJobs)
  }
}
```

Both ways give the same lifecycle, because the scheduler starts and stops itself through application hooks. Those hooks run only on a `SchedulerService` that exists at the end of `init()`: when the plugin is not used and nothing injects the service, there is no scheduler and nothing starts. A class registered after the application has started has its jobs started at once.

## Cron expressions

An expression has five fields, or six when it starts with seconds:

```text
┌──────────── second (optional, 0-59)
│ ┌────────── minute (0-59)
│ │ ┌──────── hour (0-23)
│ │ │ ┌────── day of month (1-31)
│ │ │ │ ┌──── month (1-12)
│ │ │ │ │ ┌── day of week (0-6, Sunday is 0)
* * * * * *
```

| Expression        | Runs                              |
| ----------------- | --------------------------------- |
| `0 0 * * *`       | Daily at midnight                 |
| `0 9 * * 1-5`     | Weekdays at 09:00                 |
| `0 0 1 * *`       | On the first day of every month   |
| `*/30 * * * * *`  | Every 30 seconds                  |

Times are in the time zone of the process. Run the server with `TZ=UTC` when the schedule must not follow the host's zone.

The `Schedule` enum names the common ones:

| Constant               | Expression     | Constant            | Expression     |
| ---------------------- | -------------- | ------------------- | -------------- |
| `EveryMinute`          | `*/1 * * * *`  | `EveryThreeHours`   | `0 */3 * * *`  |
| `EveryFiveMinutes`     | `*/5 * * * *`  | `EveryFourHours`    | `0 */4 * * *`  |
| `EveryTenMinutes`      | `*/10 * * * *` | `EverySixHours`     | `0 */6 * * *`  |
| `EveryFifteenMinutes`  | `*/15 * * * *` | `EveryTwelveHours`  | `0 */12 * * *` |
| `EveryThirtyMinutes`   | `*/30 * * * *` | `EveryDay`          | `0 0 * * *`    |
| `EveryHour`            | `0 * * * *`    | `EveryWeek`         | `0 0 * * 0`    |
| `EveryTwoHours`        | `0 */2 * * *`  | `EveryMonth`        | `0 0 1 * *`    |

## A DI scope per run

Every run of a job happens in its own DI scope, created when the run starts and disposed when it ends, whether it succeeded or threw.

A `@Schedulable()` class is a singleton by default: one instance handles every run and may keep state between runs. Give it the request scope to get a fresh instance, and fresh request-scoped dependencies, for each run:

```ts title="import.jobs.mts"
import { inject, Injectable, InjectableScope } from '@navios/server'
import { Cron, Schedulable, Schedule } from '@navios/schedule'

@Injectable({ scope: InjectableScope.Request })
export class ImportBatch {
  readonly rows: string[] = []

  onServiceDestroy() {
    // runs after each run of the job
  }
}

@Schedulable({ scope: InjectableScope.Request })
export class ImportJobs {
  private readonly batch = inject(ImportBatch)

  @Cron(Schedule.EveryFifteenMinutes)
  async importOrders() {
    // this.batch belongs to this run only
  }
}
```

A singleton schedulable class cannot inject a request-scoped service; that is a scope mismatch error. Singleton dependencies are shared between runs in both cases. Scopes are explained in [Scopes](/docs/di/essentials/scopes).

A job is not an HTTP request. There is no `RequestContext` in a run, so context keys, request values and `ctx.use()` are not available; put per-run state in request-scoped services as above.

:::warning
Runs of one job are not serialised. When a run takes longer than the interval, the next one starts while it is still going, in its own scope. A job that must not overlap has to guard itself, for example with a lock in the database.
:::

## Managing jobs at run time

`SchedulerService` is injectable anywhere, and `app.get(SchedulerService)` returns it from outside.

| Method                      | Effect                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| `register(Class)`           | Creates the jobs of a `@Schedulable()` class. Registering the same class again does nothing |
| `getJob(Class, 'method')`   | The underlying `CronJob`, or `undefined`                                                 |
| `start()`                   | Starts every job that is not `disabled`. Called for you at the end of `init()`           |
| `stop()`                    | Stops every job and waits for running ones. Called for you by `close()`                  |
| `startAll()`                | Starts every registered job, including the `disabled` ones                               |
| `stopAll()`                 | Stops every job without waiting for running ones                                         |

`getJob` returns the `cron` package's own object, so its API applies: `isActive`, `start()`, `stop()`, `nextDate()` and `fireOnTick()`.

```ts
const scheduler = await app.get(SchedulerService)
const job = scheduler.getJob(MaintenanceJobs, 'rebuildSearchIndex')

job?.isActive // false: declared with { disabled: true }
job?.start() // put it on its schedule
await job?.fireOnTick() // or run it once, now
```

A `disabled` job is how you declare something that an operator, a feature flag or an admin endpoint switches on.

## Errors

An error thrown by a job is caught and logged by the scheduler with the job's name, such as `MaintenanceJobs.purgeSessions()`. The job stays on its schedule and other jobs are not affected. Nothing retries the failed run; the next run is the next tick.

`register()` throws when the class has no `@Schedulable()` decorator.

## Without an application

The scheduler needs only a DI container. Without an application nothing calls the bootstrap hook, so start it yourself:

```ts
import { Container } from '@navios/server'
import { SchedulerService } from '@navios/schedule'

import { MaintenanceJobs } from './maintenance.jobs.mjs'

const container = new Container()
const scheduler = await container.get(SchedulerService)

scheduler.register(MaintenanceJobs)
scheduler.start()

// later: stops the jobs and waits for running ones
await container.dispose()
```

Projects compiled with `experimentalDecorators` import `Schedulable` and `Cron` from `@navios/schedule/legacy-compat`; see [Legacy decorators](/docs/server/reference/legacy-decorators).
