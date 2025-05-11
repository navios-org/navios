import type { CanActivate, ExecutionContext } from '../../../../src/index.mjs'

import { Injectable, Logger, syncInject } from '../../../../src/index.mjs'

@Injectable()
export class AclModernGuard implements CanActivate {
  logger = syncInject(Logger, {
    context: AclModernGuard.name,
  })

  canActivate(executionContext: ExecutionContext): Promise<boolean> | boolean {
    this.logger.log('ACL Modern Guard activated')
    return true
  }
}
