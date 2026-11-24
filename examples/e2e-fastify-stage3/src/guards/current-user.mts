import { createContextKey } from '@navios/core'

export interface AuthenticatedUser {
  id: string
  token: string
}

/** Set by `AuthGuard` on every route that is not `@Public()`. */
export const CurrentUser = createContextKey<AuthenticatedUser>('CurrentUser')
