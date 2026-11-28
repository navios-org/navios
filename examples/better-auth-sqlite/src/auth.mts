import { provideBetterAuth } from '@navios/better-auth'

import { AppConfig } from './app.config.mjs'
import { Database } from './database.mjs'

/**
 * Better Auth, built by the container: the configuration and the database are injected. The
 * same token serves the HTTP routes (`betterAuthPlugin`) and the CLI (`auth.config.mts`).
 */
export const Auth = provideBetterAuth(async (ctx) => {
  const config = await ctx.inject(AppConfig)
  const db = await ctx.inject(Database)
  return {
    appName: 'Navios notes',
    baseURL: config.getOrThrow('auth.baseURL'),
    secret: config.getOrThrow('auth.secret'),
    database: db.connection,
    emailAndPassword: { enabled: true },
    user: {
      additionalFields: {
        // A column Better Auth adds to its user table, and a field of the typed session.
        plan: { type: 'string', required: false, defaultValue: 'free', input: false },
      },
    },
  }
})

// Types `CurrentUser` and `CurrentSession` with the fields above.
declare module '@navios/better-auth' {
  interface BetterAuthRegister {
    auth: typeof Auth
  }
}
