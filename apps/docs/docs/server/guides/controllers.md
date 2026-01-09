---
sidebar_position: 2
title: Controllers & Endpoints
---

# Controllers & Endpoints

Controllers handle incoming HTTP requests. Endpoints define the routes and schemas for each operation.

## What are Controllers?

Controllers are classes that organize related HTTP handlers. They're decorated with `@Controller()` and contain endpoint methods.

**Key characteristics:**

- Group related endpoints together (e.g., all user operations)
- Use dependency injection to access services
- Handle HTTP concerns (status codes, headers)
- Delegate business logic to services

## Defining Controllers

```typescript
import { Controller, Endpoint, EndpointParams, HttpCode } from '@navios/core'
import { inject } from '@navios/di'

@Controller()
class UserController {
  private userService = inject(UserService)

  @Endpoint(getUser)
  async getUser(params: EndpointParams<typeof getUser>) {
    return this.userService.findById(params.urlParams.userId)
  }

  @Endpoint(createUser)
  @HttpCode(201)
  async createUser(params: EndpointParams<typeof createUser>) {
    return this.userService.create(params.data)
  }
}
```

## Defining Endpoints

Endpoints are defined using `@navios/builder` and attached to methods with `@Endpoint()`:

```typescript
import { builder } from '@navios/builder'

import { z } from 'zod'

const API = builder()

export const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: z.object({
    id: z.string(),
    name: z.string(),
  }),
})

export const createUser = API.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema: z.object({
    name: z.string(),
    email: z.string().email(),
  }),
  responseSchema: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
  }),
})
```

For complete endpoint definition syntax including URL parameters, query parameters, headers, and advanced options, see the [Builder documentation](/docs/builder/guides/defining-endpoints).

## EndpointParams

The `EndpointParams` type provides typed access to all request data:

```typescript
interface EndpointParams<T> {
  urlParams: { ... }   // URL path parameters (e.g., /users/$userId)
  query: { ... }       // Query string parameters
  data: { ... }        // Request body
}
```

TypeScript infers the shape from your endpoint definition:

```typescript
@Endpoint(updateUser)
async updateUser(params: EndpointParams<typeof updateUser>) {
  const { userId } = params.urlParams  // From URL
  const { name, email } = params.data  // From body
  const { page } = params.query        // From query string
}
```

## Response Status Codes

Set custom status codes with `@HttpCode()`:

```typescript
import { HttpCode } from '@navios/core'

@Controller()
class UserController {
  @Endpoint(createUser)
  @HttpCode(201)
  async createUser(params: EndpointParams<typeof createUser>) {
    return this.userService.create(params.data)
  }

  @Endpoint(deleteUser)
  @HttpCode(204)
  async deleteUser(params: EndpointParams<typeof deleteUser>) {
    await this.userService.delete(params.urlParams.userId)
  }
}
```

## Response Headers

Set custom headers with `@Header()`:

```typescript
import { Header } from '@navios/core'

@Controller()
class ApiController {
  @Endpoint(getData)
  @Header('Cache-Control', 'max-age=3600')
  @Header('X-Custom-Header', 'value')
  async getData() {
    return { data: 'cached' }
  }
}
```

## Dependency Injection

Controllers typically inject services to handle business logic:

```typescript
import { Logger } from '@navios/core'
import { inject } from '@navios/di'

@Controller()
class UserController {
  private userService = inject(UserService)
  private logger = inject(Logger, { context: 'UserController' })

  @Endpoint(getUser)
  async getUser(params: EndpointParams<typeof getUser>) {
    this.logger.log(`Fetching user ${params.urlParams.userId}`)
    return this.userService.findById(params.urlParams.userId)
  }
}
```

For more on dependency injection, see the [Services guide](/docs/server/guides/services).

## Best Practices

**Keep controllers thin**: Delegate business logic to services. Controllers handle HTTP concerns only.

```typescript
// Good - controller delegates to service
@Endpoint(getUser)
async getUser(params: EndpointParams<typeof getUser>) {
  return this.userService.findById(params.urlParams.userId)
}

// Avoid - business logic in controller
@Endpoint(getUser)
async getUser(params: EndpointParams<typeof getUser>) {
  const user = await this.db.users.findUnique({ where: { id: params.urlParams.userId } })
  if (!user) throw new NotFoundException()
  return user
}
```

**Group related endpoints**: All user operations in `UserController`, all order operations in `OrderController`.

**Use type-safe endpoints**: Always use Builder for endpoint definitions. It provides compile-time safety and runtime validation.
