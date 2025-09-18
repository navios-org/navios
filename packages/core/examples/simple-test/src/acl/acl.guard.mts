import type { CanActivate, ExecutionContext } from '../../../../src/index.mjs'

import { inject, Injectable, Logger } from '../../../../src/index.mjs'

@Injectable()
export class AclGuard implements CanActivate {
  logger = inject(Logger, {
    context: AclGuard.name,
  })
  canActivate(executionContext: ExecutionContext): Promise<boolean> | boolean {
    this.logger.log('ACL Guard activated')
    return true
  }
}
