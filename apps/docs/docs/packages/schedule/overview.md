---
sidebar_position: 1
---

# @navios/schedule

A powerful and type-safe job scheduling library for Navios applications, built on top of the popular `cron` package. Schedule and manage recurring tasks with decorator-based configuration and dependency injection support.

## Features

- **Type Safety**: Full TypeScript support with strict typing for cron expressions and job methods
- **Decorator-Based**: Clean, declarative API using decorators for defining schedulable services and cron jobs
- **Dependency Injection**: Seamless integration with Navios's dependency injection container
- **Error Handling**: Built-in error handling that logs errors without crashing the scheduler
- **Flexible Configuration**: Support for custom cron expressions and job-specific options
- **Runtime Control**: Start, stop, and manage individual jobs or all jobs at once
- **Pre-defined Schedules**: Common scheduling patterns available as constants

## Installation

```bash
npm install --save @navios/schedule @navios/core cron
# or
yarn add @navios/schedule @navios/core cron
```

## Quick Start

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

Register your schedulable services in a module's `onModuleInit` method:

```typescript
import { inject, Injectable, Module, OnModuleInit } from '@navios/core'
import { SchedulerService } from '@navios/schedule'

@Module({})
export class AppModule implements OnModuleInit {
  private readonly schedulerService = inject(SchedulerService)

  async onModuleInit() {
    // Register schedulable services
    this.schedulerService.register(TaskService)
  }
}
```

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

### Examples

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

// Start all jobs
schedulerService.startAll()

// Stop all jobs
schedulerService.stopAll()
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

#### `@Schedulable()`

Marks a class as schedulable and makes it injectable. Required for any class that contains `@Cron` decorated methods.

#### `@Cron(cronTime, options?)`

Decorates a method to run on a cron schedule.

**Parameters:**

- `cronTime: string` - Cron expression (5 or 6 fields)
- `options?: CronOptions` - Optional configuration
  - `disabled?: boolean` - Whether the job should be disabled by default

### SchedulerService

#### Methods

- `register(service: ClassType)` - Register a schedulable service
- `getJob<T>(service: T, method: keyof InstanceType<T>): CronJob | undefined` - Get a specific job instance
- `startAll()` - Start all registered jobs
- `stopAll()` - Stop all registered jobs

## Best Practices

1. **Module Registration**: Always register schedulable services in a module's `onModuleInit` method for proper lifecycle management

2. **Error Handling**: Implement proper error handling within your job methods, but let the scheduler handle logging

3. **Resource Management**: Be mindful of long-running jobs that might overlap with subsequent executions

4. **Testing**: Use dependency injection to mock schedulable services in tests

5. **Monitoring**: Consider adding logging or monitoring to track job execution and failures

## Integration with Navios Server

See the [Schedule Recipe](/docs/server/recipes/schedule) for a complete example of using scheduled jobs with Navios Server.

## License

MIT

