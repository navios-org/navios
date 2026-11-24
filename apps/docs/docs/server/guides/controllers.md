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
  params: { ... }      // Query string parameters
  data: { ... }        // Request body
}
```

TypeScript infers the shape from your endpoint definition:

```typescript
@Endpoint(updateUser)
async updateUser(params: EndpointParams<typeof updateUser>) {
  const { userId } = params.urlParams  // From URL
  const { name, email } = params.data  // From body
  const { page } = params.params       // From query string
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

  @Endpoint(archiveUser)
  @HttpCode(202)
  async archiveUser(params: EndpointParams<typeof archiveUser>) {
    return this.userService.archive(params.urlParams.userId)
  }
}
```

Without `@HttpCode()`, an endpoint answers `200`, or `204` if it has [no response body](#endpoints-without-a-response-body).

An endpoint whose status depends on the outcome declares [a response per status](#endpoints-with-a-response-per-status) instead.

## Endpoints Without a Response Body

Declare the endpoint with `response: 'void'` when there is nothing to return. It needs no `responseSchema`:

```typescript
export const deleteUser = API.declareEndpoint({
  method: 'DELETE',
  url: '/users/$userId',
  response: 'void',
})
```

Attach it with `@Endpoint()` like any other endpoint. The method returns nothing:

```typescript
@Controller()
class UserController {
  @Endpoint(deleteUser)
  async deleteUser(params: EndpointParams<typeof deleteUser>) {
    await this.userService.delete(params.urlParams.userId)
  }
}
```

- The server answers **`204 No Content`** with an empty body, on both the Fastify and Bun adapters.
- No response validation runs, and returning a value from the method is a type error (`EndpointResult<typeof deleteUser>` is `Promise<void>`).
- Request validation (`requestSchema`, `querySchema`) works as usual.
- `@HttpCode()` still overrides the status, for example `@HttpCode(202)`, whichever side of `@Endpoint()` it is written on.
- On the client, calling `deleteUser(...)` resolves to `undefined`.

## Endpoints With a Response Per Status

Declare the endpoint with a `responses` map, in place of `responseSchema`, when it answers with different statuses. Each entry is the schema of that status, or `null` for a status without a body:

```typescript
export const putUser = API.declareEndpoint({
  method: 'PUT',
  url: '/users/$userId',
  requestSchema: userInputSchema,
  responses: {
    200: userSchema, // updated
    201: createdSchema, // created
    204: null, // nothing changed
  },
})
```

The method picks the status with `reply(status, body)`:

```typescript
import { Controller, Endpoint, EndpointParams, EndpointResult, reply } from '@navios/core'

@Controller()
class UserController {
  @Endpoint(putUser)
  async putUser(params: EndpointParams<typeof putUser>): EndpointResult<typeof putUser> {
    const result = await this.userService.put(params.urlParams.userId, params.data)

    if (result.unchanged) return reply(204)
    if (result.created) return reply(201, { id: result.user.id })
    return reply(200, result.user)
  }
}
```

- `reply()` is type-checked against the map: an undeclared status, a body that does not fit the schema of its status, a body for a `null` entry, or a plain object returned without `reply()` is a type error. `EndpointResult<typeof putUser>` is the union of the allowed replies.
- The server sends the status passed to `reply()`. The body is validated with the schema of that status, following the `validateResponses` option like `responseSchema` does. A `null` entry is sent with an empty body.
- If the method returns something else at runtime (not a `reply()`, or a status that is not in the map), the server answers `500` and the error names the endpoint.
- `@HttpCode()` cannot be combined with a `responses` map, because the status comes from `reply()`. Using both throws when the controller is defined.
- The legacy decorators (`@navios/core/legacy-compat`) work the same way; `reply` is exported from both `@navios/core` and `@navios/core/legacy-compat`.
- On the client, calling `putUser(...)` resolves to the body of whichever status came back, or `undefined` for a `null` entry.

## Matching Decorators and Declarations

The declaration's `body` and `response` options tell the client how to encode the request and read the reply. The decorator picks how the server parses and answers. The two must agree:

| Decorator      | `body` in the declaration | `response` in the declaration       |
| -------------- | ------------------------- | ----------------------------------- |
| `@Endpoint()`  | omitted or `'json'`       | omitted, `'json'` or `'void'`       |
| `@Multipart()` | `'multipart'`             | omitted, `'json'` or `'void'`       |
| `@Stream()`    | any                       | `'blob'`, `'text'` or `'stream'`    |

`@Endpoint()` and `@Multipart()` differ in the request body only. On the response side both accept the same three declarations: a `responseSchema`, `response: 'void'` (204 with no body, unless `@HttpCode()` sets another status), or a per-status `responses` map answered with `reply(status, body)`. A `responses` map is not served by `@Stream()`, is not combined with `response: 'void'`, and cannot be used together with `@HttpCode()`.

`@Multipart()` does not serve `response: 'blob'`, `'text'` or `'stream'`.

A mismatch is caught twice:

- **At compile time**: the decorator does not accept the declaration.
- **At startup**: applying the decorator throws, for code that bypasses the types.

```typescript
const uploadAvatar = API.declareEndpoint({
  method: 'POST',
  url: '/users/$userId/avatar',
  // body: 'multipart' is missing
  requestSchema: z.object({ file: z.instanceof(File) }),
  responseSchema: z.object({ url: z.string() }),
})

@Controller()
class UserController {
  // Type error, and at startup:
  // [Navios] @Multipart cannot serve POST /users/$userId/avatar: the endpoint is declared
  // without a body option (so body: 'json'), but @Multipart needs body: 'multipart'.
  // Change the declaration or use @Endpoint.
  @Multipart(uploadAvatar)
  async uploadAvatar(params: MultipartParams<typeof uploadAvatar>) {
    // ...
  }
}
```

The server decorators also require **Zod schemas**. `@navios/builder` accepts any [Standard Schema](https://standardschema.dev) on the client, but the server adapters and OpenAPI generation read Zod schemas directly, so a declaration with a non-Zod schema is rejected by the decorators at compile time.

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
