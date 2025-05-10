import type { ExecutionContext } from '../services/index.mjs'

export interface CanActivate {
  canActivate(executionContext: ExecutionContext): Promise<boolean> | boolean
}
