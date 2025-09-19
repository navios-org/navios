# @navios/adapter-bun

Bun adapter for Navios - a Type-Safe HTTP Server with Zod Validation.

This package provides the Bun runtime adapter for Navios, allowing you to run Navios applications on the Bun runtime.

## Installation

```bash
yarn install --save @navios/adapter-bun @navios/core @navios/di
```

## Usage

```ts
import { BunApplicationService } from '@navios/adapter-bun'
import { NaviosFactory } from '@navios/core'

import { AppModule } from './src/app.module.mjs'

export async function boot() {
  const app = await NaviosFactory.create(AppModule, {
    adapter: BunApplicationService,
  })
  app.setGlobalPrefix('/api')
  await app.init()
  await app.listen({ port: 3000, hostname: 'localhost' })
}

await boot()
```

## Features

- **Bun Runtime Support**: Full support for Bun's native HTTP server
- **Type Safety**: Maintains Navios' type-safe API
- **Performance**: Leverages Bun's high-performance runtime
- **Compatibility**: Drop-in replacement for other adapters

## Requirements

- Bun runtime
- @navios/core
- @navios/di
