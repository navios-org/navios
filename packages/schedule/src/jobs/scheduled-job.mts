/**
 * What a job method is called with.
 *
 * @public
 */
export interface JobRun {
  /** The name of the job, such as `MaintenanceJobs.purgeSessions()`. */
  readonly name: string
  /**
   * The time of the schedule this run belongs to, or `null` when it was
   * started with `ScheduledJob.run()`.
   */
  readonly scheduledAt: Date | null
  /** Aborted when the scheduler stops, so when the application closes. */
  readonly signal: AbortSignal
}

/**
 * One job of a schedulable class, as `SchedulerService.getJob()` returns it.
 *
 * @public
 */
export interface ScheduledJob {
  /** The class and the method, such as `MaintenanceJobs.purgeSessions()`. */
  readonly name: string
  /** Whether the job is on its schedule. */
  readonly active: boolean
  /** Whether a run of the job is in progress. */
  readonly running: boolean
  /** When the job runs next, or `null` when it is not on its schedule. */
  readonly nextRun: Date | null
  /** When the last run started, or `null` when there was none. */
  readonly lastRun: Date | null
  /** Puts the job on its schedule. Does nothing when it already is. */
  start(): void
  /** Takes the job off its schedule. A run in progress goes on. */
  stop(): void
  /**
   * Runs the job now, whether or not it is on its schedule. Resolves when the
   * run has ended and rejects with its error, which is not logged. Rejects
   * when a run is in progress, unless the job has `overlap: 'allow'`.
   */
  run(): Promise<void>
}
