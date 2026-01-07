import type { AbstractExecutionContext, CanActivate } from '@navios/core'

import { AttributeFactory, Injectable, UnauthorizedException } from '@navios/core'

import { Public } from './public.attribute.mjs'

@Injectable()
export class AuthGuard implements CanActivate {
  async canActivate(context: AbstractExecutionContext): Promise<boolean> {
    const request = context.getRequest()
    const handlerMetadata = context.getHandler()

    // Check if endpoint is marked as @Public
    const isPublic = AttributeFactory.has(Public, handlerMetadata)
    if (isPublic) {
      return true
    }

    // Check for Authorization header
    // FastifyRequest uses request.headers.authorization (object property)
    // BunRequest uses request.headers.get('authorization') (Headers API)
    const authHeader = typeof request.headers?.get === 'function'
      ? request.headers.get('authorization')
      : request.headers?.authorization

    if (!authHeader) {
      throw new UnauthorizedException('Missing authorization header')
    }

    // Simple token validation (in real app, verify JWT)
    if (!authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Invalid authorization format')
    }

    const token = authHeader.slice(7)
    if (token !== 'valid-token') {
      throw new UnauthorizedException('Invalid token')
    }

    return true
  }
}
