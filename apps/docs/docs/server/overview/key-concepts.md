---
sidebar_position: 3
title: Key Concepts
---

# Key Concepts

Core concepts that power Navios Server applications.

## Decorators

Navios uses TypeScript decorators to attach metadata to classes and methods. This metadata is used at runtime to configure routing, dependency injection, and more.

```typescript
@Module({...})      // Marks class as a module
@Controller()       // Marks class as a controller
@Injectable()       // Marks class as injectable service
@Endpoint(...)      // Marks method as HTTP endpoint
@UseGuards(...)     // Attaches guards to endpoint
@HttpCode(201)      // Sets response status code
@Header('X-Custom') // Sets response header
```

## Type-Safe API Contracts

Navios uses `@navios/builder` with Zod schemas to define type-safe API contracts. This provides:

- **Request validation** - Automatically validate incoming data
- **Response validation** - Ensure responses match the schema
- **TypeScript types** - Full autocompletion and type checking

```typescript
import { builder } from '@navios/builder'
import { z } from 'zod'

const API = builder()

// Define schemas
const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
})

const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
})

// Define endpoint
export const createUser = API.declareEndpoint({
  method: 'POST',
  url: '/users',
  dataSchema: createUserSchema,
  responseSchema: userSchema,
})

// Use in controller - params are fully typed
@Endpoint(createUser)
async createUser(params: EndpointParams<typeof createUser>) {
  // params.data is { name: string, email: string }
  // Return type must be { id: string, name: string, email: string }
}
```

:::tip
For comprehensive information about defining endpoints with Builder, see the [Builder documentation](/docs/builder/guides/defining-endpoints).
:::

## URL Parameters

Define dynamic URL segments with the `$` prefix:

```typescript
const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

// Access in handler
@Endpoint(getUser)
async getUser(params: EndpointParams<typeof getUser>) {
  const userId = params.urlParams.userId // typed as string
}
```

## Query Parameters

Define query parameter schemas for GET requests:

```typescript
const listUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    page: z.coerce.number().default(1),
    limit: z.coerce.number().default(10),
    search: z.string().optional(),
  }),
  responseSchema: z.array(userSchema),
})

@Endpoint(listUsers)
async listUsers(params: EndpointParams<typeof listUsers>) {
  const { page, limit, search } = params.query
}
```

## Request Body

Define body schemas for POST/PUT/PATCH requests:

```typescript
const updateUser = API.declareEndpoint({
  method: 'PUT',
  url: '/users/$userId',
  dataSchema: z.object({
    name: z.string().optional(),
    email: z.string().email().optional(),
  }),
  responseSchema: userSchema,
})

@Endpoint(updateUser)
async updateUser(params: EndpointParams<typeof updateUser>) {
  const { userId } = params.urlParams
  const updates = params.data
}
```

## Dependency Injection

Navios is built on `@navios/di`. Use the `inject()` function to request dependencies:

```typescript
import { inject, Injectable } from '@navios/di'

@Injectable()
class DatabaseService {
  async query(sql: string) { /* ... */ }
}

@Injectable()
class UserService {
  private db = inject(DatabaseService)

  async findById(id: string) {
    return this.db.query(`SELECT * FROM users WHERE id = ?`)
  }
}

@Controller()
class UserController {
  private userService = inject(UserService)

  @Endpoint(getUser)
  async getUser(params: EndpointParams<typeof getUser>) {
    return this.userService.findById(params.urlParams.userId)
  }
}
```

:::tip
For more details on using services and dependency injection, see the [Services & Dependency Injection guide](/docs/server/guides/services). For advanced DI topics, see the [DI documentation](/docs/di).
:::

## Service Scopes

Services can have different lifetimes:

| Scope | Description |
|-------|-------------|
| `singleton` | One instance for the entire application (default) |
| `transient` | New instance every time it's injected |
| `request` | One instance per HTTP request |

```typescript
@Injectable({ scope: 'request' })
class RequestContext {
  userId: string | null = null
}
```

:::tip
For detailed information about service scopes and lifecycle management, see the [Services & Dependency Injection guide](/docs/server/guides/services) and [DI: Scopes documentation](/docs/di/guides/scopes).
:::

## Injection Tokens

For interfaces or non-class dependencies, use injection tokens:

```typescript
import { InjectionToken } from '@navios/di'

interface Config {
  apiKey: string
  baseUrl: string
}

const ConfigToken = new InjectionToken<Config>('Config')

// Provide value
container.register(ConfigToken, {
  apiKey: process.env.API_KEY,
  baseUrl: 'https://api.example.com',
})

// Inject
@Injectable()
class ApiClient {
  private config = inject(ConfigToken)
}
```

:::tip
For advanced dependency injection topics including injection tokens, factories, and lifecycle management, see the [DI documentation](/docs/di/guides/injection-tokens).
:::

## Attributes

Attributes are custom decorators that attach metadata to controllers or endpoints. Use them for cross-cutting concerns like caching, rate limiting, or feature flags.

```typescript
import { ClassAttribute, AttributeFactory } from '@navios/core'

// Define attribute
const RateLimit = AttributeFactory('RateLimit', z.object({
  requests: z.number(),
  window: z.number(),
}))

// Use on controller or endpoint
@Controller()
@RateLimit({ requests: 100, window: 60 })
class ApiController {
  @Endpoint(getData)
  @RateLimit({ requests: 10, window: 60 })
  async getData() { /* ... */ }
}
```
