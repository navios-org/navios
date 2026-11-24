# @navios/schedule

A powerful and type-safe job scheduling library for Navios applications, built on top of the popular `cron` package. Schedule and manage recurring tasks with decorator-based configuration and dependency injection support.

## Why @navios/schedule?

- **Type Safety**: Full TypeScript support with strict typing for cron expressions and job methods
- **Decorator-Based**: Clean, declarative API using decorators for defining schedulable services and cron jobs
- **Dependency Injection**: Seamless integration with Navios's dependency injection container
- **Error Handling**: Built-in error handling that logs errors without crashing the scheduler
- **Flexible Configuration**: Support for custom cron expressions and job-specific options
- **Application Lifecycle**: Jobs start when the application has been initialised and stop on `app.close()`
- **Per-Run Isolation**: Every run of a job gets its own DI scope
- **Runtime Control**: Start, stop, and manage individual jobs or all jobs at once
- **Pre-defined Schedules**: Common scheduling patterns available as constants

## Installation

```bash
npm install --save @navios/schedule @navios/core cron
```

or

```bash
yarn add @navios/schedule @navios/core cron
```

## Basic Usage

### 1. Create a Schedulable Service

```typescript
import { Cron, Schedulable, Schedule } from '@navios/schedule'

@Schedulable()
class TaskService {
  @Cron('0 0 * * *') // Run daily at midnight
  async dailyCleanup() {
    console.log('Running daily cleanup...')
    // Your cleanup logic here
  }

  @Cron(Schedule.EveryFiveMinutes)
  async healthCheck() {
    console.log('Performing health check...')
    // Your health check logic here
  }

  @Cron('*/30 * * * * *', { disabled: true })
  async disabledJob() {
    // This job won't run automatically
    console.log('This job is disabled')
  }
}
```

### 2. Register Schedulable Services

Either list the services in the plugin:

```typescript
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { NaviosFactory } from '@navios/core'
import { schedulePlugin } from '@navios/schedule'

const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
  plugins: [schedulePlugin({ services: [TaskService] })],
})

await app.listen({ port: 3000 })
```

or register them in a module's `onModuleInit`:

```typescript
import { inject, Module } from '@navios/core'
import { SchedulerService } from '@navios/schedule'

@Module()
export class AppModule {
  private readonly schedulerService = inject(SchedulerService)

  onModuleInit() {
    this.schedulerService.register(TaskService)
  }
}
```

Both do the same thing. Registering only creates the jobs; see the next section for when they run.

## Lifecycle

`SchedulerService` follows the application:

| When                                           | What happens                                                                                              |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `register(Service)`                            | The cron jobs are created. They are not running yet.                                                      |
| end of `app.init()` (`onApplicationBootstrap`) | Every registered job that is not `disabled` starts. Routes are compiled, the server is not listening yet. |
| `register(Service)` after that                 | The jobs of that service start immediately.                                                               |
| `app.close()` (`onApplicationShutdown`)        | Every job stops, and `close()` waits for the runs that are in progress.                                   |

So a job never runs before the application is fully built, and never after `app.close()` has returned.

The lifecycle is implemented by hooks on `SchedulerService` itself, not by the plugin, so it works the same with either way of registering. Navios calls `onApplicationBootstrap` only on services that exist at the end of `init()`: if nothing injects `SchedulerService` and the plugin is not used, there is no scheduler and nothing starts. Calling `register()` from a request handler long after bootstrap is fine, because a started scheduler starts new services at once.

`close()` waits for running jobs without a time limit. A job that never finishes keeps `close()` from returning, so give long jobs their own timeout.

### Without an application

With a bare container there is no bootstrap hook, so start the scheduler yourself:

```typescript
import { Container } from '@navios/core'
import { SchedulerService } from '@navios/schedule'

const container = new Container()
const schedulerService = await container.get(SchedulerService)

schedulerService.register(TaskService)
schedulerService.start()

// later: stops the jobs and waits for running ones
await container.dispose()
```

## Per-Run DI Scope

Each run of a job happens in its own DI scope, created with `container.createScope()` and disposed when the run ends, whether it succeeded or threw.

A `@Schedulable()` class is a singleton by default: one instance handles every run, and can keep state between runs. Make it request-scoped to get a fresh instance, and fresh request-scoped dependencies, for every run:

```typescript
import { inject, Injectable, InjectableScope } from '@navios/core'
import { Cron, Schedulable, Schedule } from '@navios/schedule'

@Injectable({ scope: InjectableScope.Request })
class UnitOfWork {
  onServiceDestroy() {
    // runs after each run of the job
  }
}

@Schedulable({ scope: InjectableScope.Request })
class ReportService {
  private readonly unitOfWork = inject(UnitOfWork)

  @Cron(Schedule.EveryHour)
  async buildReport() {
    // this.unitOfWork belongs to this run only
  }
}
```

A singleton schedulable class cannot inject a request-scoped service; `@navios/di` reports that as a scope mismatch. Singleton dependencies are shared between runs in both cases.

Runs of the same job are not serialised: if a run takes longer than the interval, the next one starts while it is still going, in its own scope.

## Cron Expression Format

Cron expressions follow the standard 5 or 6 field format:

```
# ┌────────────── second (optional, 0-59)
# │ ┌──────────── minute (0-59)
# │ │ ┌────────── hour (0-23)
# │ │ │ ┌──────── day of month (1-31)
# │ │ │ │ ┌────── month (1-12)
# │ │ │ │ │ ┌──── day of week (0-6, Sunday to Saturday)
# │ │ │ │ │ │
# │ │ │ │ │ │
# * * * * * *
```

### Examples:

