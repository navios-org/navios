# Navios

Navios is a Type-Safe HTTP Server with Zod Validation.

It is a powerful tool for building robust and type-safe APIs using TypeScript. It leverages the power of Zod for validation and provides a simple and intuitive API for defining endpoints, request and response schemas, and handling errors.

Navios is adapter-based, allowing you to choose the underlying HTTP server implementation. Currently supported adapters include:

- **Fastify** (via `@navios/adapter-fastify`) - A fast and low-overhead web framework for Node.js
- **Bun** (via `@navios/adapter-bun`) - A fast JavaScript runtime optimized for server-side applications

## Prerequisites

To work as an HTTP server, you must install one of the supported adapters:

```bash
# For Fastify adapter
npm install @navios/adapter-fastify

# OR for Bun adapter
npm install @navios/adapter-bun
```

The adapter must be provided when creating your Navios application to define the underlying HTTP server implementation.

## Features

- **Type Safety**: Navios provides a type-safe API for defining endpoints, request and response schemas. This ensures that your API is always type-safe and reduces the risk of runtime errors.
- **Validation**: Zod provides powerful validation capabilities, allowing you to define complex validation rules for your data. This ensures that the data you work with is always valid and meets your requirements.
- **Build with Navios Builder**: Navios Builder is a powerful HTTP client that simplifies API requests. By combining it with Navios, you can use the same API definition for both the client and server, ensuring consistency and reducing duplication.
- **Declarative API**: The API is designed to be declarative, allowing you to define your API endpoints and their schemas in a clear and concise manner. This makes it easy to understand and maintain your API client.
- **Customizable**: The package allows you to customize the behavior of the API client, such as using a custom client.
- **Error Handling**: The package provides built-in error handling capabilities, allowing you to handle API errors gracefully and provide meaningful feedback to users.

## Adapters

Navios uses an adapter pattern to support different HTTP server implementations. Each adapter provides the necessary bindings to integrate with a specific runtime or framework.

### Available Adapters

#### Fastify Adapter (`@navios/adapter-fastify`)

