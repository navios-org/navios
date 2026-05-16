import type {
  AbstractExecutionContext,
  CanActivate,
  LoggerInstance,
} from '@navios/core'

import { Injectable, Logger } from '@navios/core'
import { Inject } from '@navios/di'

@Injectable()
export class OneMoreGuard implements CanActivate {
  @Inject(Logger, { context: 'OneMoreGuard' })
  private accessor logger!: LoggerInstance

  canActivate(
    executionContext: AbstractExecutionContext,
  ): Promise<boolean> | boolean {
    this.logger.log('One More Guard activated')
    return true
  }
}
