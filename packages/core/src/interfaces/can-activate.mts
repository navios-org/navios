import type { AbstractExecutionContext } from '../interfaces/index.mjs'

export interface CanActivate {
  canActivate(
    executionContext: AbstractExecutionContext,
  ): Promise<boolean> | boolean
}
