---
sidebar_position: 4
title: Conventions
---

# Conventions

This guide covers naming conventions and project organization patterns for Navios applications. Following these conventions ensures consistency and makes your codebase easier to navigate.

## File Naming

Use lowercase with dots separating the name from the type suffix:

| Type       | Pattern              | Example                   |
| ---------- | -------------------- | ------------------------- |
| Module     | `name.module.ts`     | `user.module.ts`          |
| Controller | `name.controller.ts` | `user.controller.ts`      |
| Service    | `name.service.ts`    | `user.service.ts`         |
| Factory    | `name.factory.ts`    | `database.factory.ts`     |
| Guard      | `name.guard.ts`      | `auth.guard.ts`           |
| Attribute  | `name.attribute.ts`  | `rate-limit.attribute.ts` |
| Repository | `name.repository.ts` | `user.repository.ts`      |
| Providers  | `name.providers.ts`  | `user.providers.ts`       |
| Constants  | `name.constants.ts`  | `user.constants.ts`       |

### Providers File

Use `name.providers.ts` for bound or factory injection tokens that a module uses. These tokens pre-configure services with specific values or dynamically compute configuration:

```typescript
// user.providers.ts
import { InjectionToken } from '@navios/di'
import { JwtServiceToken } from '@navios/jwt'

import { z } from 'zod'

import { AppConfig } from '../config/app.config.js'

// Let's setup JwtService that we will use in our application
export const JwtService = InjectionToken.factory(
  JwtServiceToken,
  async (ctx) => {
    const config = await ctx.container.get(AppConfig)
    return {
      secret: config.getOrThrow('jwt.secret'),
      signOptions: { expiresIn: config.getOrThrow('jwt.expiresIn') },
    }
  },
)
```

Use bound tokens for static values and factory tokens when you need to read from `ConfigService` or compute values dynamically. See the [Injection Tokens guide](/docs/di/di/guides/injection-tokens) for more details.

## Services vs Factories

Understanding when to use `@Injectable()` services versus `@Factory()` is important for proper dependency management.

### When to Use Services

Use `@Injectable()` for most application logic. Services are the default choice for:

- Business logic and domain operations
- Data validation and transformation
- Coordinating between other services
- Any class-based functionality you control

```typescript
// user.service.ts
@Injectable()
class UserService {
  private db = inject(DatabaseService)

  async findById(id: string) {
    return this.db.users.findUnique({ where: { id } })
  }

  async create(data: CreateUserDto) {
    return this.db.users.create({ data })
  }
}
```

### When to Use Factories

Use `@Factory()` in these specific scenarios:

**1. Initializing external libraries that aren't decorated with `@Injectable`**

Libraries like `PrismaClient`, HTTP clients (`@navios/http`, `axios`), or other third-party classes need factories to be integrated into the DI system:

```typescript
// database.factory.ts
import { Factory, type FactoryContext } from '@navios/di'
import { PrismaClient } from '@prisma/client'

@Factory()
class DatabaseFactory {
  create(ctx: FactoryContext) {
    const client = new PrismaClient()

    ctx.addDestroyListener(async () => {
      await client.$disconnect()
    })

    return client
  }
}

// Usage
@Injectable()
class UserRepository {
  private prisma = inject(DatabaseFactory)

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } })
  }
}
```

**2. Returning different implementations based on configuration**

When you need to select between providers (AI, email, payment, storage, etc.) at runtime:

```typescript
// ai.factory.ts
import { Factory, InjectionToken, type FactoryContext } from '@navios/di'
import { z } from 'zod'

const aiConfigSchema = z.object({
  provider: z.enum(['openai', 'anthropic']),
  apiKey: z.string(),
})

interface AIService {
  generateText(prompt: string): Promise<string>
}

const AI_SERVICE_TOKEN = InjectionToken.create<AIService, typeof aiConfigSchema>(
  'AI_SERVICE',
  aiConfigSchema,
)

@Factory({ token: AI_SERVICE_TOKEN })
class AIServiceFactory {
  create(ctx: FactoryContext, config: z.infer<typeof aiConfigSchema>): AIService {
    switch (config.provider) {
      case 'openai':
        return new OpenAIService(config.apiKey)
      case 'anthropic':
        return new AnthropicService(config.apiKey)
    }
  }
}
```

