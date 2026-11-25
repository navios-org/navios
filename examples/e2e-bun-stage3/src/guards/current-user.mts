import { createContextKey } from '@navios/server'

export interface AuthenticatedUser {
  id: string
  role: 'admin' | 'user' | 'guest'
}

/**
 * The authenticated user of the current request. Set by `AuthGuard`, read in
 * handlers with `ctx.get(CurrentUser)`.
 */
export const CurrentUser = createContextKey<AuthenticatedUser>('CurrentUser')
