import { defineFastifyEnvironment } from '../../src/adapter-fastify/define-environment.mjs'
import { NaviosFactory } from '../../src/index.mjs'
import { ConfigService } from './config/config.service.mjs'
import { AppModule } from './src/app.module.mjs'

export async function boot() {
  const app = await NaviosFactory.create(
    AppModule,
    {},
    defineFastifyEnvironment(),
  )
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
