import { defineBunEnvironment } from '@navios/adapter-bun'
import { betterAuthPlugin } from '@navios/better-auth'
import { NaviosFactory } from '@navios/server'

import type { NaviosApplicationOptions } from '@navios/server'

import { AppModule } from './app.module.mjs'
import { Auth } from './auth.mjs'

export function createApp(options: Pick<NaviosApplicationOptions, 'logger'> = {}) {
  return NaviosFactory.create(AppModule, {
    adapter: defineBunEnvironment(),
    // Mounts Better Auth at /api/auth: sign-up, sign-in, sessions, sign-out. On Bun, Better
    // Auth gets the request Bun received, and its response is sent as it is.
    plugins: [betterAuthPlugin({ auth: Auth })],
    ...options,
  })
}