### Quick Reference

| Scenario | Use |
| -------- | --- |
| Business logic, repositories, domain services | `@Injectable()` |
| Third-party libraries (Prisma, axios, etc.) | `@Factory()` |
| Provider selection (AI, email, payment) | `@Factory()` with `InjectionToken` |
| Simple configuration-based initialization | `@Injectable()` with schema |

For detailed factory patterns, see the [Factories guide](/docs/di/di/guides/factories).

## Project Structure

A well-organized Navios project follows this structure:

```
src/
├── config/                     # Application configuration
│   └── app.config.ts
├── modules/                    # Feature modules
│   ├── user/
│   │   ├── user.module.ts
│   │   ├── user.controller.ts
│   │   ├── user.service.ts
│   │   ├── user.repository.ts
│   │   ├── user.providers.ts
│   │   ├── user.constants.ts
│   │   └── index.ts
│   ├── order/
│   │   ├── order.module.ts
│   │   ├── order.controller.ts
│   │   ├── order.service.ts
│   │   └── index.ts
│   └── auth/
│       ├── auth.module.ts
│       ├── auth.controller.ts
│       ├── auth.service.ts
│       ├── auth.guard.ts
│       └── index.ts
├── shared/                     # Shared utilities
│   ├── guards/
│   │   └── roles.guard.ts
│   ├── attributes/
│   │   └── rate-limit.attribute.ts
│   └── index.ts
├── app.module.ts               # Root module
└── main.ts                     # Entry point
```

### Module Organization

Modules should be nested and self-contained:

```
modules/
├── user/                       # User feature
│   ├── profile/                # Nested sub-feature
│   │   ├── profile.controller.ts
│   │   └── profile.service.ts
│   ├── user.module.ts
│   ├── user.controller.ts
│   └── user.service.ts
└── order/
    └── ...
```

### Barrel Exports

Each module should have an `index.ts` that re-exports its public API:

```typescript
// modules/user/index.ts
export { UserModule } from './user.module.js'
export { UserService } from './user.service.js'
export { UserRepository } from './user.repository.js'
```

## Endpoint Definitions

Endpoint definitions can be placed in a shared library (for front-end/back-end sharing) or in a dedicated folder within your API.

### Structure

Organize endpoints to mirror your module structure. Each endpoint should be in its own file:

```
api/
├── user/
│   ├── item.ts                 # GET /users/:id
│   ├── list.ts                 # GET /users
│   ├── create.ts               # POST /users
│   ├── update.ts               # PUT /users/:id
│   ├── delete.ts               # DELETE /users/:id
│   └── index.ts                # Barrel export
├── order/
│   ├── item.ts
│   ├── list.ts
│   └── index.ts
└── index.ts
```

### Naming Convention

Use action-based names for endpoint files:

| File        | HTTP Method | Description         |
| ----------- | ----------- | ------------------- |
| `item.ts`   | GET         | Fetch single item   |
| `list.ts`   | GET         | Fetch list of items |
| `create.ts` | POST        | Create single item  |
| `update.ts` | PUT         | Update single item  |
| `delete.ts` | DELETE      | Delete single item  |

### Endpoint File Structure

Each endpoint file should export the endpoint definition and related types:

```typescript
// api/user/item.ts
import { builder } from '@navios/builder'

import { UserSchema } from '@myapp/schemas'
import { z } from 'zod'

const API = builder()

export const endpoint = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: UserSchema.pick({ id: true, name: true, email: true }),
})

// Export types for front-end usage
export type Response = z.infer<typeof endpoint.responseSchema>
```

### Barrel Export Pattern

