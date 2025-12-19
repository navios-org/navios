---
sidebar_position: 1
slug: /
title: Getting Started
---

# Getting Started

Get up and running with Navios Server in minutes.

## What is Navios Server?

Navios Server is a framework for building type-safe HTTP servers with TypeScript. It combines:

- **Type-safe API contracts** using `@navios/builder` with Zod schemas
- **Dependency injection** for clean, testable code
- **Modular architecture** with controllers, services, and modules
- **Adapter-based design** supporting multiple HTTP runtimes

The framework emphasizes type safety, validation, and developer experience while allowing you to choose the underlying HTTP server that best fits your needs.

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

Navios Server follows a simple pattern: define your API endpoints with Builder, create controllers to handle them, organize controllers in modules, and bootstrap the application.

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

## How It Works

1. **API Definition**: `builder()` creates a type-safe API definition. Endpoints are declared with schemas that define request/response shapes.

2. **Controllers**: Controllers handle HTTP requests. The `@Endpoint()` decorator connects endpoint definitions to handler methods.

3. **Modules**: Modules organize controllers and services. The root module bootstraps your application.

4. **Type Safety**: TypeScript infers types from your schemas, ensuring requests and responses match your API contract.

## Next Steps

- [Architecture](/docs/server/overview/overview) - Understand modules, controllers, and endpoints
- [Controllers & Endpoints](/docs/server/guides/controllers) - Learn about routing and request handling
- [Services & Dependency Injection](/docs/server/guides/services) - Create and use services with dependency injection
- [Guards](/docs/server/guides/guards) - Implement authorization logic
- [Configuration](/docs/server/guides/configuration) - Manage application configuration
- [Testing](/docs/server/guides/testing) - Learn how to test your Navios application
- [Adapters](/docs/server/adapters/fastify) - Configure your HTTP runtime
- [Best Practices](/docs/server/best-practices) - Project structure and guidelines

## Related Documentation

- [Builder: Defining Endpoints](/docs/builder/guides/defining-endpoints) - Learn how to define type-safe endpoints
- [DI: Getting Started](/docs/di/getting-started) - Learn about dependency injection
