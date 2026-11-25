import { resumeStacks, suspendStacks } from './client-error-stacks.mjs'

/**
 * Thrown by the pipeline when a guard returns `false`.
 * @internal
 */
export class GuardDeniedError extends Error {
  constructor(public readonly guard: string) {
    const limit = suspendStacks()
    super(`Guard ${guard} denied the request`)
    resumeStacks(limit)
    this.name = 'GuardDeniedError'
  }
}
