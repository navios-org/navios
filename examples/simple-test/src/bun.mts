import { defineBunEnvironment } from '@navios/adapter-bun'
import { NaviosFactory } from '@navios/server'

import { AppModule } from './app/app.module.mjs'
import { AppConfig } from './config/app.config.mjs'

const app = await NaviosFactory.create(AppModule, {
  adapter: defineBunEnvironment({ cors: { origin: '*' } }),
})
app.enableShutdownHooks()
await app.init()
const config = await app.get(AppConfig)
await app.listen({ port: config.getOrThrow('port'), hostname: '0.0.0.0' })
