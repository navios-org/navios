import { Container, inject, Logger, registerInjectable } from '@navios/core'
import { CronJob } from 'cron'

import type {
  ClassType,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  OnServiceDestroy,
} from '@navios/core'

import { extractScheduleMetadata, hasScheduleMetadata } from './schedulable/schedule-metadata.mjs'

interface RegisteredJob {
  name: string
  job: CronJob
  disabled: boolean
}

/**
 * Service responsible for managing and executing scheduled cron jobs.
 *
 * Schedulable services decorated with `@Schedulable()` are registered with
 * `register()`. Their cron jobs follow the application lifecycle:
 *
 * - they start in `onApplicationBootstrap`, at the end of `app.init()`;
 * - they stop in `onApplicationShutdown`, during `app.close()`, which also
 *   waits for the runs that are in progress.
 *
 * Without a Navios application, call `start()` after registering and `stop()`
 * (or dispose the container) when done.
 *
 * Every run of a job happens in its own DI scope, which is disposed when the
 * run ends.
 *
 * @example
 * ```typescript
 * import { inject, Module } from '@navios/core'
 * import { SchedulerService } from '@navios/schedule'
 *
 * @Module()
 * class AppModule {
 *   private readonly scheduler = inject(SchedulerService)
 *
 *   onModuleInit() {
 *     this.scheduler.register(MySchedulableService)
 *   }
 * }
 * ```
 *
 * @public
 */
export class SchedulerService
  implements OnApplicationBootstrap, OnApplicationShutdown, OnServiceDestroy
{
  private readonly logger = inject(Logger, {
    context: 'SchedulerService',
  })
  private readonly container = inject(Container)
  private readonly services = new Map<ClassType, Map<string, RegisteredJob>>()
  private readonly runs = new Set<Promise<void>>()
  private started = false

  /**
   * Registers a schedulable service and creates its cron jobs.
   *
   * The jobs start when the scheduler starts: in `onApplicationBootstrap`, or
   * when `start()` is called. A service registered while the scheduler is
   * already started has its jobs started immediately. Jobs declared with
   * `disabled: true` are created but not started.
   *
   * Registering the same class again does nothing.
   *
   * @param service - The schedulable service class to register. Must be decorated with `@Schedulable()`.
   * @throws {Error} If the service is not decorated with `@Schedulable()`
   *
   * @example
   * ```typescript
   * @Schedulable()
   * class TaskService {
   *   @Cron('0 0 * * *')
   *   async dailyTask() {
   *     // Task logic
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
    if (this.services.has(service)) {
      this.logger.debug('Service is already scheduled', service.name)
      return
    }
    const metadata = extractScheduleMetadata(service)
    this.logger.debug('Scheduling service', metadata.name)

    const jobs = new Map<string, RegisteredJob>()
    this.services.set(service, jobs)
    for (const job of metadata.jobs) {
      if (!job.cronTime) {
        this.logger.debug('Skipping job', job.classMethod)
        continue
      }
      const name = `${metadata.name}.${job.classMethod}()`
      const method = job.classMethod
      const cronJob = CronJob.from({
        cronTime: job.cronTime,
        name,
        onTick: () => this.track(this.run(service, method, name)),
        start: false,
      })
      jobs.set(method, { name, job: cronJob, disabled: job.disabled })
      if (this.started && !job.disabled) {
        cronJob.start()
      }
    }
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
    return this.services.get(service)?.get(method as string)?.job
  }

  /**
   * Starts the scheduler: starts every registered job that is not declared
   * with `disabled: true`, and makes services registered later start at once.
   *
   * Called by `onApplicationBootstrap`. Call it yourself only when the
   * scheduler is used without a Navios application. Calling it again does
   * nothing new.
   *
   * @public
   */
  start() {
    this.started = true
    for (const { job, disabled } of this.allJobs()) {
      if (!disabled && !job.isActive) {
        job.start()
      }
    }
  }

  /**
   * Stops the scheduler: stops every job and waits for the runs that are in
   * progress. Services registered afterwards are not started until `start()`
   * is called again.
   *
   * Called by `onApplicationShutdown` and when the container is disposed.
   *
   * @public
   */
  async stop() {
    this.started = false
    this.stopAll()
    while (this.runs.size > 0) {
      await Promise.all(this.runs)
    }
  }

  /**
   * Starts all registered cron jobs that are currently inactive, including
   * the ones declared with `disabled: true`.
   *
   * @example
   * ```typescript
   * // Start all jobs
   * schedulerService.startAll()
   * ```
   *
   * @public
   */
  startAll() {
    for (const { job } of this.allJobs()) {
      if (!job.isActive) {
        job.start()
      }
    }
  }

  /**
   * Stops all registered cron jobs that are currently active. Runs that are
   * in progress are not awaited; use `stop()` for that.
   *
   * @example
   * ```typescript
   * // Stop all jobs
   * schedulerService.stopAll()
   * ```
   *
   * @public
   */
  stopAll() {
    for (const { job } of this.allJobs()) {
      if (job.isActive) {
        job.stop()
      }
    }
  }

  /** Starts the jobs when the application has been initialised. */
  onApplicationBootstrap() {
    this.start()
  }

  /** Stops the jobs and waits for runs in progress during `app.close()`. */
  async onApplicationShutdown() {
    await this.stop()
  }

  /** Stops the jobs when the container is disposed without an application. */
  async onServiceDestroy() {
    await this.stop()
  }

  private *allJobs(): Generator<RegisteredJob> {
    for (const jobs of this.services.values()) {
      yield* jobs.values()
    }
  }

  private track(run: Promise<void>): Promise<void> {
    this.runs.add(run)
    void run.finally(() => this.runs.delete(run))
    return run
  }

  /**
   * One run of a job. It gets its own DI scope, so request-scoped services,
   * including a request-scoped schedulable class, are created for this run
   * and destroyed after it. Never rejects: errors are logged.
   */
  private async run(service: ClassType, method: string, name: string): Promise<void> {
    const scope = this.container.createScope()
    try {
      this.logger.debug('Executing job', name)
      const instance = await scope.get(service)
      await instance[method]()
    } catch (error) {
      this.logger.error('Error executing job', name, error)
    } finally {
      try {
        await scope.dispose()
      } catch (error) {
        this.logger.error('Error disposing the scope of job', name, error)
      }
    }
  }
}

registerInjectable(SchedulerService)
