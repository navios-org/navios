---
title: Scheduled jobs
---

# Scheduled jobs

`@navios/schedule` runs methods of a service on a cron schedule. It is built on the [`cron`](https://github.com/kelektiv/node-cron) package and uses the application's DI container, so a job injects the same services your handlers do.

```bash
npm install @navios/schedule@next
```

The package depends on `@navios/core` only. In an HTTP application the jobs run next to the server; a worker that does nothing but run jobs needs no adapter at all; see [Other transports](/docs/server/guides/other-transports).

## Declaring jobs

`@Schedulable()` marks a class that contains jobs and registers it as a service; do not add `@Injectable()` to the same class. `@Cron` marks a job method: a public instance method, synchronous or `async`, whose result is ignored. It takes one `@Cron()`; a second one on the same method throws. A subclass of a schedulable class that is decorated itself inherits its jobs and may reschedule one by decorating its override.

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

List the classes in the module they belong to, and give the application the schedule transport:

```ts title="app.module.mts"
import { Module } from '@navios/server'

import { MaintenanceJobs } from './maintenance.jobs.mjs'

@Module({ jobs: [MaintenanceJobs] })
export class AppModule {}
```

```ts title="main.mts"
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { NaviosFactory } from '@navios/server'
import { scheduleTransport } from '@navios/schedule'

import { AppModule } from './app.module.mjs'

const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
  transports: [scheduleTransport()],
})

await app.listen({ port: 3000 })
```

An application has one schedule transport. Without it `jobs` is ignored, so a web process and a worker can share their modules.

| Option     | Meaning                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `jobs`     | `@Schedulable()` classes to run next to those that modules list in their own `jobs`                                            |
| `enabled`  | `false` registers and builds the classes and starts nothing. For a process, or a test, that shares its modules with a worker    |
| `timeZone` | The time zone of the jobs that do not name one                                                                                 |
| `onError`  | Called with the error of a failed run; see [Errors](#errors)                                                                   |

The jobs follow the application:

| When                            | What happens                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `app.init()`                    | The classes are registered and the singletons among them built, so a mistake in a job or its wiring fails `init()` |
| `app.start()` or `app.listen()` | Every job that is not `disabled` starts, after all bootstrap hooks                                                 |
| `app.close()`                   | Every job stops, the signal of the runs in progress is aborted, and `close()` waits for them                       |

`app.init()` and `app.inject()` start nothing, so tests run no jobs. Neither does an application that fails to start.

### Long-lived processes only

The schedule is kept by timers inside the process, so the package is for a process that stays up: a server that listens, or a worker started with `app.start()`. A deployment where the platform calls the application, such as Cloudflare Workers or AWS Lambda with [`@navios/adapter-srvx`](/docs/server/adapters/srvx), only calls `app.init()`: no job ever starts there, and a timer would not survive between invocations anyway.

On such a platform let its scheduler keep the time (Cron Triggers on Cloudflare, EventBridge Scheduler on AWS) and run the job from the handler it calls. `run()` needs `init()` only:

```ts
// in the scheduled() handler of a Worker, or a Lambda function that EventBridge invokes
const scheduler = await app.get(SchedulerService)
await scheduler.getJob(MaintenanceJobs, 'purgeSessions')?.run()
```

The run gets its own DI scope and its errors reject the promise, as described in [Managing jobs at run time](#managing-jobs-at-run-time). The cron expression of `@Cron` is not used in that case; the platform's schedule is.

`close()` waits for running jobs at most `shutdownTimeout` milliseconds (10 seconds by default), then logs the names of those it gave up on. The services a job uses are shut down after that, not before. A job may call `app.close()` itself, for a worker that runs once and exits; its own run is not waited for.

A class that is only known at run time is registered through `SchedulerService`, from `onModuleInit` or later:

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

A class registered after the application has started has its jobs started at once. Two mistakes are logged as warnings: registering a class in an application without the transport, and injecting a schedulable class that is listed nowhere.

## What a job is called with

A job method may take one argument, the `JobRun`:

| Property      | Meaning                                                                     |
| ------------- | --------------------------------------------------------------------------- |
| `name`        | The name of the job, such as `MaintenanceJobs.purgeSessions()`              |
| `scheduledAt` | The time of the schedule this run belongs to; `null` for a run by hand      |
| `signal`      | An `AbortSignal`, aborted when the application closes                       |

```ts
import { Cron, Schedulable, Schedule, type JobRun } from '@navios/schedule'

@Schedulable()
export class FeedJobs {
  @Cron(Schedule.EveryFifteenMinutes)
  async refresh({ signal }: JobRun) {
    for (const url of feeds) {
      signal.throwIfAborted()
      await fetch(url, { signal })
    }
  }
}
```

A run that ends with the `AbortError` of its signal is logged as interrupted, not as failed.

## Overlapping runs

When a run takes longer than the interval, the ticks that come while it is still going are skipped. The first of them is logged as a warning. Give a job whose runs may overlap `@Cron(Schedule.EveryMinute, { overlap: 'allow' })`.

This holds within one process. Two instances of an application both run every job; a job that must run once in a cluster has to guard itself, for example with a lock in the database.

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

Times are in the time zone of the process, unless the job names an IANA time zone, `@Cron('0 4 * * *', { timeZone: 'Europe/Kyiv' })`, or the transport does, `scheduleTransport({ timeZone: 'UTC' })`. When the clocks change, a daily job whose time does not exist runs at the end of the gap, and one whose time happens twice runs once.

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

A job is not an HTTP request. There is no `RequestContext` in a run, also when a request started the job, so context keys, request values and `ctx.use()` are not available; put per-run state in request-scoped services as above. Guards and interceptors, `app.intercept()` included, do not apply to jobs.

## Managing jobs at run time

`SchedulerService` is injectable anywhere, and `app.get(SchedulerService)` returns it from outside.

| Method                    | Effect                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `register(Class)`         | Creates the jobs of a `@Schedulable()` class. Registering the same class again does nothing                                                |
| `getJob(Class, 'method')` | The job, or `undefined`                                                                                                                    |
| `start()`                 | Starts every job that is not `disabled`. Called for you when the application starts                                                        |
| `stop(timeoutMs?)`        | Stops every job and waits for running ones, 10 seconds by default. Called for you by `close()`; `start()` afterwards resumes the schedules |

A job has these members:

| Member               | Meaning                                                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `name`               | `MaintenanceJobs.purgeSessions()`                                                                                          |
| `active`, `running`  | Whether it is on its schedule; whether a run is in progress                                                                |
| `nextRun`, `lastRun` | A `Date`, or `null`. `lastRun` is when the last run started                                                                |
| `start()`, `stop()`  | Puts it on its schedule or takes it off; a run in progress goes on                                                         |
| `run()`              | Runs it now. Resolves when the run has ended and rejects with its error; rejects when it is already running (see [Overlapping runs](#overlapping-runs)) |

```ts
const scheduler = await app.get(SchedulerService)
const job = scheduler.getJob(MaintenanceJobs, 'rebuildSearchIndex')

job?.active // false: declared with { disabled: true }
job?.start() // put it on its schedule
await job?.run() // or run it once, now
```

A `disabled` job is how you declare something that an operator, a feature flag or an admin endpoint switches on.

## Errors

An error thrown by a job is caught and logged by the scheduler with the job's name, such as `MaintenanceJobs.purgeSessions()`. The job stays on its schedule and other jobs are not affected. Nothing retries the failed run; the next run is the next tick. To report it elsewhere as well:

```ts
scheduleTransport({
  onError: (error, { name, scheduledAt }) => {
    errorTracker.capture(error, { job: name, scheduledAt })
  },
})
```

The run counts as in progress until a promise that `onError` returns has settled. The error of a run started with `run()` goes to its caller instead, and is neither logged nor passed to `onError`.

`register()` throws when the class has no `@Schedulable()` decorator. It also throws, naming the class and the method, when a cron expression or a time zone is invalid or empty, or when the expression never occurs, and then registers none of the jobs of that class. For classes that modules list, that is an error of `app.init()`.

## Without an application

The scheduler needs only a DI container. Without an application nothing starts or stops it, so do it yourself:

```ts
import { Container } from '@navios/server'
import { SchedulerService } from '@navios/schedule'

import { MaintenanceJobs } from './maintenance.jobs.mjs'

const container = new Container()
const scheduler = await container.get(SchedulerService)

scheduler.start()
scheduler.register(MaintenanceJobs)

// later: the jobs first, then what they use
await scheduler.stop()
await container.dispose()
```

Projects compiled with `experimentalDecorators` import `Schedulable` and `Cron` from `@navios/schedule/legacy-compat`; see [Legacy decorators](/docs/server/reference/legacy-decorators).
