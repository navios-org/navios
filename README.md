# Navios Framework

> Type-safe, decorator-based framework for building modern APIs

Navios is a powerful TypeScript framework for building type-safe HTTP servers with built-in validation, dependency injection, and a declarative API. It leverages Zod for runtime validation and provides a seamless developer experience with full type safety from API definition to implementation.

## 🚀 Features

- **Type Safety**: End-to-end type safety from API definitions to server implementation
- **Zod Validation**: Built-in request and response validation using Zod schemas
- **Dependency Injection**: Powerful DI container with support for services, factories, and scopes
- **Adapter-Based**: Choose your HTTP server implementation (Fastify, Bun, or custom)
- **Declarative API**: Clean, decorator-based syntax for defining controllers, endpoints, and modules
- **Shared Definitions**: Use the same API definitions for both client and server with Navios Builder
- **Modern TypeScript**: Built with TypeScript 5+ and Stage 3 decorators

## 📦 Core Packages

### Framework Core
- **[@navios/core](https://www.npmjs.com/package/@navios/core)** - Core framework for building type-safe HTTP servers
- **[@navios/builder](https://www.npmjs.com/package/@navios/builder)** - Type-safe API definitions and HTTP client builder
- **[@navios/di](https://www.npmjs.com/package/@navios/di)** - Dependency injection container

### Adapters
- **[@navios/adapter-fastify](https://www.npmjs.com/package/@navios/adapter-fastify)** - Fastify HTTP adapter
- **[@navios/adapter-bun](https://www.npmjs.com/package/@navios/adapter-bun)** - Bun HTTP adapter
- **[@navios/adapter-xml](https://www.npmjs.com/package/@navios/adapter-xml)** - XML adapter

### Additional Packages
- **[@navios/jwt](https://www.npmjs.com/package/@navios/jwt)** - JWT authentication utilities
- **[@navios/schedule](https://www.npmjs.com/package/@navios/schedule)** - Task scheduling
- **[@navios/commander](https://www.npmjs.com/package/@navios/commander)** - CLI command framework
- **[@navios/react-query](https://www.npmjs.com/package/@navios/react-query)** - React Query integration
- **[@navios/di-react](https://www.npmjs.com/package/@navios/di-react)** - React integration for DI

## 📚 Documentation

**👉 [Full Documentation](https://navios.tech)**

The complete documentation includes:
- [Server Guide](https://navios.tech/docs/server) - Building HTTP servers with Navios
- [Builder Guide](https://navios.tech/docs/builder) - Creating type-safe API definitions
- [DI Guide](https://navios.tech/docs/di) - Dependency injection patterns and best practices
- [Packages](https://navios.tech/docs/packages) - All available packages and their usage

## 🏁 Quick Start

### 1. Install Dependencies

```bash
# Core packages
npm install @navios/core @navios/builder zod

# Choose an adapter
npm install @navios/adapter-fastify
# OR
npm install @navios/adapter-bun
```

### 2. Define Your API

```typescript
import { builder } from '@navios/builder'
import { z } from 'zod'

const api = builder()

const getUser = api.declareEndpoint({
  method: 'get',
  url: '/users/:id',
  paramsSchema: z.object({ id: z.string() }),
  responseSchema: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
  }),
})
```

### 3. Create Your Server

```typescript
import { Controller, Endpoint, Module } from '@navios/core'
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { NaviosFactory } from '@navios/core'
import type { EndpointParams } from '@navios/core'

@Controller()
export class UserController {
  @Endpoint(getUser)
  async getUser(request: EndpointParams<typeof getUser>) {
    return {
      id: request.params.id,
      name: 'John Doe',
      email: 'john@example.com',
    }
  }
}

@Module({
  controllers: [UserController],
})
export class AppModule {}

// Bootstrap
const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
})

await app.listen({ port: 3000 })
```

## 🎯 Why Navios?

- **Type Safety First**: Catch errors at compile time, not runtime
- **Developer Experience**: Intuitive decorator-based API that feels natural
- **Flexibility**: Adapter pattern allows you to choose the best runtime for your needs
- **Validation Built-in**: Zod integration ensures data integrity
- **Modern Stack**: Built for TypeScript 5+ with modern decorators

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT

## 🔗 Links

- **Documentation**: [navios.tech](https://navios.tech)
- **GitHub**: [github.com/Arilas/navios](https://github.com/Arilas/navios)
- **NPM**: [npmjs.com/org/navios](https://www.npmjs.com/org/navios)
