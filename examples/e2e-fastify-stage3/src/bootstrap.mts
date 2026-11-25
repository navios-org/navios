import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { NaviosFactory } from '@navios/server'

import type { FastifyEnvironment } from '@navios/adapter-fastify'

import { AppModule } from './modules/app/app.module.mjs'

// Types `ctx.raw` and `app.getServer()` for the whole application.
declare module '@navios/server' {
  interface Register {
    environment: FastifyEnvironment
  }
}

export function createApp() {
  return NaviosFactory.create(AppModule, {
    adapter: defineFastifyEnvironment({
      cors: {
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      },
      multipart: true,
    }),
    // PostsValidationService is deliberately request-scoped.
    requestScopedServices: 'allow',
    logger: ['error', 'warn', 'fatal'],
  })
}

// Run if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  const app = await createApp()
  const url = await app.listen({ port: 3000, host: 'localhost' })
  console.log(`Server running at ${url}`)
}
