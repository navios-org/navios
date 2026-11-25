import type { Container } from '@navios/di'

import type { LoggerService } from './logger-output.mjs'

type Level = 'log' | 'error' | 'warn' | 'debug' | 'verbose' | 'fatal'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Stands in for the logger output of a container until everything that may
 * provide it, plugins included, has had its turn, and holds back what is
 * logged until then: resolving the output any earlier would settle it.
 */
export class PendingOutput implements LoggerService {
  private output: LoggerService | null = null
  private held: Array<[Level, unknown[]]> = []

  /** `settleNow` settles for the output that can be had at once. */
  constructor(readonly settleNow: () => void) {
    if (unsettled.size === 0) {
      process.on('exit', settleAll)
    }
    unsettled.add(this)
  }

  log(...args: any[]) {
    this.write('log', args)
  }

  error(...args: any[]) {
    this.write('error', args)
  }

  warn(...args: any[]) {
    this.write('warn', args)
  }

  debug(...args: any[]) {
    this.write('debug', args)
  }

  verbose(...args: any[]) {
    this.write('verbose', args)
  }

  fatal(...args: any[]) {
    this.write('fatal', args)
  }

  get isSettled(): boolean {
    return this.output !== null
  }

  /** Writes what is held, and everything from here on, to `output`. */
  settle(output: LoggerService): void {
    this.output = output
    if (unsettled.delete(this) && unsettled.size === 0) {
      process.off('exit', settleAll)
    }
    for (const [level, args] of this.held.splice(0)) {
      try {
        this.write(level, args)
      } catch {
        // Whoever logged it has gone on.
        console.error(...args)
      }
    }
  }

  private write(level: Level, args: unknown[]): void {
    if (this.output === null) {
      this.held.push([level, args])
      return
    }
    const [message, ...rest] = args
    this.output[level]?.(message, ...rest)
  }
}

/** Those whose messages would be lost if the process ended now. */
const unsettled = new Set<PendingOutput>()

function settleAll(): void {
  for (const output of unsettled) {
    output.settleNow()
  }
}

const pending = new WeakMap<Container, PendingOutput>()

/** Makes loggers that are built in `container` from now on wait for its output. */
export function deferOutput(container: Container, settleNow: () => void): PendingOutput {
  const output = new PendingOutput(settleNow)
  pending.set(container, output)
  return output
}

/** Ends what `deferOutput` did, for loggers that are built from now on. */
export function endDeferral(container: Container): void {
  pending.delete(container)
}

export function pendingOutput(container: Container): PendingOutput | undefined {
  return pending.get(container)
}
