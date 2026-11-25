import type { AbstractExecutionContext, CanActivate } from '@navios/server'

import { inject, Injectable, Logger } from '@navios/server'

@Injectable()
export class AclGuard implements CanActivate {
  logger = inject(Logger, {
    context: AclGuard.name,
  })
  canActivate(
    executionContext: AbstractExecutionContext,
  ): Promise<boolean> | boolean {
    this.logger.log('ACL Guard activated')
    return true
  }
}
