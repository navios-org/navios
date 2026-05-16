import type {
  AbstractExecutionContext,
  CanActivate,
  LoggerInstance,
} from '@navios/core'

import { Injectable, Logger } from '@navios/core'
import { Inject } from '@navios/di'

@Injectable()
export class AclModernGuard implements CanActivate {
  @Inject(Logger, { context: 'AclModernGuard' })
  private accessor logger!: LoggerInstance

  canActivate(
    executionContext: AbstractExecutionContext,
  ): Promise<boolean> | boolean {
    this.logger.log('ACL Modern Guard activated')
    return true
  }
}
