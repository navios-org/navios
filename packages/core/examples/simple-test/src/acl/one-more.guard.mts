import type { CanActivate, ExecutionContext } from '../../../../src/index.mjs'

import { inject, Injectable, Logger } from '../../../../src/index.mjs'

@Injectable()
export class OneMoreGuard implements CanActivate {
  logger = inject(Logger, {
    context: OneMoreGuard.name,
  })

  canActivate(executionContext: ExecutionContext): Promise<boolean> | boolean {
    this.logger.log('One More Guard activated')
    return true
  }
}
