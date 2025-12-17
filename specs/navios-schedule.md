# @navios/schedule Specification

## Overview

`@navios/schedule` is a type-safe job scheduling library for the Navios framework. It provides decorator-based cron scheduling with seamless integration into Navios's dependency injection system.

**Package:** `@navios/schedule`
**Version:** 0.5.0
**License:** MIT
**Dependencies:** `cron` (^4.4.0)
**Peer Dependencies:** `@navios/core`, `zod` (^3.25.0 || ^4.0.0)

---

## Core Concepts

### Architecture Overview

```
@Schedulable() Class
├── @Cron('* * * * *') method1()
├── @Cron('0 * * * *') method2()
└── @Cron('0 0 * * *') method3()

SchedulerService
├── register(service) - Register schedulable services
├── getJob(service, method) - Get specific job
├── startAll() - Start all jobs
└── stopAll() - Stop all jobs
```

### Key Principles

- **Decorator-Based** - Clean API using TypeScript decorators
- **DI Integration** - Schedulable services are injectable
- **Runtime Control** - Start/stop jobs individually or globally
- **Error Resilient** - Errors in jobs don't crash the scheduler

---

## Decorators

### @Schedulable()

Marks a class as schedulable and makes it injectable.

```typescript
import { Schedulable, Cron } from '@navios/schedule'

@Schedulable()
class DataProcessingService {
  @Cron('0 * * * *')
  async processHourlyData() {
    // Runs every hour
  }
}
```

**Behavior:**
- Automatically applies `@Injectable()` from @navios/core
- Required for any class containing `@Cron` methods
- Makes the service available for dependency injection

### @Cron(cronTime, options?)

Decorates a method to run on a cron schedule.

```typescript
import { Schedulable, Cron, Schedule } from '@navios/schedule'

@Schedulable()
class ReportService {
  @Cron('0 9 * * 1-5')
  async sendDailyReport() {
    // Runs at 9 AM on weekdays
  }

  @Cron(Schedule.EveryHour)
  async checkMetrics() {
    // Runs every hour using predefined constant
  }

  @Cron('0 2 * * *', { disabled: true })
  async maintenanceJob() {
    // Disabled by default, can be started manually
  }
}
```

**Parameters:**

| Parameter  | Type                          | Description                    |
| ---------- | ----------------------------- | ------------------------------ |
| `cronTime` | `string \| CronJobParams['cronTime']` | Cron expression       |
| `options`  | `CronOptions`                 | Optional configuration         |

**CronOptions:**

| Property   | Type      | Default | Description                |
| ---------- | --------- | ------- | -------------------------- |
| `disabled` | `boolean` | `false` | Whether job starts disabled |

---

## Cron Expressions

### Format

Standard cron expression with 5 or 6 fields:

```
┌────────────── second (optional, 0-59)
│ ┌──────────── minute (0-59)
│ │ ┌────────── hour (0-23)
│ │ │ ┌──────── day of month (1-31)
│ │ │ │ ┌────── month (1-12)
│ │ │ │ │ ┌──── day of week (0-6, Sunday to Saturday)
│ │ │ │ │ │
* * * * * *
```

### Examples

| Expression        | Description                          |
| ----------------- | ------------------------------------ |
| `* * * * *`       | Every minute                         |
| `*/5 * * * *`     | Every 5 minutes                      |
| `0 * * * *`       | Every hour (at minute 0)             |
| `0 0 * * *`       | Daily at midnight                    |
| `0 9 * * 1-5`     | Weekdays at 9 AM                     |
| `0 0 1 * *`       | First day of month at midnight       |
| `0 0 * * 0`       | Every Sunday at midnight             |
| `*/30 * * * * *`  | Every 30 seconds (6-field format)    |

### Schedule Constants

Predefined cron patterns for common schedules:

```typescript
import { Schedule } from '@navios/schedule'

@Schedulable()
class TaskService {
  @Cron(Schedule.EveryMinute)        // '*/1 * * * *'
  async everyMinute() {}

  @Cron(Schedule.EveryFiveMinutes)   // '*/5 * * * *'
  async everyFiveMinutes() {}

  @Cron(Schedule.EveryHour)          // '0 * * * *'
  async everyHour() {}

  @Cron(Schedule.EveryDay)           // '0 0 * * *'
  async everyDay() {}

  @Cron(Schedule.EveryWeek)          // '0 0 * * 0'
  async everyWeek() {}

  @Cron(Schedule.EveryMonth)         // '0 0 1 * *'
  async everyMonth() {}
}
```

**All Available Constants:**

