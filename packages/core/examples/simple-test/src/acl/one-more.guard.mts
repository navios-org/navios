import type { CanActivate, ExecutionContext } from '../../../../src/index.mjs'

import { Injectable, Logger, syncInject } from '../../../../src/index.mjs'

@Injectable()
export class OneMoreGuard implements CanActivate {
  logger = syncInject(Logger, {
    context: OneMoreGuard.name,
  })

  canActivate(executionContext: ExecutionContext): Promise<boolean> | boolean {
    this.logger.log('One More Guard activated')
    return true
  }
}
