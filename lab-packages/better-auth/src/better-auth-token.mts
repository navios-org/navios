import { InjectionToken } from '@navios/server'

import type { Auth } from 'better-auth'

/**
 * The Better Auth instance of the application, whichever token `betterAuthPlugin()` was given.
 * The package's guard and request value inject it. Inject your own token instead: it carries
 * the type of your options.
 */
export const BetterAuth = InjectionToken.create<Auth>('BetterAuth (betterAuthPlugin)')
