import {
  AttributeFactory,
  ForbiddenException,
  inject,
  registerInjectable,
  UnauthorizedException,
} from '@navios/server'

import type { Guard, RequestContext } from '@navios/server'

import { BetterAuth } from './better-auth-token.mjs'
import { CurrentSession, CurrentUser } from './current-user.mjs'
import { AccessAttribute, RolesAttribute } from './internal/access-attributes.mjs'

import type { AccessLevel } from './internal/access-attributes.mjs'
import type { AuthSessionData } from './types.mjs'

/** Whether `role`, a comma-separated list as Better Auth's admin plugin stores it, has one of `roles`. */
function hasRole(user: unknown, roles: readonly string[]): boolean {
  const role = (user as { role?: unknown }).role
  if (typeof role !== 'string') {
    return false
  }
  const own = role.split(',').map((name) => name.trim())
  return roles.some((name) => own.includes(name))
}

/**
 * The guard behind the access decorators. It reads the access of the route, the most specific
 * of handler, controller and module, looks the session up when the access needs it, fills
 * `CurrentUser` and `CurrentSession`, and answers 401 or 403. A route without an access
 * decorator is not checked.
 *
 * The decorators attach it themselves. It can also be given to a module or to the application
 * (`guards: [BetterAuthGuard]`), where it does the same: it acts on the decorators only.
 */
export class BetterAuthGuard implements Guard {
  private readonly auth = inject(BetterAuth)

  canActivate(ctx: RequestContext): boolean | Promise<boolean> {
    const access = AttributeFactory.get(AccessAttribute, ctx.route)
    if (access === null || access === 'public') {
      return true
    }
    return this.check(ctx, access)
  }

  private async check(ctx: RequestContext, access: AccessLevel): Promise<boolean> {
    const session = await this.session(ctx)
    if (session !== null) {
      ctx.set(CurrentUser, session.user)
      ctx.set(CurrentSession, session.session)
    }
    if (access === 'optional') {
      return true
    }
    if (access === 'guest') {
      if (session !== null) {
        throw new ForbiddenException('Already signed in')
      }
      return true
    }
    if (session === null) {
      throw new UnauthorizedException('Not signed in')
    }
    const roles = AttributeFactory.get(RolesAttribute, ctx.route)
    if (roles !== null && !hasRole(session.user, roles)) {
      throw new ForbiddenException(`Needs the role ${roles.join(' or ')}`)
    }
    return true
  }

  /** The session of the request. A cookie Better Auth refreshes is sent with the response. */
  private async session(ctx: RequestContext): Promise<AuthSessionData | null> {
    const { headers, response } = await this.auth.api.getSession({
      headers: ctx.headers.toWebHeaders(),
      returnHeaders: true,
    })
    for (const cookie of headers.getSetCookie()) {
      ctx.reply.append('set-cookie', cookie)
    }
    return response as AuthSessionData | null
  }
}
registerInjectable(BetterAuthGuard)
