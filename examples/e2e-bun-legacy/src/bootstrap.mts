import { defineBunEnvironment } from '@navios/adapter-bun'
import { NaviosFactory } from '@navios/core'

import type { BunEnvironment } from '@navios/adapter-bun'
import type { NaviosApplication } from '@navios/core'

import { AppModule } from './modules/app/app.module.mjs'

export async function createApp(): Promise<NaviosApplication<BunEnvironment>> {
  const app = await NaviosFactory.create<BunEnvironment>(AppModule, {
    adapter: defineBunEnvironment(),
  })

  app.enableCors({
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  })

  // No enableMultipart(): Bun parses multipart bodies natively.

  return app
}

// Run if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  const app = await createApp()
  await app.init()
  await app.listen({ port: 3000, hostname: 'localhost' })
  console.log('Server running at http://localhost:3000')
}
