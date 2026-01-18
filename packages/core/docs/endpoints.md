# Endpoints

Endpoints in Navios are HTTP routes defined as methods in controllers. They are decorated with the `@Endpoint()` decorator and specify how to handle incoming HTTP requests.

## What is an Endpoint?

An endpoint is a controller method that handles a specific HTTP request. It defines:

- HTTP method (GET, POST, PUT, DELETE, etc.)
- URL pattern with optional parameters
- Request/response schemas for validation
- Business logic to process the request

## Creating Endpoints

### Basic Endpoint

First, define your endpoint using `@navios/builder`:

```typescript
// api/users.ts
import { builder } from '@navios/builder'

import { z } from 'zod'

const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
})

export const api = builder()

export const getUsersEndpoint = api.declareEndpoint({
  method: 'GET',
  url: '/users',
  responseSchema: z.array(UserSchema),
})
```

Then use it in your controller:

```typescript
import type { EndpointParams } from '@navios/core'

import { Controller, Endpoint } from '@navios/core'

import { getUsersEndpoint } from '../api/users.js'

// controllers/user.controller.ts

@Controller()
export class UserController {
  @Endpoint(getUsersEndpoint)
  async getUsers(params: EndpointParams<typeof getUsersEndpoint>) {
    return [
      { id: '1', name: 'John', email: 'john@example.com' },
      { id: '2', name: 'Jane', email: 'jane@example.com' },
    ]
  }
}
```

> **Note**: Always use `@navios/builder` to declare endpoints instead of passing configuration objects directly to `@Endpoint()`. This ensures type safety and better maintainability.

### Endpoint with Path Parameters

Define the endpoint with path parameters:

```typescript
// api/users.ts
export const getUserByIdEndpoint = api.declareEndpoint({
  method: 'GET',
  url: '/users/$id',
  responseSchema: UserSchema,
})
```

Use it in your controller:

```typescript
@Controller()
export class UserController {
  @Endpoint(getUserByIdEndpoint)
  async getUserById(params: EndpointParams<typeof getUserByIdEndpoint>) {
    // params.id is automatically extracted from the URL
    return { id: params.id, name: 'John', email: 'john@example.com' }
  }
}
```

### Endpoint with Query Parameters

Define the endpoint with query parameters:

```typescript
// api/users.ts
const QuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  search: z.string().optional(),
})

export const getUsersWithQueryEndpoint = api.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: QuerySchema,
  responseSchema: z.array(UserSchema),
})
```

Use it in your controller:

```typescript
@Controller()
export class UserController {
  @Endpoint(getUsersWithQueryEndpoint)
  async getUsers(params: EndpointParams<typeof getUsersWithQueryEndpoint>) {
    // query parameters are validated and typed
    const { page, limit, search } = params.query
    return this.userService.findMany({ page, limit, search })
  }
}
```

### Endpoint with Request Body

Define the endpoint with request body:

```typescript
// api/users.ts
const CreateUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  age: z.number().min(0).max(120),
})

export const createUserEndpoint = api.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema: CreateUserSchema,
  responseSchema: UserSchema,
})
```

Use it in your controller:

```typescript
@Controller()
export class UserController {
  @Endpoint(createUserEndpoint)
  async createUser(params: EndpointParams<typeof createUserEndpoint>) {
    // body is validated against CreateUserSchema
    return this.userService.create(params.data)
  }
}
```

## Endpoint Configuration

### Using `@navios/builder` (Recommended)

The `@Endpoint()` decorator should receive an endpoint definition created with `@navios/builder`. This approach provides better type safety and maintainability:

```typescript
import { builder } from '@navios/builder'

import { z } from 'zod'

export const api = builder()

export const myEndpoint = api.declareEndpoint({
  method: 'GET', // 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'
  url: '/users/$id', // URL pattern with url parameters
  responseSchema: z.object({
    id: z.string(),
    name: z.string(),
  }),
  requestSchema: z.object({
    // Optional: for POST/PUT/PATCH
    name: z.string(),
    email: z.string().email(),
  }),
  querySchema: z.object({
    // Optional: for query parameters
    page: z.coerce.number().default(1),
    search: z.string().optional(),
  }),
})
```

### Endpoint Definition Properties

When using `api.declareEndpoint()`, you can specify:

#### `method` (required)

- **Type**: `HttpMethod` ('GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS')
- **Description**: HTTP method for the endpoint

#### `url` (required)

- **Type**: `string`
- **Description**: URL pattern with optional parameters (`:param`)
- **Examples**:
  - `'/users'` - Simple path
  - `'/users/$id'` - With parameter
  - `'/users/$id/posts/$postId'` - Multiple parameters

#### `responseSchema`

