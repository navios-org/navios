# Navios Documentation

## Table of Contents

### Getting Started

- [Quick Start Guide](./quick-start.md) - Get up and running quickly
- [Application Setup and Configuration](./application-setup.md) - Comprehensive setup guide

### Core Concepts

- [Modules](./modules.md) - Application organization and structure
- [Controllers](./controllers.md) - Request handlers and routing
- [Endpoints](./endpoints.md) - HTTP route definitions and configuration
- [Services and Dependency Injection](./services.md) - Business logic and DI system
- [Guards](./guards.md) - Authentication, authorization, and request filtering
- [Exception Handling](./exceptions.md) - Error handling and HTTP exceptions
- [Attribute System](./attributes.md) - Metadata and custom decorators
- [Legacy-Compatible Decorators](./legacy-compat.md) - Using Navios with TypeScript experimental decorators

### Infrastructure

- [HTTP Server Adapters](./adapters.md) - Fastify, Bun, and custom adapters

### Advanced Topics

- [Testing Guide](./testing.md) - Unit, integration, and E2E testing strategies
- Performance Optimization
- Deployment Patterns
- Plugin Development

---

## Introduction

Navios is a framework for building Type-Safe HTTP servers with TypeScript. It uses TypeScript and Navios builder to create servers with a well-defined structure, emphasizing type safety, validation, and developer experience.

The framework is adapter-based, allowing you to choose the underlying HTTP server implementation that best fits your deployment environment and performance requirements.

> **Important**: Always use `@navios/builder` to define your API endpoints instead of passing configuration objects directly to decorators. This ensures better type safety, maintainability, and access to advanced features like client generation.

## Architecture Overview

Navios follows a modular architecture with the following key components:

- **Core Framework** (`@navios/core`) - Provides the main framework features
- **Adapters** - HTTP server implementations (Fastify, Bun)
- **Builder** (`@navios/builder`) - Type-safe API definition and client generation
- **Dependency Injection** (`@navios/di`) - Powerful DI container
- **Additional Packages** - JWT, scheduling, React Query integration, and more

## HTTP Server Adapters

Navios requires an HTTP adapter to function as a server. The adapter pattern allows Navios to support different runtimes and frameworks while maintaining a consistent API.

### Prerequisites

**Important**: To use Navios as an HTTP server, you **must** install one of the supported adapters:

```bash
# For Fastify adapter (Node.js)
npm install @navios/adapter-fastify

# OR for Bun adapter (Bun runtime)
npm install @navios/adapter-bun
```

### Fastify Adapter

