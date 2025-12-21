import { defineBunEnvironment } from '@navios/adapter-bun'
import { NaviosFactory } from '@navios/core'

import { AppModule } from './app.module.mjs'

const PORT = Number(process.env.PORT) || 3002

async function bootstrap() {
  const app = await NaviosFactory.create(AppModule, {
    adapter: defineBunEnvironment(),
    // Minimal logging for benchmarks
    logger: process.env.NODE_ENV === 'production' ? [] : ['error'],
    validateResponses: false,
  })

  await app.init()
  await app.listen({ port: PORT, host: '0.0.0.0' })

  console.log(`Navios (Bun) listening on http://localhost:${PORT}`)
}

await bootstrap()
