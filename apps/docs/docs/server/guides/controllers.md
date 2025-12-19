---
sidebar_position: 2
title: Controllers & Endpoints
---

# Controllers & Endpoints

Controllers handle incoming HTTP requests and endpoints define the routes and schemas for each operation.

## Defining Controllers

Use the `@Controller()` decorator to define a controller:

```typescript
import { Controller, Endpoint, EndpointParams } from '@navios/core'

@Controller()
class UserController {
  @Endpoint(getUser)
  async getUser(params: EndpointParams<typeof getUser>) {
    return { id: params.urlParams.userId, name: 'John' }
  }
}
```

## Defining Endpoints

Endpoints are defined using `@navios/builder` and attached to methods with `@Endpoint()`:

```typescript
import { builder } from '@navios/builder'
import { z } from 'zod'

const API = builder()

// GET endpoint
export const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: z.object({
    id: z.string(),
    name: z.string(),
  }),
})

// POST endpoint
export const createUser = API.declareEndpoint({
  method: 'POST',
  url: '/users',
  dataSchema: z.object({
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

:::tip
For comprehensive information about defining endpoints with Builder, including URL parameters, query parameters, and advanced features, see the [Builder documentation](/docs/builder/guides/defining-endpoints).
:::

## EndpointParams

The `EndpointParams` type provides typed access to all request data:

```typescript
interface EndpointParams<T> {
  urlParams: { ... }   // URL path parameters
  query: { ... }       // Query string parameters
  data: { ... }        // Request body
  headers: { ... }     // Request headers
}
```

Example usage:

```typescript
@Endpoint(updateUser)
async updateUser(params: EndpointParams<typeof updateUser>) {
  const { userId } = params.urlParams    // From URL: /users/$userId
  const { name, email } = params.data    // From request body
  const { page } = params.query          // From query string
}
```

## HTTP Methods

Navios supports all standard HTTP methods:

```typescript
// GET
const listUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  responseSchema: z.array(userSchema),
})

// POST
const createUser = API.declareEndpoint({
  method: 'POST',
  url: '/users',
  dataSchema: createUserSchema,
  responseSchema: userSchema,
})

// PUT
const updateUser = API.declareEndpoint({
  method: 'PUT',
  url: '/users/$userId',
  dataSchema: updateUserSchema,
  responseSchema: userSchema,
})

// PATCH
const patchUser = API.declareEndpoint({
  method: 'PATCH',
  url: '/users/$userId',
  dataSchema: patchUserSchema,
  responseSchema: userSchema,
})

// DELETE
const deleteUser = API.declareEndpoint({
  method: 'DELETE',
  url: '/users/$userId',
  responseSchema: z.object({ success: z.boolean() }),
})
```

## URL Parameters

Define dynamic URL segments with the `$` prefix:

```typescript
const getOrder = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId/orders/$orderId',
  responseSchema: orderSchema,
})

@Endpoint(getOrder)
async getOrder(params: EndpointParams<typeof getOrder>) {
  const { userId, orderId } = params.urlParams
}
```

## Query Parameters

Define query schemas for filtering and pagination:

```typescript
const listUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    page: z.coerce.number().default(1),
    limit: z.coerce.number().default(10),
    sort: z.enum(['name', 'created']).default('created'),
    search: z.string().optional(),
  }),
  responseSchema: z.array(userSchema),
})

@Endpoint(listUsers)
async listUsers(params: EndpointParams<typeof listUsers>) {
  const { page, limit, sort, search } = params.query
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

## Dependency Injection in Controllers

Use `inject()` to access services:

```typescript
import { inject } from '@navios/di'
import { Logger } from '@navios/core'

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

:::tip
For more details on using services and dependency injection, see the [Services & Dependency Injection guide](/docs/server/guides/services). For advanced DI topics, see the [DI documentation](/docs/di).
:::

## Multiple Endpoints per Controller

Controllers can have multiple endpoints:

```typescript
@Controller()
class UserController {
  private userService = inject(UserService)

  @Endpoint(listUsers)
  async listUsers(params: EndpointParams<typeof listUsers>) {
    return this.userService.findAll(params.query)
  }

  @Endpoint(getUser)
  async getUser(params: EndpointParams<typeof getUser>) {
    return this.userService.findById(params.urlParams.userId)
  }

  @Endpoint(createUser)
  @HttpCode(201)
  async createUser(params: EndpointParams<typeof createUser>) {
    return this.userService.create(params.data)
  }

  @Endpoint(updateUser)
  async updateUser(params: EndpointParams<typeof updateUser>) {
    return this.userService.update(params.urlParams.userId, params.data)
  }

  @Endpoint(deleteUser)
  @HttpCode(204)
  async deleteUser(params: EndpointParams<typeof deleteUser>) {
    await this.userService.delete(params.urlParams.userId)
  }
}
```
