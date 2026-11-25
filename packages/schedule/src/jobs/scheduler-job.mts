import type { OverlapPolicy } from '../cron/cron.mjs'

import { outsideContext, runAs } from './active-run.mjs'
import { CronTimer } from './cron-timer.mjs'

import type { ActiveRun } from './active-run.mjs'
import type { JobLogger } from './job-logger.mjs'
import type { JobRun, ScheduledJob } from './scheduled-job.mjs'

export interface SchedulerJobOptions {
  name: string
  cronTime: string
  timeZone: string | undefined
  overlap: OverlapPolicy
  disabled: boolean
  logger: JobLogger
  /** Throws when the scheduler can no longer run anything. */
  assertUsable(): void
  /** Calls the job method. */
  perform(run: JobRun): Promise<void>
  /** Reports the error of a run that nobody waits for. Does not reject. */
  fail(error: unknown, run: JobRun): Promise<void>
}

/**
 * A job: its timer and its runs.
 */
export class SchedulerJob implements ScheduledJob {
  readonly name: string
  readonly disabled: boolean
  /** The runs that are in progress. */
  readonly runs = new Set<ActiveRun>()
  private readonly timer: CronTimer
  private started: Date | null = null
  /** Whether a tick was left out since the last run started. */
  private skipping = false

  /** @throws when the job cannot be scheduled; the error names it */
  constructor(private readonly options: SchedulerJobOptions) {
    this.name = options.name
    this.disabled = options.disabled
    this.timer = this.named(
      () => new CronTimer(options.cronTime, options.timeZone, (at) => this.tick(at)),
    )
  }

  get active(): boolean {
    return this.timer.active
  }

  get running(): boolean {
    return this.runs.size > 0
  }

  get nextRun(): Date | null {
    return this.timer.next
  }

  get lastRun(): Date | null {
    return this.started === null ? null : new Date(this.started)
  }

  start(): void {
    this.options.assertUsable()
    this.named(() => outsideContext(() => this.timer.start()))
  }

  stop(): void {
    this.timer.stop()
  }

  async run(): Promise<void> {
    this.options.assertUsable()
    if (this.blocked) {
      throw new Error(`[Navios-Schedule] Job ${this.name} is already running.`)
    }
    await this.begin(null, (run) => this.options.perform(run))
  }

  private get blocked(): boolean {
    return this.options.overlap === 'skip' && this.running
  }

  /** The job is due. */
  private tick(scheduledAt: Date): void {
    const { perform, fail, logger } = this.options
    if (this.blocked) {
      if (!this.skipping) {
        this.skipping = true
        logger.warn(`Job ${this.name} is due but still running; skipping until that run ends`)
      }
      return
    }
    void this.begin(scheduledAt, async (run) => {
      try {
        await perform(run)
      } catch (error) {
        await fail(error, run)
      }
    })
  }

  private begin(scheduledAt: Date | null, work: (run: JobRun) => Promise<void>): Promise<void> {
    const controller = new AbortController()
    const run: JobRun = { name: this.name, scheduledAt, signal: controller.signal }
    const active: ActiveRun = {
      job: this.name,
      controller,
      ended: Promise.resolve(),
      hasEnded: false,
      abandoned: false,
    }
    this.skipping = false
    this.started = new Date()
    this.runs.add(active)
    active.ended = outsideContext(() =>
      runAs(active, async () => {
        try {
          await work(run)
        } finally {
          active.hasEnded = true
          this.runs.delete(active)
        }
      }),
    )
    return active.ended
  }

  private named<T>(schedule: () => T): T {
    try {
      return schedule()
    } catch (error) {
      throw new Error(
        `[Navios-Schedule] Cannot schedule ${this.name}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      )
    }
  }
}
