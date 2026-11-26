import { Container, inject, InjectableScope, Logger, registerInjectable } from '@navios/core'
import { constructedInstances, settledWithin } from '@navios/core/transport'

import type { ClassType, OnServiceDestroy } from '@navios/core'

import { currentRun } from './jobs/active-run.mjs'
import { jobLogger } from './jobs/job-logger.mjs'
import { SchedulerJob } from './jobs/scheduler-job.mjs'
import { extractScheduleMetadata, hasScheduleMetadata } from './schedulable/schedule-metadata.mjs'
import { scheduleSettings } from './transport/schedule-settings.mjs'

import type { ActiveRun } from './jobs/active-run.mjs'
import type { JobRun, ScheduledJob } from './jobs/scheduled-job.mjs'
import type { ScheduleSettings } from './transport/schedule-settings.mjs'

const DEFAULT_STOP_TIMEOUT_MS = 10_000

/** The methods of a class that can be jobs. */
type JobMethod<T> = {
  [K in keyof T]: T[K] extends (run: JobRun) => unknown ? K : never
}[keyof T] &
  string

/** The schedulable class of an object. A proxy may refuse to tell. */
function classOf(instance: unknown): ClassType | undefined {
  try {
    const { constructor } = Object.getPrototypeOf(instance) as { constructor?: unknown }
    return typeof constructor === 'function' && hasScheduleMetadata(constructor as ClassType)
      ? (constructor as ClassType)
      : undefined
  } catch {
    return undefined
  }
}

/**
 * Holds the cron jobs of an application and runs them.
 *
 * `scheduleTransport()` registers the classes of the application, starts
 * their jobs and stops them. Inject this service to look a job up, or to
 * register a class that is only known at run time. Without a Navios
 * application, call `start()`, and `stop()` when done.
 *
 * Every run of a job happens in its own DI scope, which is disposed when the
 * run ends.
 *
 * @example
 * ```typescript
 * @Injectable()
 * class SearchAdmin {
 *   private readonly scheduler = inject(SchedulerService)
 *
 *   async rebuildNow() {
 *     await this.scheduler.getJob(MaintenanceJobs, 'rebuildSearchIndex')?.run()
 *   }
 * }
 * ```
 *
 * @public
 */
export class SchedulerService implements OnServiceDestroy {
  private readonly logger = jobLogger(inject(Logger, { context: 'SchedulerService' }))
  private readonly container = inject(Container)
  private readonly services = new Map<ClassType, Map<string, SchedulerJob>>()
  private started = false
  private destroyed = false

  /**
   * Registers a schedulable class and creates its jobs. They start together
   * with the scheduler, or at once when it is already started; jobs declared
   * with `disabled: true` do not.
   *
   * `scheduleTransport()` registers the classes it is given and those that
   * modules list in `jobs`. Registering the same class again does nothing.
   *
   * @param service - The class to register. Must be decorated with `@Schedulable()`.
   * @throws {Error} If the class is not decorated with `@Schedulable()`
   * @throws {Error} If a cron expression or a time zone is invalid, or an
   *   expression never occurs. The error names the class and the method, and
   *   nothing of the class is registered.
   *
   * @public
   */
  register(service: ClassType): void {
    this.assertUsable()
    if (!hasScheduleMetadata(service)) {
      throw new Error(
        `[Navios-Schedule] ${service.name} is not schedulable. Decorate the class itself with ` +
          `@Schedulable(); a decorator on a parent class does not count.`,
      )
    }
    if (this.services.has(service)) {
      this.logger.debug(`${service.name} is already registered`)
      return
    }
    const metadata = extractScheduleMetadata(service)
    const settings = this.settings

    // Create every job before storing any: a job that cannot be created must
    // not leave the class half registered.
    const jobs = new Map<string, SchedulerJob>()
    for (const { classMethod, cronTime, timeZone, overlap, disabled } of metadata.jobs) {
      const job = new SchedulerJob({
        name: `${metadata.name}.${classMethod}()`,
        cronTime: cronTime!,
        timeZone: timeZone ?? settings?.timeZone,
        overlap,
        disabled,
        logger: this.logger,
        assertUsable: () => this.assertUsable(),
        perform: (run) => this.perform(service, classMethod, run),
        fail: (error, run) => this.fail(error, run),
      })
      jobs.set(classMethod, job)
    }
    if (this.started) {
      this.startJobs(jobs.values())
    }
    this.services.set(service, jobs)

    if (jobs.size === 0) {
      this.logger.warn(`${service.name} is schedulable but has no method with @Cron`)
    } else if (!this.started && settings === undefined) {
      this.logger.warn(
        `The jobs of ${service.name} do not run: nothing has started the scheduler. ` +
          `Add scheduleTransport() to the transports of the application.`,
      )
    }
  }

  /**
   * Looks up the job of a method of a registered class.
   *
   * @param service - The schedulable class
   * @param method - The name of the method decorated with `@Cron()`
   * @returns The job, or `undefined` when the class is not registered or the
   *   method is not a job
   *
   * @public
   */
  getJob<T extends ClassType>(
    service: T,
    method: JobMethod<InstanceType<T>>,
  ): ScheduledJob | undefined {
    return this.services.get(service)?.get(method)
  }

