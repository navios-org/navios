import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module.mjs'

const PORT = Number(process.env.PORT) || 3003

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Minimal logging for benchmarks
    logger: process.env.NODE_ENV === 'production' ? false : ['error'],
  })

  await app.listen(PORT, '0.0.0.0')

  console.log(`NestJS (Express) listening on http://localhost:${PORT}`)
}

await bootstrap()
