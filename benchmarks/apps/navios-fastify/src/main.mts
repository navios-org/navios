import { hostname } from 'os'

import {
  defineFastifyEnvironment,
  FastifyEnvironment,
} from '@navios/adapter-fastify'
import { NaviosFactory } from '@navios/core'

import { AppModule } from './app.module.mjs'

const PORT = Number(process.env.PORT) || 3001

async function bootstrap() {
  const app = await NaviosFactory.create<FastifyEnvironment>(AppModule, {
    adapter: defineFastifyEnvironment(),
    // Minimal logging for benchmarks
    logger: process.env.NODE_ENV === 'production' ? [] : ['error'],
    validateResponses: false,
  })

  await app.init()
  await app.listen({ port: PORT, host: '0.0.0.0' })

  console.log(`Navios (Fastify) listening on http://localhost:${PORT}`)
}

await bootstrap()
