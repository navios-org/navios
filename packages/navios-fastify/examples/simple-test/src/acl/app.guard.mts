import type { FastifyRequest } from 'fastify'

import type { CanActivate, ExecutionContext } from '../../../../src/index.mjs'

import { AttributeFactory, Injectable } from '../../../../src/index.mjs'
import { Public } from './public.attribute.mjs'

@Injectable()
export class AppGuard implements CanActivate {
  canActivate(executionContext: ExecutionContext): Promise<boolean> | boolean {
    const isPublic = AttributeFactory.getLast(Public, [
      executionContext.getModule(),
      executionContext.getController(),
      executionContext.getHandler(),
    ])
    console.log('App Guard activated')
    console.log('isPublic', isPublic)
    return true
  }
}
