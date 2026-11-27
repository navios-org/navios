import { envInt, envString, provideConfig } from '@navios/server'
import { z } from 'zod/v4'

/** Read from the environment; `.env` is loaded by the scripts and by the Better Auth CLI. */
export const AppConfig = provideConfig({
  name: 'AppConfig',
  schema: z.object({
    port: z.number(),
    databasePath: z.string().min(1),
    auth: z.object({
      baseURL: z.url(),
      secret: z.string().min(32),
    }),
  }),
  load: () => ({
    port: envInt('PORT', 3000),
    databasePath: envString('DATABASE_PATH', './data/app.db'),
    auth: {
      baseURL: envString('BETTER_AUTH_URL', 'http://localhost:3000'),
      // Only for trying the example. Set BETTER_AUTH_SECRET anywhere else.
      secret: envString('BETTER_AUTH_SECRET', 'navios-example-secret-do-not-use-in-production'),
    },
  }),
})
