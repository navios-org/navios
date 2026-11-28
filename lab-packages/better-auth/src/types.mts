import type { Auth } from 'better-auth'

/**
 * Register the application's token here to type sessions with its plugins and additional
 * fields:
 *
 * ```ts
 * declare module '@navios/better-auth' {
 *   interface BetterAuthRegister {
 *     auth: typeof Auth
 *   }
 * }
 * ```
 */
// oxlint-disable-next-line no-empty-interface
export interface BetterAuthRegister {}

/** The session of a Better Auth instance, or of the token `provideBetterAuth()` returned. */
export type SessionOf<A> = A extends { readonly _types?: { value: infer Instance } }
  ? SessionOf<Instance>
  : A extends { $Infer: { Session: infer Session } }
    ? Session
    : never

/** The session of the registered instance, or Better Auth's base session and user. */
export type AuthSessionData = BetterAuthRegister extends { auth: infer A }
  ? SessionOf<A>
  : SessionOf<Auth>
