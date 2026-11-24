import type { Guard, RequestContext } from '@navios/core'

import { AttributeFactory, Injectable, UnauthorizedException } from '@navios/core'

import { CurrentUser } from './current-user.mjs'
import { Public } from './public.attribute.mjs'

@Injectable()
export class AuthGuard implements Guard {
  canActivate(ctx: RequestContext): boolean {
    // @Public on the handler, its controller or its module
    if (AttributeFactory.has(Public, ctx.route)) {
      return true
    }

    const authHeader = ctx.headers.get('authorization')
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

    ctx.set(CurrentUser, { id: 'user-from-token', role: 'admin' })
    return true
  }
}
