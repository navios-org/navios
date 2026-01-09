# Quick Start Guide

This guide will help you get up and running with Navios quickly.

## Prerequisites

Before starting, make sure you have:

- Node.js 18+ or Bun runtime
- TypeScript knowledge
- Basic understanding of HTTP APIs

## Step 1: Install Dependencies

Navios requires an HTTP adapter to function. Choose one based on your runtime:

### For Node.js (Fastify Adapter)

```bash
npm install @navios/core @navios/builder @navios/adapter-fastify zod fastify
```

### For Bun Runtime (Bun Adapter)

```bash
npm install @navios/core @navios/builder @navios/adapter-bun zod
```

## Step 2: Define Your API

Create a shared API definition file (`api/index.ts`):

```ts
import { builder } from '@navios/builder'

import { z } from 'zod'

export const api = builder({
  useDiscriminatorResponse: true,
})

export const createUserEndpoint = api.declareEndpoint({
  method: 'post',
  url: '/users',
  requestSchema: z.object({
    name: z.string().min(1),
    email: z.string().email(),
  }),
  responseSchema: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    createdAt: z.date(),
  }),
})

export const getUserEndpoint = api.declareEndpoint({
  method: 'get',
  url: '/users/$id',
  requestSchema: z.object({
    id: z.string(),
  }),
  responseSchema: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    createdAt: z.date(),
  }),
})
```

## Step 3: Create a Service

Create a user service (`services/user.service.ts`):

```ts
import { Injectable } from '@navios/core'

export interface User {
  id: string
  name: string
  email: string
  createdAt: Date
}

@Injectable()
export class UserService {
  private users: User[] = []
  private idCounter = 1

  async createUser(name: string, email: string): Promise<User> {
    const user: User = {
      id: this.idCounter.toString(),
      name,
      email,
      createdAt: new Date(),
    }
    this.users.push(user)
    this.idCounter++
    return user
  }

  async getUserById(id: string): Promise<User | undefined> {
    return this.users.find((user) => user.id === id)
  }

  async getAllUsers(): Promise<User[]> {
    return this.users
  }
}
```

## Step 4: Create a Controller

Create a user controller (`controllers/user.controller.ts`):

```ts
import type { EndpointParams } from '@navios/core'

import { Controller, Endpoint, inject, NotFoundException } from '@navios/core'

import { createUserEndpoint, getUserEndpoint } from '../api/index.js'
import { UserService } from '../services/user.service.js'

@Controller()
export class UserController {
  private userService = inject(UserService)

  @Endpoint(createUserEndpoint)
  async createUser(request: EndpointParams<typeof createUserEndpoint>) {
    const { name, email } = request
    return await this.userService.createUser(name, email)
  }

  @Endpoint(getUserEndpoint)
  async getUser(request: EndpointParams<typeof getUserEndpoint>) {
    const { id } = request
    const user = await this.userService.getUserById(id)

    if (!user) {
      throw new NotFoundException('User not found')
    }

    return user
  }
}
```

## Step 5: Create an App Module

Create your application module (`app.module.ts`):

```ts
import { Module } from '@navios/core'

import { UserController } from './controllers/user.controller.js'
import { UserService } from './services/user.service.js'

@Module({
  controllers: [UserController],
  providers: [UserService],
})
export class AppModule {}
```

## Step 6: Create the Server

Create your server entry point (`server.ts`):

### Using Fastify Adapter (Node.js)

```ts
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { NaviosFactory } from '@navios/core'

import { AppModule } from './app.module.js'

async function bootstrap() {
  const app = await NaviosFactory.create(AppModule, {
    adapter: defineFastifyEnvironment(), // Required!
  })

  // Optional: Configure CORS
  app.enableCors({
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  })

  // Optional: Set global prefix
  app.setGlobalPrefix('/api')

  await app.init()
  await app.listen({ port: 3000, host: '0.0.0.0' })

  console.log('Server running on http://localhost:3000')
}

bootstrap().catch(console.error)
```

### Using Bun Adapter (Bun Runtime)

```ts
import { defineBunEnvironment } from '@navios/adapter-bun'
import { NaviosFactory } from '@navios/core'

import { AppModule } from './app.module.js'

async function bootstrap() {
  const app = await NaviosFactory.create(AppModule, {
    adapter: defineBunEnvironment(), // Required!
  })

  // Optional: Configure CORS
  app.enableCors({
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  })

  // Optional: Set global prefix
  app.setGlobalPrefix('/api')

  await app.init()
  await app.listen({ port: 3000, host: '0.0.0.0' })

  console.log('Server running on http://localhost:3000')
}

bootstrap().catch(console.error)
```

## Step 7: Run Your Server

### With Node.js

```bash
npx tsx server.ts
```

### With Bun

```bash
bun run server.ts
```

## Step 8: Test Your API

Your server is now running! Test the endpoints:

### Create a user

```bash
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{"name": "John Doe", "email": "john@example.com"}'
```

### Get a user

```bash
curl http://localhost:3000/api/users/1
```

## Next Steps

Now that you have a basic Navios server running:

1. **Add more endpoints** - Extend your API definition
2. **Add authentication** - Use guards for protecting endpoints
3. **Add validation** - Leverage Zod schemas for complex validation
4. **Add database integration** - Connect to your preferred database
5. **Add error handling** - Use Navios exceptions for consistent error responses
6. **Add testing** - Write unit and integration tests for your API

## Common Gotchas

1. **Missing Adapter**: The most common error is forgetting to install and configure an adapter. Navios will not work without one!

2. **Import Paths**: Make sure to use the correct file extensions (`.js` or `.mjs`) in your imports for TypeScript compilation.

3. **Async/Await**: Remember to use `async/await` in your endpoint handlers for proper error handling.

4. **Type Safety**: Leverage TypeScript fully by using the provided types from Navios.

## Help and Resources

- [Full Documentation](./README.md)
- [Adapter Guide](./adapters.md)
- [GitHub Repository](https://github.com/Arilas/navios)
- [Examples](../../examples/)

Happy coding with Navios! 🚀
