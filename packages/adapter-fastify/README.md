# @navios/adapter-fastify

Fastify adapter for Navios - a Type-Safe HTTP Server with Zod Validation.

This package provides the Fastify adapter for Navios, allowing you to run Navios applications using the high-performance [Fastify](https://www.fastify.io/) web framework.

## Overview

**Important**: `@navios/core` requires an HTTP adapter to function as a server. This package provides the Fastify implementation. You must install and configure an adapter to use Navios as an HTTP server.

## Features

- High-performance HTTP server based on Fastify
- Full TypeScript support with comprehensive JSDoc documentation
- Rich ecosystem of Fastify plugins
- Production-ready with extensive documentation
- Built-in request/response validation with Zod schemas
- Comprehensive middleware support
- Native CORS and multipart form data support

## Installation

```bash
npm install @navios/adapter-fastify @navios/core fastify
```

Or with yarn:

```bash
yarn add @navios/adapter-fastify @navios/core fastify
```

## Usage

### Basic Setup

```ts
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { NaviosFactory } from '@navios/core'

import { AppModule } from './app.module.js'

async function bootstrap() {
  const app = await NaviosFactory.create(AppModule, {
    adapter: defineFastifyEnvironment(), // Required!
  })

  app.setGlobalPrefix('/api')
  app.enableCors({
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  })

  await app.init()
  await app.listen({ port: 3000, host: '0.0.0.0' })
}

bootstrap()
```

### Advanced Configuration

```ts
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { NaviosFactory } from '@navios/core'

const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
})

// Enable CORS support
app.enableCors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
})

// Enable multipart support for file uploads
app.enableMultipart({
  limits: {
    fileSize: 1024 * 1024 * 10, // 10MB
    files: 5, // Max 5 files
  },
})

await app.init()
await app.listen({ port: 3000, host: '0.0.0.0' })
```

### Accessing Fastify Instance

```ts
// Get access to the underlying Fastify instance if needed
const fastifyInstance = app.getServer()

// Register Fastify plugins
await fastifyInstance.register(require('@fastify/static'), {
  root: path.join(__dirname, 'public'),
  prefix: '/public/',
})
```

## Features

- **High Performance**: Built on Fastify, one of the fastest Node.js web frameworks
- **Rich Ecosystem**: Access to extensive Fastify plugin system
- **Type Safety**: Maintains Navios' complete type-safe API with full JSDoc support
- **Production Ready**: Battle-tested Fastify foundation
- **Plugin System**: Full support for Fastify plugins and hooks
- **Schema Validation**: Built-in Zod schema validation with Fastify type provider
- **Request/Response Lifecycle**: Complete control over request/response handling
- **Error Handling**: Comprehensive error handling integration with RFC 7807 Problem Details format for standardized, machine-readable error responses
- **CORS Support**: Native CORS support via @fastify/cors
- **Multipart Support**: Native file upload support via @fastify/multipart
- **WebSocket Support**: Via Fastify WebSocket plugins
- **Static File Serving**: Via @fastify/static plugin

## Requirements

- **Runtime**: Node.js 18+
- **Dependencies**:
  - `@navios/core` - Core Navios framework
  - `fastify` ^5.6.0 - Fastify web framework
  - `@navios/di` - Dependency injection (peer dependency)

## When to Use Fastify Adapter

Choose the Fastify adapter when:

- ✅ Running on Node.js environments
- ✅ Need access to Fastify's rich plugin ecosystem
- ✅ Require mature, production-proven HTTP server
- ✅ Working with teams familiar with Express/Fastify patterns
- ✅ Need comprehensive middleware support
- ✅ Deploying to traditional Node.js hosting platforms

## Comparison with Other Adapters

| Feature     | Fastify Adapter  | Bun Adapter |
| ----------- | ---------------- | ----------- |
| Runtime     | Node.js          | Bun         |
| Performance | High             | Very High   |
| Ecosystem   | Rich             | Growing     |
| Maturity    | Production Ready | Emerging    |
| Plugins     | Extensive        | Limited     |

## Examples

Check out the [examples directory](../../examples/simple-test/src/fastify.mts) for complete working examples.

## Documentation

For complete documentation on using Navios with adapters, see:

- [Navios Core Documentation](../core/README.md)
- [Adapter Guide](../core/docs/adapters.md)
- [Quick Start Guide](../core/docs/quick-start.md)
