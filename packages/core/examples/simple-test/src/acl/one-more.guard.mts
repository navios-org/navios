import type {
  AbstractExecutionContext,
  CanActivate,
} from '../../../../src/index.mjs'

import { inject, Injectable, Logger } from '../../../../src/index.mjs'

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
