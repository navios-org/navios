import { CronTime } from 'cron'

/** The longest delay `setTimeout` takes; a longer one fires at once. */
export const MAX_DELAY_MS = 2 ** 31 - 1

/**
 * Calls back at the times of a cron expression.
 *
 * The expression, the time zone and its daylight saving transitions are the
 * business of the `cron` package. The timer is not its `CronJob`: that one
 * does not tell which time a tick belongs to, and writes to the console.
 */
export class CronTimer {
  private readonly times: CronTime
  private due: number | null = null
  private timeout: ReturnType<typeof setTimeout> | undefined

  /**
   * @throws when the expression or the time zone is invalid, or when the
   *   expression is valid but never occurs
   */
  constructor(
    expression: string,
    timeZone: string | undefined,
    private readonly onTick: (scheduledAt: Date) => void,
  ) {
    // Both usually come from an environment variable that is not set. `cron`
    // takes an empty time zone for UTC.
    if (typeof expression !== 'string' || expression.trim() === '') {
      throw new Error('the cron expression is empty or not a string')
    }
    if (timeZone !== undefined && timeZone.trim() === '') {
      throw new Error('the time zone is empty')
    }
    this.times = new CronTime(expression, timeZone)
    this.computeNext(expression)
  }

  /** Whether the timer is started. */
  get active(): boolean {
    return this.due !== null
  }

  /** The next time, or `null` when the timer is not started. */
  get next(): Date | null {
    return this.due === null ? null : new Date(this.due)
  }

  start(): void {
    if (this.due === null) {
      this.arm()
    }
  }

  stop(): void {
    clearTimeout(this.timeout)
    this.due = null
  }

  private computeNext(expression = String(this.times.source)): number {
    try {
      return this.times.sendAt().toMillis()
    } catch (error) {
      throw new Error(`the cron expression '${expression}' never occurs`, { cause: error })
    }
  }

  private arm(): void {
    this.due = this.computeNext()
    this.wait(this.due)
  }

  private wait(due: number): void {
    const delay = Math.min(Math.max(due - Date.now(), 1), MAX_DELAY_MS)
    this.timeout = setTimeout(() => this.wake(due), delay)
  }

  private wake(due: number): void {
    // A timer may fire a moment early, and does not reach beyond 24 days.
    if (Date.now() < due) {
      this.wait(due)
      return
    }
    // The next time is counted from now: what a blocked event loop missed is
    // left out instead of run in a burst.
    this.arm()
    this.onTick(new Date(due))
  }
}
