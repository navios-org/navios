import type { AbstractExecutionContext, CanActivate } from '@navios/core'
import { Injectable } from '@navios/core'

/**
 * Simple guard that always passes.
 * Used to measure guard execution overhead.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(_context: AbstractExecutionContext): boolean {
    // Always allow - just measuring guard overhead
    return true
  }
}
