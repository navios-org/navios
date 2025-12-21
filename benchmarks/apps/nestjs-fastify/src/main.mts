import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify'
import { AppModule } from './app.module.mjs'

const PORT = Number(process.env.PORT) || 3004

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    {
      // Minimal logging for benchmarks
      logger: process.env.NODE_ENV === 'production' ? false : ['error'],
    },
  )

  await app.listen(PORT, '0.0.0.0')

  console.log(`NestJS (Fastify) listening on http://localhost:${PORT}`)
}

await bootstrap()