- **Type**: `ZodType`
- **Description**: Zod schema for response validation and type inference

#### `requestSchema`

- **Type**: `ZodType`
- **Description**: Zod schema for request body validation (POST/PUT/PATCH)

#### `querySchema`

- **Type**: `ZodType`
- **Description**: Zod schema for query parameter validation

Use `@navios/builder` instead for better developer experience and type safety.

## Endpoint Parameters

Endpoint methods receive a single parameter object with the following properties:

### `params`

URL path parameters extracted from the route:

```typescript
// URL: /users/$id
params: EndpointParams<typeof getUserByIdEndpoint> = {
  params: { id: string },
}

// URL: /users/$userId/posts/$postId
params: EndpointParams<typeof getPostEndpoint> = {
  params: { userId: string, postId: string },
}
```

### `query`

Query parameters from the URL:

```typescript
// URL: /users?page=1&search=john
params: EndpointParams<typeof getUsersEndpoint> = {
  query: { page: number, search: string },
}
```

### `data`

Request body for POST/PUT/PATCH requests:

```typescript
// POST /users with JSON body
params: EndpointParams<typeof createUserEndpoint> = {
  data: { name: string, email: string },
}
```

## Type Safety

Navios provides full type safety for endpoints through TypeScript and Zod:

```typescript
const UserParamsSchema = z.object({
  id: z.string().uuid(),
})

const UpdateUserSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
})

@Controller()
export class UserController {
  @Endpoint(updateUserEndpoint)
  async updateUser({
    params,
    body,
  }: {
    params: z.infer<typeof UserParamsSchema>
    body: z.infer<typeof UpdateUserSchema>
  }) {
    // params and body are fully typed
    return this.userService.update(params.id, body)
  }
}
```

## HTTP Status Codes

### Default Status Codes

Navios automatically sets appropriate status codes:

- `GET` requests: `200 OK`
- `POST` requests: `201 Created`
- `PUT`/`PATCH` requests: `200 OK`
- `DELETE` requests: `204 No Content`

### Custom Status Codes

Use the `@HttpCode()` decorator to set custom status codes:

```typescript
import { HttpCode } from '@navios/core'

@Controller()
export class UserController {
  @Endpoint(createUserEndpoint)
  @HttpCode(202) // Accepted
  async verifyUser({ body }: { body: { token: string } }) {
    await this.userService.verify(body.token)
    return { message: 'Verification started' }
  }
}
```

## Headers

### Reading Headers

Access request headers through the headers parameter:

```typescript
@Controller()
export class UserController {
  @Endpoint(getProfileEndpoint)
  async getProfile({ headers }: { headers: Record<string, string> }) {
    const authorization = headers.authorization
    const userId = this.authService.getUserIdFromToken(authorization)
    return this.userService.findById(userId)
  }
}
```

### Setting Response Headers

Use the `@Header()` decorator to set response headers:

```typescript
import { Header } from '@navios/core'

@Controller()
export class UserController {
  @Endpoint(usersExportEndpoint)
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="users.csv"')
  async exportUsers() {
    return this.userService.exportToCsv()
  }
}
```

## Guards on Endpoints

Apply guards to specific endpoints:

```typescript
import { UseGuards } from '@navios/core'

@Controller()
export class UserController {
  @Endpoint(deleteUserEndpoint)
  @UseGuards([AuthGuard, AdminGuard])
  async deleteUser({ params }: { params: { id: string } }) {
    return this.userService.delete(params.id)
  }
}
```

## File Uploads

Handle file uploads with multipart support:

```typescript
import { Multipart } from '@navios/core'

@Controller()
export class UserController {
  @Multipart(uploadAvatarEndpoint)
  async uploadAvatar({ params, files }: { params: { id: string }; files: { avatar: File } }) {
    const avatarUrl = await this.storageService.upload(files.avatar)
    return this.userService.updateAvatar(params.id, avatarUrl)
  }
}
```

## Streaming Responses

Stream large responses:

```typescript
import { Stream } from '@navios/core'

@Controller()
export class UserController {
  @Stream(exportUsersEndpoint)
  async exportUsers() {
    // Return a readable stream
    return this.userService.createExportStream()
  }
}
```

## Error Handling

Endpoints can throw HTTP exceptions:

```typescript
import { BadRequestException, NotFoundException } from '@navios/core'

@Controller()
export class UserController {
  @Endpoint(getUserByIdEndpoint)
  async getUserById({ params }: { params: { id: string } }) {
    if (!params.id) {
      throw new BadRequestException('User ID is required')
    }

    const user = await this.userService.findById(params.id)
    if (!user) {
      throw new NotFoundException(`User with ID ${params.id} not found`)
    }

    return user
  }
}
```
