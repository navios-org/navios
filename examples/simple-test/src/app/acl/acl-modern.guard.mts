import type { AbstractExecutionContext, CanActivate } from '@navios/server'

import { inject, Injectable, Logger } from '@navios/server'

@Injectable()
export class AclModernGuard implements CanActivate {
  logger = inject(Logger, {
    context: AclModernGuard.name,
  })

  canActivate(
    executionContext: AbstractExecutionContext,
  ): Promise<boolean> | boolean {
    this.logger.log('ACL Modern Guard activated')
    return true
  }
}
