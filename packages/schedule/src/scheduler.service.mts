import { Container, inject, Injectable, Logger } from '@navios/core'
import { CronJob } from 'cron'

import type { ClassType } from '@navios/core'

import { extractScheduleMetadata, hasScheduleMetadata } from './metadata/index.mjs'

import type { ScheduleMetadata } from './metadata/index.mjs'

/**
 * Service responsible for managing and executing scheduled cron jobs.
 *
 * The SchedulerService registers schedulable services decorated with `@Schedulable()`
 * and automatically starts their cron jobs based on the `@Cron()` decorator configuration.
 *
 * @example
 * ```typescript
 * import { inject, Injectable } from '@navios/core'
 * import { SchedulerService } from '@navios/schedule'
 *
 * @Injectable()
 * class AppModule {
 *   private readonly scheduler = inject(SchedulerService)
 *
 *   async onModuleInit() {
 *     this.scheduler.register(MySchedulableService)
 *   }
 * }
 * ```
 *
 * @public
 */
@Injectable()
export class SchedulerService {
  private readonly logger = inject(Logger, {
    context: SchedulerService.name,
  })
  private readonly container = inject(Container)
  private readonly jobs: Map<string, CronJob> = new Map()

  /**
   * Registers a schedulable service and starts all its cron jobs.
   *
   * The service must be decorated with `@Schedulable()` and contain methods
   * decorated with `@Cron()` to be registered successfully.
   *
   * @param service - The schedulable service class to register
   * @throws {Error} If the service is not decorated with `@Schedulable()`
   *
   * @example
   * ```typescript
   * @Schedulable()
   * class TaskService {
   *   @Cron('0 0 * * *')
   *   async dailyTask() {
   *     // Runs daily at midnight
   *   }
   * }
   *
   * schedulerService.register(TaskService)
   * ```
   *
   * @public
   */
  register(service: ClassType) {
    if (!hasScheduleMetadata(service)) {
      throw new Error(
        `[Navios-Schedule] Service ${service.name} is not schedulable. Make sure to use @Schedulable decorator.`,
      )
    }
    const metadata = extractScheduleMetadata(service)
    this.logger.debug('Scheduling service', metadata.name)
    this.registerJobs(service, metadata)
  }

  /**
   * Retrieves a specific cron job instance for a method in a schedulable service.
   *
   * @param service - The schedulable service class
   * @param method - The name of the method decorated with `@Cron()`
   * @returns The CronJob instance if found, undefined otherwise
   *
   * @example
   * ```typescript
   * const job = schedulerService.getJob(TaskService, 'dailyTask')
   * if (job) {
   *   console.log('Job is active:', job.isActive)
   *   job.start() // Manually start the job
   *   job.stop()  // Manually stop the job
   * }
   * ```
   *
   * @public
   */
  getJob<T extends ClassType>(service: T, method: keyof InstanceType<T>): CronJob | undefined {
    const metadata = extractScheduleMetadata(service)
    const jobName = `${metadata.name}.${method as string}()`
    return this.jobs.get(jobName)
  }

  private registerJobs(service: ClassType, metadata: ScheduleMetadata) {
    const jobs = metadata.jobs
    for (const job of jobs) {
      if (!job.cronTime) {
        this.logger.debug('Skipping job', job.classMethod)
        continue
      }
      const name = `${metadata.name}.${job.classMethod}()`
      const self = this
      const defaultDisabled = false
      const cronJob = CronJob.from({
        cronTime: job.cronTime,
        name,
        async onTick() {
          try {
            self.logger.debug('Executing job', name)
            const instance = await self.container.get(service)
            await instance[job.classMethod]()
          } catch (error) {
            self.logger.error('Error executing job', name, error)
          }
        },
        start: !(defaultDisabled || job.disabled),
      })
      this.jobs.set(name, cronJob)
    }
  }

  /**
   * Starts all registered cron jobs that are currently inactive.
   *
   * Only jobs that are not already active will be started. This method
   * is useful for resuming all jobs after calling `stopAll()`.
   *
   * @example
   * ```typescript
   * // Stop all jobs
   * schedulerService.stopAll()
   *
   * // Later, resume all jobs
   * schedulerService.startAll()
   * ```
   *
   * @public
   */
  startAll() {
    for (const job of this.jobs.values()) {
      if (job.isActive) {
        continue
      }
      job.start()
    }
  }

  /**
   * Stops all registered cron jobs that are currently active.
   *
   * Only jobs that are currently active will be stopped. This method
   * is useful for pausing all scheduled tasks, for example during
   * application shutdown or maintenance.
   *
   * @example
   * ```typescript
   * // Pause all scheduled jobs
   * schedulerService.stopAll()
   *
   * // Jobs can be resumed later with startAll()
   * schedulerService.startAll()
   * ```
   *
   * @public
   */
  stopAll() {
    for (const job of this.jobs.values()) {
      if (!job.isActive) {
        continue
      }
      job.stop()
    }
  }
}
