import { inject, NaviosFactory } from '../../src/index.mjs'
import { ConfigService } from './config/config.service.mjs'
import { AppModule } from './src/app.module.mjs'

export async function boot() {
  const app = await NaviosFactory.create(AppModule)
  app.enableCors({
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  })
  await app.init()
  const configService = await inject(ConfigService)
  const port = configService.getOrThrow('port')
  await app.listen({ port: port, host: '0.0.0.0' })
}
await boot()
