import { resumeStacks, suspendStacks } from './client-error-stacks.mjs'

/**
 * Thrown by the pipeline when a guard does not return `true`. Map it with
 * `app.mapError(GuardDeniedError, …)` to answer a denied guard differently.
 */
export class GuardDeniedError extends Error {
  constructor(public readonly guard: string) {
    const limit = suspendStacks()
    super(`Guard ${guard} denied the request`)
    resumeStacks(limit)
    this.name = 'GuardDeniedError'
  }
}
