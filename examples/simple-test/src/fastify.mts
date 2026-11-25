import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { NaviosFactory } from '@navios/server'

import { AppModule } from './app/app.module.mjs'
import { AppConfig } from './config/app.config.mjs'

const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment({ cors: { origin: true }, multipart: true }),
})
app.enableShutdownHooks()
await app.init()
const config = await app.get(AppConfig)
await app.listen({ port: config.getOrThrow('port'), host: '0.0.0.0' })
