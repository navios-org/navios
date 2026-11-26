import { provide } from '@navios/di'

import type { Container, Provider } from '@navios/di'

import { ConsoleLogger } from '../logger/console-logger.mjs'
import { LoggerOutput } from '../logger/logger-output.mjs'
import { deferOutput, endDeferral } from '../logger/pending-output.mjs'

import type { LogLevel } from '../logger/log-levels.mjs'
import type { LoggerService } from '../logger/logger-output.mjs'
import type { PendingOutput } from '../logger/pending-output.mjs'

import type { ApplicationOptions } from './application-options.mjs'

const noopLogger: LoggerService = {
  log() {},
  error() {},
  warn() {},
  debug() {},
  verbose() {},
  fatal() {},
}

/**
 * Where the log of an application goes. Loggers that are built while it
 * initialises write to a stand-in, which holds what they log until everything
 * that may provide the output, plugins included, has had its turn.
 */
export class ApplicationLog {
  /** The provider of the output that the `logger` option gives, if any. */
  readonly provider: Provider | undefined
  /** Whether the `logger` option turns logging off. */
  readonly isOff: boolean
  /** For the debug log, once there is one. */
  readonly notes: string[] = []
  /** The levels the `logger` option selects. */
  private readonly levels: LogLevel[] | undefined
  private readonly showsRequestIds: boolean
  /** What loggers write to until it is settled where the log goes. */
  private pending: PendingOutput | null = null

  constructor(
    private readonly container: Container,
    { logger, asyncContext }: Pick<ApplicationOptions, 'logger' | 'asyncContext'>,
  ) {
    this.isOff = logger === false
    this.levels = Array.isArray(logger) ? logger : undefined
    const output = logger === false ? noopLogger : Array.isArray(logger) ? undefined : logger
    this.provider = output && provide(LoggerOutput, { value: output })
    this.showsRequestIds = asyncContext ?? false
  }

  /** Makes the loggers that are built from now on wait for the output. */
  defer(): void {
    this.pending = deferOutput(this.container, () => this.settleNow())
  }

  /** Ends what `defer()` did, for the loggers that are built from now on. */
  endDeferral(): void {
    endDeferral(this.container)
  }

  /** Settles the output, once everything that may provide it has had its turn. */
  async settle(): Promise<void> {
    this.pending!.settle(this.configured(await this.container.get(LoggerOutput)))
    this.endDeferral()
  }

  /** What was logged so far is not lost, whatever becomes of the start-up. */
  settleNow(): void {
    if (this.pending === null || this.pending.isSettled) {
      return
    }
    let output: LoggerService
    try {
      output = this.configured(this.container.getSync(LoggerOutput))
    } catch {
      // It is built asynchronously, or cannot be built.
      output = this.configured(new ConsoleLogger())
    }
    this.pending.settle(output)
  }

  private configured(output: LoggerService): LoggerService {
    if (this.levels !== undefined) {
      output.setLogLevels?.(this.levels)
    }
    if (this.showsRequestIds && output instanceof ConsoleLogger) {
      output.setDefaults({ requestId: true })
    }
    return output
  }
}
