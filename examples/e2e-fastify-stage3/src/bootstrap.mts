import type { NaviosApplication } from '@navios/core'

import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { NaviosFactory } from '@navios/core'

import { AppModule } from './modules/app/app.module.mjs'

export async function createApp(): Promise<NaviosApplication> {
  const app = await NaviosFactory.create(AppModule, {
    adapter: defineFastifyEnvironment(),
  })

  app.enableCors({
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  })

  app.enableMultipart({})

  return app
}

// Run if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  const app = await createApp()
  await app.init()
  await app.listen({ port: 3000, host: 'localhost' })
  console.log('Server running at http://localhost:3000')
}
