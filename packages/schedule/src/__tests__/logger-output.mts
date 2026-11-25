import { vi } from 'vitest'

import type { Mock } from 'vitest'

type Level = 'log' | 'error' | 'warn' | 'debug' | 'verbose' | 'fatal'

/** A logger for `LoggerOutput` or the application, whose calls can be inspected. */
export function createLoggerOutput(): Record<Level, Mock> {
  return {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
    fatal: vi.fn(),
  }
}

/** A promise and the functions that settle it. */
export function deferred() {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<void>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}
