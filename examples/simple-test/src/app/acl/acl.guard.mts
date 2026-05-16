import type {
  AbstractExecutionContext,
  CanActivate,
  LoggerInstance,
} from '@navios/core'

import { Injectable, Logger } from '@navios/core'
import { Inject } from '@navios/di'

@Injectable()
export class AclGuard implements CanActivate {
  @Inject(Logger, { context: 'AclGuard' })
  private accessor logger!: LoggerInstance

  canActivate(
    executionContext: AbstractExecutionContext,
  ): Promise<boolean> | boolean {
    this.logger.log('ACL Guard activated')
    return true
  }
}
