import { inject, registerRequestValue, UnauthorizedException } from '@navios/server'

import type { RequestContext } from '@navios/server'

import { BetterAuth } from './better-auth-token.mjs'

import type { AuthSessionData } from './types.mjs'

/**
 * The session of the request, or `null` when it has none. It is looked up the first time a
 * request asks for it, once per request, so a guard and a handler share one lookup:
 *
 * ```ts
 * const session = await ctx.get(AuthSession)
 * ```
 *
 * When Better Auth refreshes the session, its new cookie is sent with the response.
 */
export class AuthSession {
  private readonly auth = inject(BetterAuth)

  async resolve(ctx: RequestContext): Promise<AuthSessionData | null> {
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
registerRequestValue(AuthSession)

/**
 * The session of the request. Throws `UnauthorizedException` (401) when it has none, so it
 * is safe to call on any route.
 */
export async function requireSession(ctx: RequestContext): Promise<AuthSessionData> {
  const session = await ctx.get(AuthSession)
  if (session === null) {
    throw new UnauthorizedException('Not signed in')
  }
  return session
}
