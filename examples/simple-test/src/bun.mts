// @ts-ignore - Can easily fail due to the fact that the adapter is not built yet
import { defineBunEnvironment } from '@navios/adapter-bun'
import { NaviosFactory } from '@navios/core'

import { AppModule } from './app/app.module.mjs'
import { ConfigService } from './config/config.service.mjs'

export async function boot() {
  const app = await NaviosFactory.create(AppModule, {
    adapter: defineBunEnvironment(),
  })
  app.enableCors({
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  })
  app.enableMultipart({})
  await app.init()
  const configService = await app.getContainer().get(ConfigService)
  const port = configService.getOrThrow('port')
  await app.listen({ port: port, host: '0.0.0.0' })
}
await boot()
