import type { FastifyRequest } from 'fastify'

import type { CanActivate, ExecutionContext } from '../../../../src/index.mjs'

import { Injectable } from '../../../../src/index.mjs'

@Injectable()
export class AclModernGuard implements CanActivate {
  canActivate(executionContext: ExecutionContext): Promise<boolean> | boolean {
    console.log('ACL Modern Guard activated')
    return true
  }
}
