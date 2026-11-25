import { defineBunEnvironment } from '@navios/adapter-bun'
import { NaviosFactory } from '@navios/server'

import { AppModule } from './app.module.mjs'
import { openApi, printBanner } from './openapi.mjs'

async function bootstrap() {
  const app = await NaviosFactory.create(AppModule, {
    adapter: defineBunEnvironment(),
    logger: ['log', 'error', 'warn'],
    plugins: [openApi],
  })

  await app.listen({ port: 3000 })
  printBanner('http://localhost:3000')
}

bootstrap().catch(console.error)
