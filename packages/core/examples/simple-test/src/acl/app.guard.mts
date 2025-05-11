import type { CanActivate, ExecutionContext } from '../../../../src/index.mjs'

import {
  AttributeFactory,
  Injectable,
  Logger,
  syncInject,
} from '../../../../src/index.mjs'
import { Public } from './public.attribute.mjs'

@Injectable()
export class AppGuard implements CanActivate {
  logger = syncInject(Logger, {
    context: AppGuard.name,
  })

  canActivate(executionContext: ExecutionContext): Promise<boolean> | boolean {
    const isPublic = AttributeFactory.getLast(Public, [
      executionContext.getModule(),
      executionContext.getController(),
      executionContext.getHandler(),
    ])
    this.logger.log('App Guard activated')
    this.logger.log('isPublic', isPublic)
    return true
  }
}
