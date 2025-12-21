import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common'

/**
 * Simple guard that always passes.
 * Used to measure guard execution overhead.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    // Always allow - just measuring guard overhead
    return true
  }
}