Use namespace exports for clean controller imports:

```typescript
// api/user/index.ts
export * as Item from './item.js'
export * as List from './list.js'
export * as Create from './create.js'
export * as Update from './update.js'
export * as Delete from './delete.js'
```

Usage in controller:

```typescript
import * as UserApi from '@myapp/api/user'

@Controller()
class UserController {
  @Endpoint(UserApi.Item.endpoint)
  async getUser(params: EndpointParams<typeof UserApi.Item.endpoint>) {
    // ...
  }

  @Endpoint(UserApi.List.endpoint)
  async listUsers(params: EndpointParams<typeof UserApi.List.endpoint>) {
    // ...
  }
}
```

### Type Exports for Front-End

Export useful types from each endpoint for front-end consumption:

```typescript
// api/user/list.ts
import { builder } from '@navios/builder'

import { UserSchema } from '@myapp/schemas'
import { z } from 'zod'

const API = builder()

const ItemSchema = UserSchema.pick({ id: true, name: true, email: true })

export const endpoint = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    page: z.coerce.number().optional(),
    limit: z.coerce.number().optional(),
    search: z.string().optional(),
  }),
  responseSchema: z.object({
    items: z.array(ItemSchema),
    total: z.number(),
    page: z.number(),
  }),
})

// Types for front-end
export type Response = z.infer<typeof endpoint.responseSchema>
export type Query = z.infer<typeof endpoint.querySchema>
export type Item = z.infer<typeof ItemSchema>
```

## Schema Definitions

Define schemas for your main entities in a shared location. These schemas serve as the contract between your database and endpoint definitions.

### Structure

```
schemas/
├── user.schema.ts
├── order.schema.ts
├── product.schema.ts
└── index.ts
```

### Auto-Generated Schemas

If using Prisma, you can auto-generate Zod schemas using tools like `zod-prisma-types`:

```bash
npm install zod-prisma-types
```

```typescript
// schemas/user.schema.ts (auto-generated or manual)
import { z } from 'zod'

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  role: z.enum(['user', 'admin']),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type User = z.infer<typeof UserSchema>
```

### Using Schemas in Endpoints

Pick, extend, or omit fields from your base schemas to create endpoint-specific types:

```typescript
// api/user/create.ts
import { UserSchema } from '@myapp/schemas'

export const endpoint = API.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema: UserSchema.pick({ email: true, name: true }),
  responseSchema: UserSchema.omit({ updatedAt: true }),
})

export type Request = z.infer<typeof endpoint.requestSchema>
export type Response = z.infer<typeof endpoint.responseSchema>
```

```typescript
// api/user/update.ts
import { UserSchema } from '@myapp/schemas'

export const endpoint = API.declareEndpoint({
  method: 'PUT',
  url: '/users/$userId',
  requestSchema: UserSchema.pick({ name: true, role: true }).partial(),
  responseSchema: UserSchema,
})
```

This approach ensures consistency between your database model and API contracts.

## Configuration

Place configuration in a dedicated `config/` folder at the application root.

### Structure

```
src/
├── config/
│   └── app.config.ts           # Main configuration
├── modules/
└── main.ts
```

### Configuration Pattern

Use `provideConfig` with environment variables:

```typescript
// config/app.config.ts
import { provideConfig } from '@navios/core'

import { z } from 'zod'

const configSchema = z.object({
  port: z.coerce.number().default(3000),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  database: z.object({
    url: z.string(),
    poolMin: z.coerce.number().default(2),
    poolMax: z.coerce.number().default(10),
  }),
  jwt: z.object({
    secret: z.string(),
    expiresIn: z.string().default('1h'),
  }),
  redis: z.object({
    url: z.string().optional(),
  }),
})

export type AppConfig = z.infer<typeof configSchema>

export const AppConfigToken = provideConfig<AppConfig>({
  load: async () => {
    const config = configSchema.parse({
      port: process.env.PORT,
      nodeEnv: process.env.NODE_ENV,
      database: {
        url: process.env.DATABASE_URL,
        poolMin: process.env.DATABASE_POOL_MIN,
        poolMax: process.env.DATABASE_POOL_MAX,
      },
      jwt: {
        secret: process.env.JWT_SECRET,
        expiresIn: process.env.JWT_EXPIRES_IN,
      },
      redis: {
        url: process.env.REDIS_URL,
      },
    })

    return config
  },
})
```

