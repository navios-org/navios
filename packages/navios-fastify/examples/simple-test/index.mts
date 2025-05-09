import { inject, NaviosFactory } from '../../src/index.mjs'
import { AppModule } from './src/app.module.mjs'

export async function boot() {
  const app = await NaviosFactory.create(AppModule)
  app.enableCors({
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  })
  await app.init()
  await app.listen({ port: 3000, host: '0.0.0.0' })
}
await boot()
