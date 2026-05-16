import type {
  AbstractExecutionContext,
  CanActivate,
  LoggerInstance,
} from '@navios/core'

import { AttributeFactory, Injectable, Logger } from '@navios/core'
import { Inject } from '@navios/di'

import { Public } from './public.attribute.mjs'

@Injectable()
export class AppGuard implements CanActivate {
  @Inject(Logger, { context: 'AppGuard' })
  private accessor logger!: LoggerInstance

  canActivate(
    executionContext: AbstractExecutionContext,
  ): Promise<boolean> | boolean {
    const isPublic = AttributeFactory.getLast(Public, [
      executionContext.getModule(),
      executionContext.getController(),
      executionContext.getHandler(),
    ])
    // this.logger.log('App Guard activated')
    // this.logger.log('isPublic', isPublic)
    return true
  }
}
