# @navios/adapter-fastify

Fastify adapter for Navios - a Type-Safe HTTP Server with Zod Validation.

This package provides the Fastify adapter for Navios, allowing you to run Navios applications using the Fastify web framework.

## Installation

```bash
yarn install --save @navios/adapter-fastify @navios/core @navios/di fastify
```

## Usage

```ts
import { FastifyApplicationService } from '@navios/adapter-fastify'
import { NaviosFactory } from '@navios/core'

import { AppModule } from './src/app.module.mjs'

export async function boot() {
  const app = await NaviosFactory.create(AppModule, {
    adapter: FastifyApplicationService,
  })
  app.setGlobalPrefix('/api')
  await app.init()
  await app.listen({ port: 3000, host: 'localhost' })
}

await boot()
```

## Features

- **Fastify Integration**: Full support for Fastify's plugin ecosystem
- **Type Safety**: Maintains Navios' type-safe API
- **Performance**: Leverages Fastify's high-performance HTTP framework
- **Compatibility**: Drop-in replacement for other adapters
- **CORS Support**: Built-in CORS support via @fastify/cors
- **Multipart Support**: Built-in multipart form support via @fastify/multipart

## Requirements

- Node.js runtime
- @navios/core
- @navios/di
- fastify ^5.6.0
