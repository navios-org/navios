import type { ExecutionContext } from '../services/execution-context.mjs'

export interface CanActivate {
  canActivate(executionContext: ExecutionContext): Promise<boolean> | boolean
}
