import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * A run that is in progress.
 */
export interface ActiveRun {
  readonly job: string
  readonly controller: AbortController
  /** Settles when the run has ended. Rejects with the error of a run started by hand. */
  ended: Promise<void>
  hasEnded: boolean
  /** Whether a `stop()` has run out of time waiting for it. */
  abandoned: boolean
}

/** The run the current code belongs to. Read it with `getStore()`. */
export const currentRun = new AsyncLocalStorage<ActiveRun>()
let running = 0

/** Does the work of a run, which `currentRun` then names. */
export function runAs(run: ActiveRun, work: () => Promise<void>): Promise<void> {
  running++
  return currentRun.run(run, async () => {
    try {
      await work()
    } finally {
      if (--running === 0) {
        // On runtimes that implement the storage with async hooks, it would
        // go on costing something for every promise of the process.
        currentRun.disable()
      }
    }
  })
}

/**
 * Calls a function outside of every async context. A timer, and everything it
 * starts, keeps the async context it was created in: without this, a job that
 * a request started would carry the context of that request in every later
 * run, and keep it in memory.
 */
export const outsideContext = AsyncLocalStorage.snapshot()
