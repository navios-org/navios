import { AsyncLocalStorage } from 'node:async_hooks'

type LifecyclePhase = 'init' | 'start' | 'shutdown'

/**
 * One piece of code that an application calls and waits for: a hook, the
 * set-up of a plugin, the stop of a transport. When it calls back into a
 * lifecycle method that waits for the step itself, neither would ever finish.
 */
interface Step {
  readonly owner: object
  readonly phase: LifecyclePhase
  readonly outer: Step | undefined
  running: boolean
}

const storage = new AsyncLocalStorage<Step>()
let running = 0

/** Runs `fn` as a step of `owner`. */
export function runStep<T>(
  owner: object,
  phase: LifecyclePhase,
  fn: () => T | Promise<T>,
): Promise<T> {
  const step: Step = { owner, phase, outer: storage.getStore(), running: true }
  running++
  return storage.run(step, async () => {
    try {
      return await fn()
    } finally {
      // Timers and servers that the step created stay in its async context,
      // but nobody waits for the step any more.
      step.running = false
      if (--running === 0) {
        // On runtimes that implement the storage with async hooks, it would
        // go on costing something for every promise of the process.
        storage.disable()
      }
    }
  })
}

/** The phase of the innermost step of `owner` that the caller is part of. */
export function currentPhase(owner: object): LifecyclePhase | null {
  for (let step = storage.getStore(); step !== undefined; step = step.outer) {
    if (step.owner === owner && step.running) {
      return step.phase
    }
  }
  return null
}

/** Runs `fn` as part of no step. */
export function outsideSteps<T>(fn: () => T): T {
  return storage.exit(fn)
}
