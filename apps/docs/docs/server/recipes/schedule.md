---
sidebar_position: 2
title: Task Scheduling
---

# Task Scheduling

Type-safe job scheduling library for the Navios framework. Provides decorator-based cron scheduling with seamless integration into Navios's dependency injection system.

**Package:** `@navios/schedule`
**License:** MIT
**Dependencies:** `cron` (^4.4.0)

## Installation

```bash
npm install @navios/schedule
```

## Quick Start

```typescript
import { inject, Module, OnModuleInit } from '@navios/core'
import { Cron, Schedulable, Schedule, SchedulerService } from '@navios/schedule'

@Schedulable()
class DataProcessingService {
  @Cron(Schedule.EveryHour)
  async processHourlyData() {
    console.log('Processing hourly data...')
  }

  @Cron('0 9 * * 1-5')
  async sendDailyReport() {
    console.log('Sending daily report...')
  }
}

@Module({ controllers: [] })
class AppModule implements OnModuleInit {
  private scheduler = inject(SchedulerService)

  async onModuleInit() {
    this.scheduler.register(DataProcessingService)
  }
}
```

## Decorators

### @Schedulable()

Marks a class as schedulable and makes it injectable:

```typescript
@Schedulable()
class MyScheduledService {
  @Cron('* * * * *')
  async runEveryMinute() {}
}
```

### @Cron(cronTime, options?)

Decorates a method to run on a cron schedule:

```typescript
@Schedulable()
class ReportService {
  @Cron('0 9 * * 1-5')
  async sendDailyReport() {}

  @Cron(Schedule.EveryHour)
  async checkMetrics() {}

  @Cron('0 2 * * *', { disabled: true })
  async maintenanceJob() {}
}
```

## Cron Expressions

| Expression    | Description        |
| ------------- | ------------------ |
| `* * * * *`   | Every minute       |
| `*/5 * * * *` | Every 5 minutes    |
| `0 * * * *`   | Every hour         |
| `0 0 * * *`   | Daily at midnight  |
| `0 9 * * 1-5` | Weekdays at 9 AM   |
| `0 0 1 * *`   | First day of month |

## Schedule Constants

```typescript
import { Schedule } from '@navios/schedule'

@Cron(Schedule.EveryMinute)      // '*/1 * * * *'
@Cron(Schedule.EveryFiveMinutes) // '*/5 * * * *'
@Cron(Schedule.EveryHour)        // '0 * * * *'
@Cron(Schedule.EveryDay)         // '0 0 * * *'
@Cron(Schedule.EveryWeek)        // '0 0 * * 0'
@Cron(Schedule.EveryMonth)       // '0 0 1 * *'
```

## SchedulerService

### Register Services

```typescript
@Module({})
class AppModule implements OnModuleInit {
  private scheduler = inject(SchedulerService)

  async onModuleInit() {
    this.scheduler.register(DataSyncService)
    this.scheduler.register(NotificationService)
  }
}
```

:::warning Service Instantiation Timing

Registering a service with the scheduler does **not** automatically instantiate it. The service is only created when the cron job actually runs (when the cron time is met). This means:

- Lifecycle hooks like `onServiceInit()` will **not** be executed during registration
- `onServiceInit()` will only run when the first cron job execution occurs
- If you need initialization logic to run immediately, do it by injecting the service inside module or manually instantiate the service

```typescript
@Schedulable()
class DataProcessingService {
  async onServiceInit() {
    // This will NOT run when scheduler.register() is called
    // It will only run when the first cron job executes
    console.log('Service initialized')
  }

  @Cron(Schedule.EveryHour)
  async processData() {
    // Service is instantiated here (first time this runs)
    // onServiceInit() is called before this method executes
  }
}
```

:::

### Control Jobs

```typescript
// Get specific job
const job = scheduler.getJob(DataProcessingService, 'processData')
job?.stop()
job?.start()
console.log('Running:', job?.running)

// Control all jobs
scheduler.stopAll()
scheduler.startAll()
```

## Using DI in Scheduled Jobs

```typescript
@Schedulable()
class AnalyticsService {
  private db = inject(DatabaseService)
  private logger = inject(Logger, { context: 'AnalyticsService' })

  @Cron(Schedule.EveryHour)
  async aggregateMetrics() {
    this.logger.log('Aggregating metrics...')
    const data = await this.db.getHourlyData()
    await this.processData(data)
  }
}
```

## Error Handling

Errors in scheduled jobs are automatically caught and logged:

```typescript
@Schedulable()
class RiskyService {
  @Cron(Schedule.EveryMinute)
  async riskyJob() {
    // If this throws, it will be logged but won't crash the scheduler
    throw new Error('Something went wrong')
  }
}
```
