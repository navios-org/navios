import type { LoggerInstance } from '@navios/core'

/** What the scheduler writes with. Never throws. */
export interface JobLogger {
  debug(message: string): void
  warn(message: string): void
  error(message: string, error: unknown): void
}

/**
 * Nobody waits for a run that a timer starts, so an error of the logger must not
 * become one of the run.
 */
export function jobLogger(logger: LoggerInstance): JobLogger {
  const guarded =
    (level: keyof JobLogger) =>
    (...args: [message: string, error?: unknown]) => {
      try {
        logger[level](...args)
      } catch {
        if (level !== 'debug') {
          console.error(...args)
        }
      }
    }
  return { debug: guarded('debug'), warn: guarded('warn'), error: guarded('error') }
}
