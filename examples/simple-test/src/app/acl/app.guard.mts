import type { AbstractExecutionContext, CanActivate } from '@navios/core'

import { AttributeFactory, inject, Injectable, Logger } from '@navios/core'

import { Public } from './public.attribute.mjs'

@Injectable()
export class AppGuard implements CanActivate {
  logger = inject(Logger, {
    context: AppGuard.name,
  })

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