| Constant              | Cron Expression   | Description           |
| --------------------- | ----------------- | --------------------- |
| `EveryMinute`         | `*/1 * * * *`     | Every minute          |
| `EveryFiveMinutes`    | `*/5 * * * *`     | Every 5 minutes       |
| `EveryTenMinutes`     | `*/10 * * * *`    | Every 10 minutes      |
| `EveryFifteenMinutes` | `*/15 * * * *`    | Every 15 minutes      |
| `EveryThirtyMinutes`  | `*/30 * * * *`    | Every 30 minutes      |
| `EveryHour`           | `0 * * * *`       | Every hour            |
| `EveryTwoHours`       | `0 */2 * * *`     | Every 2 hours         |
| `EveryThreeHours`     | `0 */3 * * *`     | Every 3 hours         |
| `EveryFourHours`      | `0 */4 * * *`     | Every 4 hours         |
| `EverySixHours`       | `0 */6 * * *`     | Every 6 hours         |
| `EveryTwelveHours`    | `0 */12 * * *`    | Every 12 hours        |
| `EveryDay`            | `0 0 * * *`       | Daily at midnight     |
| `EveryWeek`           | `0 0 * * 0`       | Weekly on Sunday      |
| `EveryMonth`          | `0 0 1 * *`       | Monthly on the 1st    |

---

## SchedulerService

The service responsible for managing all registered cron jobs.

### Injection

```typescript
import { Injectable, inject } from '@navios/di'
import { SchedulerService } from '@navios/schedule'

@Injectable()
class AppService {
  private scheduler = inject(SchedulerService)
}
```

### register(service)

Registers a schedulable service and starts its jobs.

```typescript
import { Module, OnModuleInit, inject } from '@navios/core'
import { SchedulerService } from '@navios/schedule'

@Module({
  controllers: [],
})
class AppModule implements OnModuleInit {
  private scheduler = inject(SchedulerService)

  async onModuleInit() {
    this.scheduler.register(DataProcessingService)
    this.scheduler.register(ReportService)
    this.scheduler.register(CleanupService)
  }
}
```

**Parameters:**

| Parameter | Type        | Description                    |
| --------- | ----------- | ------------------------------ |
| `service` | `ClassType` | The schedulable service class  |

### getJob(service, method)

Gets a specific CronJob instance for manual control.

```typescript
const job = scheduler.getJob(DataProcessingService, 'processData')

if (job) {
  console.log('Job is running:', job.running)
  job.stop()  // Stop this specific job
  job.start() // Start this specific job
}
```

**Parameters:**

| Parameter | Type                    | Description                 |
| --------- | ----------------------- | --------------------------- |
| `service` | `ClassType`             | The schedulable service class |
| `method`  | `keyof InstanceType<T>` | The method name             |

**Returns:** `CronJob | undefined`

### startAll()

Starts all registered jobs.

```typescript
scheduler.startAll()
```

### stopAll()

Stops all registered jobs.

```typescript
scheduler.stopAll()
```

---

## Error Handling

Errors in scheduled jobs are automatically caught and logged without affecting other jobs:

```typescript
@Schedulable()
class RiskyService {
  @Cron(Schedule.EveryMinute)
  async riskyJob() {
    // If this throws, it will be logged but won't crash the scheduler
    // The job will continue to run on its next scheduled time
    throw new Error('Something went wrong')
  }

  @Cron(Schedule.EveryMinute)
  async otherJob() {
    // This job continues to run normally even if riskyJob fails
  }
}
```

**Behavior:**
- Errors are logged via the injected Logger
- The failing job continues to be scheduled
- Other jobs are not affected

---

## Integration with Modules

### Basic Setup

```typescript
import { Module, OnModuleInit, inject } from '@navios/core'
import { SchedulerService, Schedulable, Cron, Schedule } from '@navios/schedule'
import { Injectable } from '@navios/di'

// Define schedulable services
@Schedulable()
class EmailService {
  private mailer = inject(MailerService)

  @Cron('0 9 * * *')
  async sendDailyDigest() {
    const users = await this.getSubscribedUsers()
    for (const user of users) {
      await this.mailer.sendDigest(user)
    }
  }
}

@Schedulable()
class CleanupService {
  private db = inject(DatabaseService)

  @Cron('0 3 * * *')
  async cleanupExpiredSessions() {
    await this.db.deleteExpiredSessions()
  }

  @Cron(Schedule.EveryHour)
  async cleanupTempFiles() {
    await this.deleteTempFiles()
  }
}

// Register in module
@Module({
  controllers: [],
})
class TasksModule implements OnModuleInit {
  private scheduler = inject(SchedulerService)

  async onModuleInit() {
    this.scheduler.register(EmailService)
    this.scheduler.register(CleanupService)
  }
}
```

### Using DI in Scheduled Jobs

Schedulable services support full dependency injection:

```typescript
@Schedulable()
class AnalyticsService {
  private db = inject(DatabaseService)
  private cache = inject(CacheService)
  private logger = inject(Logger)
  private metrics = inject(MetricsService)

  @Cron(Schedule.EveryHour)
  async aggregateHourlyMetrics() {
    this.logger.log('Starting hourly metrics aggregation')

    const data = await this.db.getHourlyData()
    const aggregated = this.processData(data)

    await this.cache.set('hourly_metrics', aggregated)
    await this.metrics.record('aggregation_complete', { count: data.length })

    this.logger.log('Hourly metrics aggregation complete')
  }
}
```

