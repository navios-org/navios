import type { FastifyRequest } from 'fastify'

import type { CanActivate } from '../../../../src/index.mjs'

import { Injectable } from '../../../../src/index.mjs'

@Injectable()
export class AclGuard implements CanActivate {
  canActivate(
    request: FastifyRequest,
    reply: FastifyRequest,
  ): Promise<boolean> | boolean {
    console.log('ACL Guard activated')
    return true
  }
}