The Fastify adapter (`@navios/adapter-fastify`) integrates Navios with the [Fastify](https://www.fastify.io/) web framework.

#### Features:

- High performance HTTP server
- Rich ecosystem of plugins
- Full Node.js compatibility
- Built-in request/response validation
- Comprehensive middleware support
- Production-ready with extensive documentation

#### Usage:

```ts
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { NaviosFactory } from '@navios/core'

import { AppModule } from './app.module.js'

async function bootstrap() {
  const app = await NaviosFactory.create(AppModule, {
    adapter: defineFastifyEnvironment(),
  })

  // Configure CORS
  app.enableCors({
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  })

  // Enable multipart support for file uploads
  app.enableMultipart({})

  await app.init()
  await app.listen({ port: 3000, host: '0.0.0.0' })
}

bootstrap()
```

#### Dependencies:

The Fastify adapter requires `fastify` as a peer dependency:

```json
{
  "dependencies": {
    "@navios/core": "^0.5.0",
    "@navios/adapter-fastify": "^0.5.0",
    "fastify": "^5.6.0"
  }
}
```

### Bun Adapter

The Bun adapter (`@navios/adapter-bun`) integrates Navios with [Bun's](https://bun.sh/) native HTTP server.

#### Features:

- Optimized for Bun runtime performance
- Native HTTP server implementation
- Lightweight with minimal overhead
- Fast startup times
- Efficient memory usage

#### Usage:

```ts
import { defineBunEnvironment } from '@navios/adapter-bun'
import { NaviosFactory } from '@navios/core'

import { AppModule } from './app.module.js'

async function bootstrap() {
  const app = await NaviosFactory.create(AppModule, {
    adapter: defineBunEnvironment(),
  })

  // Configure CORS
  app.enableCors({
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  })

  // Enable multipart support
  app.enableMultipart({})

  await app.init()
  await app.listen({ port: 3000, host: '0.0.0.0' })
}

bootstrap()
```

#### Dependencies:

The Bun adapter works with Bun runtime and requires no additional HTTP server dependencies:

```json
{
  "dependencies": {
    "@navios/core": "^0.5.0",
    "@navios/adapter-bun": "^0.5.0"
  }
}
```

## Adapter Selection Guide

Choose the appropriate adapter based on your deployment environment and requirements:

| Adapter | Runtime | Performance | Ecosystem | Use Case                                      |
| ------- | ------- | ----------- | --------- | --------------------------------------------- |
| Fastify | Node.js | High        | Rich      | Production Node.js apps, need Fastify plugins |
| Bun     | Bun     | Very High   | Growing   | Performance-critical apps, Bun runtime        |

### When to use Fastify Adapter:

- Deploying to Node.js environments
- Need access to Fastify's extensive plugin ecosystem
- Require compatibility with existing Node.js tooling
- Working with teams familiar with Express/Fastify patterns
- Need mature production support and documentation

### When to use Bun Adapter:

- Running on Bun runtime
- Performance is critical
- Want faster startup times
- Prefer minimal dependencies
- Building new applications without legacy constraints

## Error Handling

Both adapters provide consistent error handling through Navios's exception system:

```ts
import { BadRequestException, NotFoundException } from '@navios/core'

@Controller()
export class UserController {
  @Endpoint(getUserEndpoint)
  async getUser(request: EndpointParams<typeof getUserEndpoint>) {
    const { id } = request

    if (!id) {
      throw new BadRequestException('User ID is required')
    }

    const user = await this.userService.findById(id)
    if (!user) {
      throw new NotFoundException('User not found')
    }

    return user
  }
}
```

## Configuration

Both adapters support the same Navios configuration options:

```ts
const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(), // or defineBunEnvironment()
  logger: ['error', 'warn', 'log'], // Optional: configure logging levels
})

// Global configuration
app.setGlobalPrefix('/api/v1')
app.enableCors({
  origin: ['http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
})

// Enable file uploads
app.enableMultipart({
  limits: {
    fileSize: 1024 * 1024 * 10, // 10MB
  },
})
```

## Advanced Usage

### Custom Adapter Configuration

You can pass configuration options to the underlying server:

```ts
// Fastify-specific configuration
const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment({
    // Fastify instance options can be configured here if needed
  }),
})

// Bun-specific configuration
const app = await NaviosFactory.create(AppModule, {
  adapter: defineBunEnvironment({
    // Bun server options can be configured here if needed
  }),
})
```

### Multiple Adapters

You can also configure multiple adapters if needed (advanced use case):

```ts
const app = await NaviosFactory.create(AppModule, {
  adapter: [
    defineFastifyEnvironment(),
    // Additional adapters...
  ],
})
```

## Migration Between Adapters

Switching between adapters is straightforward and requires minimal code changes:

1. Install the new adapter package
2. Update the import statement
3. Change the adapter function call
4. Update any adapter-specific configurations

```ts
// From Fastify

// To Bun
import { defineBunEnvironment } from '@navios/adapter-bun'
import { defineFastifyEnvironment } from '@navios/adapter-fastify'

const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
})

const app = await NaviosFactory.create(AppModule, {
  adapter: defineBunEnvironment(),
})
```

Your controllers, services, and application logic remain unchanged.
