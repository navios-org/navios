import type { AbstractExecutionContext, CanActivate } from '@navios/core'

import { inject, Injectable, Logger } from '@navios/core'

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