- `'0 0 * * *'` - Daily at midnight
- `'*/5 * * * *'` - Every 5 minutes
- `'0 9 * * 1-5'` - Every weekday at 9 AM
- `'0 0 1 * *'` - First day of every month at midnight
- `'*/30 * * * * *'` - Every 30 seconds (6-field format)

## Pre-defined Schedule Constants

For common scheduling patterns, use the `Schedule` enum:

```typescript
import { Schedule } from '@navios/schedule'

@Schedulable()
class ExampleService {
  @Cron(Schedule.EveryMinute)
  async everyMinute() {}

  @Cron(Schedule.EveryFiveMinutes)
  async everyFiveMinutes() {}

  @Cron(Schedule.EveryHour)
  async hourly() {}

  @Cron(Schedule.EveryDay)
  async daily() {}

  @Cron(Schedule.EveryWeek)
  async weekly() {}

  @Cron(Schedule.EveryMonth)
  async monthly() {}
}
```

Available constants:

- `EveryMinute` - `'*/1 * * * *'`
- `EveryFiveMinutes` - `'*/5 * * * *'`
- `EveryTenMinutes` - `'*/10 * * * *'`
- `EveryFifteenMinutes` - `'*/15 * * * *'`
- `EveryThirtyMinutes` - `'*/30 * * * *'`
- `EveryHour` - `'0 * * * *'`
- `EveryTwoHours` - `'0 */2 * * *'`
- `EveryThreeHours` - `'0 */3 * * *'`
- `EveryFourHours` - `'0 */4 * * *'`
- `EverySixHours` - `'0 */6 * * *'`
- `EveryTwelveHours` - `'0 */12 * * *'`
- `EveryDay` - `'0 0 * * *'`
- `EveryWeek` - `'0 0 * * 0'`
- `EveryMonth` - `'0 0 1 * *'`

## Advanced Usage

### Cron Options

```typescript
@Schedulable()
class ConfigurableService {
  @Cron('0 2 * * *', { disabled: true })
  async maintenanceJob() {
    // This job is disabled by default
    console.log('Running maintenance...')
  }
}
```

### Runtime Job Management

```typescript
// Get a specific job
const job = schedulerService.getJob(TaskService, 'dailyCleanup')
console.log('Job is active:', job?.isActive)

// Start all jobs, including the ones declared with `disabled: true`
schedulerService.startAll()

// Stop all jobs (runs in progress are not awaited)
schedulerService.stopAll()

// Start one disabled job by hand
schedulerService.getJob(TaskService, 'disabledJob')?.start()
```

### Multiple Jobs in One Service

```typescript
@Schedulable()
class DataProcessingService {
  @Cron('0 1 * * *') // 1 AM daily
  async processUserData() {
    console.log('Processing user data...')
  }

  @Cron('0 3 * * *') // 3 AM daily
  async generateReports() {
    console.log('Generating reports...')
  }

  @Cron(Schedule.EveryFifteenMinutes)
  async syncExternalData() {
    console.log('Syncing external data...')
  }
}
```

### Error Handling

The scheduler automatically handles errors in job execution:

```typescript
@Schedulable()
class RobustService {
  @Cron(Schedule.EveryMinute)
  async riskyJob() {
    try {
      // Your job logic here
      await someRiskyOperation()
    } catch (error) {
      // Handle specific errors if needed
      console.error('Job failed:', error)
      throw error // Re-throw to let scheduler log it
    }
  }
}
```

Jobs that throw errors will:

- Be logged automatically by the scheduler
- Continue running on their schedule (errors don't stop the job)
- Not affect other jobs in the same or different services

## API Reference

### Decorators

#### `@Schedulable(options?)`

Marks a class as schedulable and makes it injectable. Required for any class that contains `@Cron` decorated methods. Do not add `@Injectable()` to the same class.

**Parameters:**

- `options?: SchedulableOptions`
  - `scope?: InjectableScope` - `Singleton` (default) or `Request` for one instance per run

#### `@Cron(cronTime, options?)`

Decorates a method to run on a cron schedule.

**Parameters:**

- `cronTime: string` - Cron expression (5 or 6 fields)
- `options?: CronOptions` - Optional configuration
  - `disabled?: boolean` - Whether the job should be disabled by default

### SchedulerService

#### Methods

- `register(service: ClassType)` - Register a schedulable service. Registering the same class again does nothing
- `getJob<T>(service: T, method: keyof InstanceType<T>): CronJob | undefined` - Get a specific job instance
- `start()` - Start every job that is not `disabled`, and start services registered later at once. Called by `onApplicationBootstrap`
- `stop(): Promise<void>` - Stop every job and wait for running ones. Called by `onApplicationShutdown` and when the container is disposed
- `startAll()` - Start all registered jobs, including disabled ones
- `stopAll()` - Stop all registered jobs without waiting for running ones

### `schedulePlugin(options)`

A Navios plugin. `options.services` is the list of `@Schedulable()` classes to register.

### Legacy decorators

Projects compiled with `experimentalDecorators` import `Schedulable` and `Cron` from `@navios/schedule/legacy-compat`. Everything else is the same.

## Best Practices

1. **Registration**: Register schedulable services with `schedulePlugin` or in a module's `onModuleInit`, so that they are known before the application starts

2. **Error Handling**: Implement proper error handling within your job methods, but let the scheduler handle logging

3. **Resource Management**: Be mindful of long-running jobs that might overlap with subsequent executions

4. **Testing**: Replace the dependencies of a schedulable service with `provide(Token, Mock)` in the application or container `providers`

5. **Monitoring**: Consider adding logging or monitoring to track job execution and failures

## Requirements

- Node.js 18+
- TypeScript 5.0+
- `@navios/core` 2.0 for dependency injection and the application lifecycle
- `cron` package for job scheduling
