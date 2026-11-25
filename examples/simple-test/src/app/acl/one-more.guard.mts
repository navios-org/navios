import type { AbstractExecutionContext, CanActivate } from '@navios/server'

import { inject, Injectable, Logger } from '@navios/server'

@Injectable()
export class OneMoreGuard implements CanActivate {
  logger = inject(Logger, {
    context: OneMoreGuard.name,
  })

  canActivate(
    executionContext: AbstractExecutionContext,
  ): Promise<boolean> | boolean {
    this.logger.log('One More Guard activated')
    return true
  }
}