- Built on top of [Fastify](https://www.fastify.io/), a fast and low-overhead web framework
- Excellent performance and a rich ecosystem of plugins
- Full Node.js compatibility
- Supports all Fastify features including hooks, plugins, and decorators

```ts
import { defineFastifyEnvironment } from '@navios/adapter-fastify'

const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
})
```

#### Bun Adapter (`@navios/adapter-bun`)

- Built for [Bun](https://bun.sh/), a fast JavaScript runtime optimized for performance
- Native HTTP server implementation with excellent performance
- Optimized for Bun's runtime features
- Lightweight and efficient

```ts
import { defineBunEnvironment } from '@navios/adapter-bun'

const app = await NaviosFactory.create(AppModule, {
  adapter: defineBunEnvironment(),
})
```

### Choosing an Adapter

The choice of adapter depends on your deployment environment and performance requirements:

- Use **Fastify adapter** if you need Node.js compatibility, access to the Fastify ecosystem, or are deploying to traditional Node.js environments
- Use **Bun adapter** if you're running on Bun runtime and want to take advantage of its performance optimizations

## Main Concepts

- **Module**: A module is a collection of controllers, and other modules. It is used to group related functionality together and provide a clear structure for your API. It also can define some shared guards and attributes.
- **Controller**: A controller is a class that defines a set of endpoints for a specific resource. It is used to handle incoming requests and return responses. Controllers can also define guards and attributes that apply to all endpoints in the controller.
- **Endpoint**: An endpoint is a specific route in your API that handles a specific request. It used original endpoint definition from Navios Builder, and a set of request and response schemas. Endpoints can also define guards and attributes that apply to the endpoint.
- **Service**: A service is a class that defines the business logic for a specific resource. It is used to separate the business logic from the controller and provide a clear structure for your API.
- **Guard**: A guard is a class that is used to validate incoming requests and ensure that they meet certain criteria. Guards can be used to validate request parameters, headers, and body. They can also be used to check authentication and authorization.
- **Attribute**: An attribute is a decorator that is used to add metadata to a class or method. Attributes can be used in guards, controllers, modules, and endpoints to provide additional information about the class or method.

## Legacy-Compatible Decorators

Navios provides legacy-compatible decorators for projects that use TypeScript's experimental decorator API. These decorators are available from `@navios/core/legacy-compat` and provide the same functionality as the standard decorators, but with compatibility for projects that cannot use Stage 3 decorators.

```ts
import { Controller, Endpoint, Module } from '@navios/core/legacy-compat'

@Module({
  controllers: [UserController],
})
export class AppModule {}
```

For more information, see the [Legacy-Compatible Decorators documentation](./docs/legacy-compat.md).

## Getting Started

### Define your API

Define your API in a shared location accessible to both the client and server. This allows you to use the same API definition for both the client and server, ensuring consistency and reducing duplication.

```ts
import { builder } from '@navios/builder'

import { z } from 'zod/v4'

const api = builder({
  useDiscriminatorResponse: true,
})

const login = api.declareEndpoint({
  method: 'post',
  url: '/login',
  requestSchema: z.object({
    email: z.string().email(),
    password: z.string().min(6),
  }),
  responseSchema: z.discriminatedUnion('success', [
    z.object({
      success: z.literal(true),
      user: z.object({
        id: z.string(),
        name: z.string(),
        email: z.string().email(),
      }),
    }),
    z.object({
      success: z.literal(false),
      error: z.string(),
    }),
  ]),
})
```

### Create your server

```bash
# Install core dependencies
yarn install --save @navios/core @navios/builder zod

# Install one of the supported adapters
yarn install --save @navios/adapter-fastify
# OR
yarn install --save @navios/adapter-bun
```

Create AuthService:

```ts
import { Injectable } from '@navios/core'

@Injectable()
export class LoginService {
  async login(email: string, password: string) {
    // Perform your login logic here
    // For example, check the email and password against a database
  }
}
```

Create your first Controller:

```ts
import type { EndpointParams } from '@navios/core'

import { Controller, Endpoint, syncInject } from '@navios/core'

import { AuthService } from './auth.service.mjs'

@Controller()
export class AuthController {
  // Inject the LoginService
  loginService = syncInject(LoginService)

  @Endpoint(login)
  async login(request: EndpointParams<typeof login>) {
    // Handle the login request
    const { email, password } = request

    // Perform your login logic here
    const user = await this.loginService.login(email, password)

    if (user) {
      return { success: true, user }
    } else {
      return { success: false, error: 'Invalid credentials' }
    }
  }
}
```

Create your AppModule:

```ts
import { Module } from '@navios/core'

import { AuthController } from './auth.controller.mjs'

@Module({
  controllers: [AuthController],
})
export class AppModule {}
```

Create your server:

```ts
// Import your chosen adapter
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { NaviosFactory } from '@navios/core'

// OR import { defineBunEnvironment } from '@navios/adapter-bun'

import { AppModule } from './src/app.module.mjs'

export async function boot() {
  const app = await NaviosFactory.create(AppModule, {
    // Provide the adapter environment
    adapter: defineFastifyEnvironment(),
    // OR adapter: defineBunEnvironment(),
  })
  app.setGlobalPrefix('/api')
  app.enableCors({
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  })
  await app.init()
  await app.listen({ port: 3000, host: '0.0.0.0' })
}
await boot()
```

That's it! You have created your first Navios server. You can now run your server and test the `/api/login` endpoint.

## Documentation

- **[Quick Start Guide](./docs/quick-start.md)** - Get up and running quickly
- **[Complete Documentation](./docs/README.md)** - Comprehensive framework documentation
- **[Adapter Guide](./docs/adapters.md)** - Detailed adapter information and comparison
- **[Legacy-Compatible Decorators](./docs/legacy-compat.md)** - Using Navios with TypeScript experimental decorators
- **[API Examples](https://github.com/Arilas/navios/tree/main/examples)** - Working code examples
- **[CHANGELOG](./CHANGELOG.md)** - Version history and release notes

## Related Packages

- **[@navios/adapter-fastify](https://www.npmjs.com/package/@navios/adapter-fastify)** - Fastify HTTP adapter
- **[@navios/adapter-bun](https://www.npmjs.com/package/@navios/adapter-bun)** - Bun HTTP adapter
- **[@navios/builder](https://www.npmjs.com/package/@navios/builder)** - Type-safe API definitions
- **[@navios/di](https://www.npmjs.com/package/@navios/di)** - Dependency injection container
- **[@navios/jwt](https://www.npmjs.com/package/@navios/jwt)** - JWT authentication utilities

## License

MIT