---

## Complete Example

```typescript
// services/scheduled/data-sync.service.ts
import { Schedulable, Cron, Schedule } from '@navios/schedule'
import { Injectable, inject } from '@navios/di'

@Schedulable()
class DataSyncService {
  private externalApi = inject(ExternalApiService)
  private db = inject(DatabaseService)
  private logger = inject(Logger)

  @Cron(Schedule.EveryFiveMinutes)
  async syncRecentData() {
    this.logger.log('Syncing recent data...')
    const data = await this.externalApi.fetchRecent()
    await this.db.upsertMany(data)
    this.logger.log(`Synced ${data.length} records`)
  }

  @Cron('0 0 * * *')
  async fullSync() {
    this.logger.log('Starting full data sync...')
    const data = await this.externalApi.fetchAll()
    await this.db.replaceAll(data)
    this.logger.log(`Full sync complete: ${data.length} records`)
  }

  @Cron('0 2 * * 0', { disabled: true })
  async weeklyCleanup() {
    // Disabled by default - can be enabled via getJob().start()
    await this.db.cleanupOldRecords()
  }
}
```

```typescript
// services/scheduled/notification.service.ts
import { Schedulable, Cron } from '@navios/schedule'
import { inject } from '@navios/di'

@Schedulable()
class NotificationService {
  private userService = inject(UserService)
  private pushService = inject(PushNotificationService)

  @Cron('0 9 * * 1')
  async sendWeeklyReminder() {
    const users = await this.userService.getActiveUsers()
    for (const user of users) {
      await this.pushService.send(user.id, {
        title: 'Weekly Update',
        body: 'Check out what\'s new this week!',
      })
    }
  }
}
```

```typescript
// modules/tasks.module.ts
import { Module, OnModuleInit, inject } from '@navios/core'
import { SchedulerService } from '@navios/schedule'

@Module({
  controllers: [],
})
class TasksModule implements OnModuleInit {
  private scheduler = inject(SchedulerService)

  async onModuleInit() {
    // Register all schedulable services
    this.scheduler.register(DataSyncService)
    this.scheduler.register(NotificationService)

    console.log('Scheduled tasks registered')
  }
}
```

```typescript
// main.ts
import { NaviosFactory } from '@navios/core'
import { defineFastifyEnvironment } from '@navios/adapter-fastify'

@Module({
  imports: [TasksModule, ApiModule],
})
class AppModule {}

async function bootstrap() {
  const app = await NaviosFactory.create(AppModule, {
    adapter: defineFastifyEnvironment(),
  })

  await app.listen({ port: 3000 })
}

bootstrap()
```

---

## Manual Job Control

### Starting/Stopping Individual Jobs

```typescript
@Module({})
class AdminModule implements OnModuleInit {
  private scheduler = inject(SchedulerService)

  async onModuleInit() {
    this.scheduler.register(MaintenanceService)
  }

  async enableMaintenanceJob() {
    const job = this.scheduler.getJob(MaintenanceService, 'runMaintenance')
    job?.start()
  }

  async disableMaintenanceJob() {
    const job = this.scheduler.getJob(MaintenanceService, 'runMaintenance')
    job?.stop()
  }

  async isMaintenanceRunning(): boolean {
    const job = this.scheduler.getJob(MaintenanceService, 'runMaintenance')
    return job?.running ?? false
  }
}
```

### Global Control via Endpoint

```typescript
@Controller()
class SchedulerController {
  private scheduler = inject(SchedulerService)

  @Endpoint(pauseAllJobs)
  async pauseAll() {
    this.scheduler.stopAll()
    return { status: 'All jobs paused' }
  }

  @Endpoint(resumeAllJobs)
  async resumeAll() {
    this.scheduler.startAll()
    return { status: 'All jobs resumed' }
  }
}
```

---

## API Reference Summary

### Exports

| Export             | Type       | Description                          |
| ------------------ | ---------- | ------------------------------------ |
| `Schedulable`      | Decorator  | Marks a class as schedulable         |
| `Cron`             | Decorator  | Marks a method as a cron job         |
| `SchedulerService` | Class      | Service for managing scheduled jobs  |
| `Schedule`         | Enum       | Predefined cron expressions          |

### SchedulerService Methods

| Method     | Return                | Description                    |
| ---------- | --------------------- | ------------------------------ |
| `register` | `void`                | Register a schedulable service |
| `getJob`   | `CronJob \| undefined`| Get a specific job instance    |
| `startAll` | `void`                | Start all registered jobs      |
| `stopAll`  | `void`                | Stop all registered jobs       |

### CronJob Methods (from cron package)

| Method    | Return    | Description              |
| --------- | --------- | ------------------------ |
| `start`   | `void`    | Start the job            |
| `stop`    | `void`    | Stop the job             |
| `running` | `boolean` | Whether job is running   |