  /**
   * Starts every registered job that is not declared with `disabled: true`,
   * and makes classes registered later start at once. Jobs that are already
   * on their schedule are left alone.
   *
   * `scheduleTransport()` calls it when the application starts.
   *
   * @throws {Error} If a job cannot be started. The jobs started by this call
   *   are stopped again.
   *
   * @public
   */
  start(): void {
    this.assertUsable()
    this.startJobs(this.jobs())
    this.started = true
  }

  /**
   * Takes every job off its schedule, aborts the signal of the runs in
   * progress and waits for them, at most `timeoutMs` milliseconds. What is
   * still running after that is logged and left alone. When a job calls this,
   * its own run is not waited for.
   *
   * Classes registered afterwards are not started until `start()` is called
   * again. `scheduleTransport()` calls this when the application closes.
   *
   * @param timeoutMs - How long to wait. Defaults to 10 seconds.
   *
   * @public
   */
  async stop(timeoutMs: number = DEFAULT_STOP_TIMEOUT_MS): Promise<void> {
    await this.halt(timeoutMs, () => true)
  }

  /**
   * Builds the registered classes that are singletons, so that a mistake in
   * their wiring fails the start of the application instead of a run.
   * @internal
   */
  async prepare(): Promise<void> {
    for (const service of this.services.keys()) {
      if (this.container.getProvider(service)?.scope === InjectableScope.Singleton) {
        await this.container.get(service)
      }
    }
  }

  /**
   * Warns about the schedulable classes that the application has built and
   * that are registered nowhere. Never throws.
   * @internal
   */
  warnAboutUnregistered(): void {
    for (const service of new Set(constructedInstances(this.container).map(classOf))) {
      if (service !== undefined && !this.services.has(service)) {
        this.logger.warn(
          `The jobs of ${service.name} do not run: it is schedulable but listed nowhere. ` +
            `Add it to the jobs of a module.`,
        )
      }
    }
  }

  /**
   * Stops the jobs when the container is disposed. Runs that `stop()` has
   * given up on are not waited for again.
   */
  async onServiceDestroy(): Promise<void> {
    this.destroyed = true
    await this.halt(DEFAULT_STOP_TIMEOUT_MS, (run) => !run.abandoned)
  }

  private get settings(): ScheduleSettings | undefined {
    return scheduleSettings(this.container)
  }

  private assertUsable(): void {
    if (this.destroyed) {
      throw new Error('[Navios-Schedule] The container of the scheduler is disposed.')
    }
  }

  private *jobs(): Generator<SchedulerJob> {
    for (const jobs of this.services.values()) {
      yield* jobs.values()
    }
  }

  private startJobs(jobs: Iterable<SchedulerJob>): void {
    const startedHere: SchedulerJob[] = []
    try {
      for (const job of jobs) {
        if (!job.disabled && !job.active) {
          job.start()
          startedHere.push(job)
        }
      }
    } catch (error) {
      for (const job of startedHere) {
        job.stop()
      }
      throw error
    }
  }

  private async halt(timeoutMs: number, waitsFor: (run: ActiveRun) => boolean): Promise<void> {
    this.started = false
    // A job that closes the application would otherwise wait for itself.
    const caller = currentRun.getStore()
    const pending: ActiveRun[] = []
    for (const job of this.jobs()) {
      job.stop()
      for (const run of job.runs) {
        run.controller.abort()
        if (run !== caller && waitsFor(run)) {
          pending.push(run)
        }
      }
    }
    if (pending.length === 0) {
      return
    }
    await settledWithin(Promise.allSettled(pending.map((run) => run.ended)), timeoutMs)
    const unfinished = pending.filter((run) => !run.hasEnded)
    if (unfinished.length > 0) {
      for (const run of unfinished) {
        run.abandoned = true
      }
      const names = unfinished.map((run) => run.job).join(', ')
      this.logger.warn(`Stopped waiting for jobs still running after ${timeoutMs} ms: ${names}`)
    }
  }

  /**
   * One run of a job. It gets its own DI scope, so request-scoped services,
   * including a request-scoped schedulable class, are created for this run
   * and destroyed after it.
   */
  private async perform(service: ClassType, method: string, run: JobRun): Promise<void> {
    this.logger.debug(`Running job ${run.name}`)
    const scope = this.container.createScope()
    try {
      const instance = (await scope.get(service)) as Record<string, (run: JobRun) => unknown>
      await instance[method](run)
    } finally {
      try {
        await scope.dispose()
      } catch (error) {
        this.logger.error(`Disposing the scope of job ${run.name} failed`, error)
      }
    }
  }

  private async fail(error: unknown, run: JobRun): Promise<void> {
    if (run.signal.aborted && error instanceof Error && error.name === 'AbortError') {
      this.logger.warn(`Job ${run.name} was interrupted because the scheduler stopped`)
      return
    }
    this.logger.error(`Job ${run.name} failed`, error)
    try {
      await this.settings?.onError?.(error, run)
    } catch (reportError) {
      this.logger.error(`Reporting the error of job ${run.name} failed`, reportError)
    }
  }
}

registerInjectable(SchedulerService)
