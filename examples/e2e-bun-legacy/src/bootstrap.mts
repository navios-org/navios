import { defineBunEnvironment } from '@navios/adapter-bun'
import { NaviosFactory } from '@navios/server'

import type { BunEnvironment } from '@navios/adapter-bun'

import { AppModule } from './modules/app/app.module.mjs'

declare module '@navios/server' {
  interface Register {
    environment: BunEnvironment
  }
}

export function createApp() {
  // Multipart needs no option: Bun parses multipart bodies natively.
  return NaviosFactory.create(AppModule, {
    adapter: defineBunEnvironment({
      cors: {
        origin: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      },
    }),
    // PostsValidationService is deliberately request-scoped.
    requestScopedServices: 'allow',
    logger: process.env.NODE_ENV === 'test' ? false : undefined,
  })
}

// Run if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  const app = await createApp()
  const url = await app.listen({ port: 3000, hostname: 'localhost' })
  console.log(`Server running at ${url}`)
}
