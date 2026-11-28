import { createContextKey } from '@navios/server'

import type { PlainContextKey } from '@navios/server'

import type { AuthSessionData } from './types.mjs'

/** The user of the session: Better Auth's base user, or that of the registered instance. */
export type AuthUser = AuthSessionData['user']

/** The session record: its id, expiry, IP address and user agent. */
export type AuthSessionRecord = AuthSessionData['session']

/**
 * The signed-in user, filled by the access decorators before the handler runs. Behind
 * `@Authenticated()` and `@Roles()` it is always there: `ctx.get(CurrentUser)`. Behind
 * `@OptionalAuth()` it may not be: `ctx.find(CurrentUser)`.
 */
export const CurrentUser: PlainContextKey<AuthUser> = createContextKey<AuthUser>('CurrentUser')

/** The session record of the signed-in user, filled with `CurrentUser`. */
export const CurrentSession: PlainContextKey<AuthSessionRecord> =
  createContextKey<AuthSessionRecord>('CurrentSession')