### Using Configuration

```typescript
import { inject } from '@navios/di'

import { AppConfigToken } from '../config/app.config.js'

@Injectable()
class DatabaseService {
  private config = inject(AppConfigToken)

  connect() {
    const dbUrl = this.config.getOrThrow('database.url')
    // ...
  }
}
```

### Best Practices

- **Environment variables** - Pass most configuration via environment variables
- **Validation** - Use Zod to validate configuration at startup
- **Fail fast** - Use `getOrThrow` for required configuration values
- **Type safety** - Always define TypeScript types for your configuration

## Tests Organization

Organize tests alongside source files with clear separation for e2e tests:

```
src/
├── modules/
│   └── user/
│       ├── user.service.ts
│       ├── user.service.spec.ts      # Unit tests
│       ├── user.controller.ts
│       └── user.controller.spec.ts
├── app.module.ts
└── main.ts
test/
├── e2e/                              # End-to-end tests
│   ├── user.e2e.spec.ts
│   ├── order.e2e.spec.ts
│   └── setup.ts                      # E2E test setup
├── factories/                        # Test data factories
│   ├── user.factory.ts
│   └── order.factory.ts
├── mocks/                            # Shared mocks
│   ├── database.mock.ts
│   └── auth.mock.ts
└── utils/                            # Test utilities
    └── test-app.ts
```

### Unit Tests

Place unit tests next to the files they test with `.spec.ts` suffix:

```typescript
// modules/user/user.service.spec.ts
import { TestContainer } from '@navios/core/testing'

import { UserService } from './user.service.js'

describe('UserService', () => {
  let service: UserService

  beforeEach(() => {
    const container = new TestContainer()
    // Setup mocks...
    service = container.get(UserService)
  })

  it('should find user by id', async () => {
    // ...
  })
})
```

### E2E Tests

Keep e2e tests in a separate `test/e2e/` directory:

```typescript
// test/e2e/user.e2e.spec.ts
import { createTestingModule } from '@navios/core/testing'

import { AppModule } from '../../src/app.module.js'

describe('User (e2e)', () => {
  let app: NaviosApplication

  beforeAll(async () => {
    const testingModule = createTestingModule(AppModule, {
      adapter: defineFastifyEnvironment(),
    })
    app = await testingModule.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('GET /users/:id - should return user', async () => {
    // ...
  })
})
```

### Vitest Configuration

Configure separate test runs for unit and e2e tests:

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'], // Unit tests only
  },
})
```

```typescript
// vitest.e2e.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/e2e/**/*.e2e.spec.ts'],
    setupFiles: ['test/e2e/setup.ts'],
    testTimeout: 30000,
  },
})
```

Add scripts to `package.json`:

```json
{
  "scripts": {
    "test": "vitest",
    "test:e2e": "vitest --config vitest.e2e.config.ts"
  }
}
```

## Summary

| Convention       | Pattern                                                 |
| ---------------- | ------------------------------------------------------- |
| File names       | `name.type.ts` (lowercase, dot-separated)               |
| Modules          | Nested in `modules/` folder                             |
| Endpoints        | One file per action (`item.ts`, `list.ts`, etc.)        |
| Endpoint exports | Namespace exports (`export * as Item from './item.js'`) |
| Schemas          | Shared folder, pick/omit for endpoints                  |
| Config           | `config/` folder at app root, use `provideConfig`       |
| Unit tests       | Next to source files (`.spec.ts`)                       |
| E2E tests        | Separate `test/e2e/` folder (`.e2e.spec.ts`)            |
