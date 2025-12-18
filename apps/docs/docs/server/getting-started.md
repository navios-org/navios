---
sidebar_position: 1
slug: /
title: Getting Started
---

# Getting Started

Get up and running with Navios Server in minutes.

## Choose Your Adapter

Navios supports multiple adapters for different use cases:

### HTTP Adapters

| Feature | Fastify + Node.js | Fastify + Bun | Bun Adapter |
|---------|-------------------|---------------|-------------|
| **Runtime** | Node.js | Bun | Bun |
| **Performance** | High | Very High | Very High |
| **Plugin Ecosystem** | Extensive (@fastify/*) | Extensive (@fastify/*) | Limited |
| **CORS Support** | ✅ Built-in | ✅ Built-in | ❌ Not yet |
| **Multipart Uploads** | ✅ Via plugin | ✅ Via plugin | ✅ Native |
| **Hot Reload** | ✅ Via @navios/cli | ✅ Native | ✅ Native |
| **ES Decorators** | ✅ Native (Node 20+) | ⚠️ Requires plugin | ⚠️ Requires plugin |
| **Maturity** | Production-ready | Stable | Experimental |

### Additional Adapters

- **XML Adapter** (`@navios/adapter-xml`) - Build XML responses (RSS, sitemaps, Atom feeds) using JSX syntax. Works with both Fastify and Bun adapters.

## Installation

### Fastify on Node.js (Recommended)

```bash
npm install @navios/core @navios/adapter-fastify @navios/builder zod
```

### Fastify on Bun

```bash
bun add @navios/core @navios/adapter-fastify @navios/builder zod
```

### Bun Adapter

```bash
bun add @navios/core @navios/adapter-bun @navios/builder zod
```

:::tip
`@navios/core` re-exports `@navios/di`, so you don't need to install it separately.
:::

## Quick Start

Create a simple HTTP server with a single endpoint:

```typescript
import { NaviosFactory, Module, Controller, Endpoint, EndpointParams } from '@navios/core'
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { builder } from '@navios/builder'
import { z } from 'zod'

// 1. Define your API schema
const API = builder()

const userSchema = z.object({
  id: z.string(),
  name: z.string(),
})

export const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

// 2. Create a controller
@Controller()
class UserController {
  @Endpoint(getUser)
  async getUser(params: EndpointParams<typeof getUser>) {
    return {
      id: params.urlParams.userId,
      name: 'John Doe',
    }
  }
}

// 3. Create a module
@Module({
  controllers: [UserController],
})
class AppModule {}

// 4. Bootstrap the application
async function bootstrap() {
  const app = await NaviosFactory.create(AppModule, {
    adapter: defineFastifyEnvironment(),
    logger: ['log', 'error', 'warn'],
  })

  await app.listen({ port: 3000 })
  console.log('Server running on http://localhost:3000')
}

bootstrap()
```

## Run the Server

```bash
npx tsx src/main.ts
```

Test your endpoint:

```bash
curl http://localhost:3000/users/123
# {"id":"123","name":"John Doe"}
```

## Next Steps

- [Architecture](/docs/server/overview/architecture) - Understand modules, controllers, and endpoints
- [Controllers & Endpoints](/docs/server/guides/controllers) - Learn about routing and request handling
- [Adapters](/docs/server/adapters/fastify) - Configure your HTTP runtime
- [Packages](/docs/packages) - Explore additional packages like JWT, Schedule, and more
