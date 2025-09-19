# Controllers

Controllers in Navios are classes that handle HTTP requests and define your API endpoints. They are decorated with the `@Controller()` decorator and contain methods decorated with endpoint decorators like `@Endpoint()`.

## What is a Controller?

A controller is a TypeScript class that groups related request handling logic. Each controller method represents an HTTP endpoint and defines how to process incoming requests and generate responses.

## Creating a Controller

### Basic Controller

```typescript
import { Controller } from '@navios/core'

@Controller()
export class UserController {
  // Controller methods go here
}
```

### Controller with Guards

```typescript
import { Controller } from '@navios/core'

import { AuthGuard } from './auth.guard'

@Controller({
  guards: [AuthGuard], // Applied to all endpoints in this controller
})
export class UserController {
  // All methods will require authentication
}
```

## Controller Options

The `@Controller()` decorator accepts the following options:

### `guards`

- **Type**: `ClassType[] | Set<ClassType>`
- **Description**: Array of guard classes that will be applied to all endpoints in this controller
- **Example**:

```typescript
@Controller({
  guards: [AuthGuard, RoleGuard],
})
export class AdminController {}
```

## Controller Lifecycle

Controllers in Navios have a specific lifecycle:

1. **Registration**: Controllers are registered during module loading
2. **Instantiation**: Controller instances are created with request scope by default
3. **Dependency Injection**: Dependencies are injected into the controller
4. **Endpoint Discovery**: Methods decorated with `@Endpoint()` are discovered
5. **Guard Application**: Controller and endpoint-level guards are applied
6. **Request Handling**: Methods are called to handle incoming requests

## Controller Scope

Controllers are registered with **Request Scope** by default, meaning:

- A new instance is created for each HTTP request
- Dependencies are resolved per request
- State is not shared between requests

## Best Practices

### 1. Logical Grouping

Group related endpoints in the same controller:

```typescript
@Controller()
export class UserController {
  // All user-related endpoints
  async getUsers() {
    /* ... */
  }
  async getUserById() {
    /* ... */
  }
  async createUser() {
    /* ... */
  }
  async updateUser() {
    /* ... */
  }
  async deleteUser() {
    /* ... */
  }
}
```

### 2. Use Guards Appropriately

Apply guards at the appropriate level:

```typescript
// Controller-level guards for all endpoints
@Controller({
  guards: [AuthGuard],
})
export class UserController {
  // All methods require authentication

  @Endpoint(deleteUserEndpoint)
  @UseGuards([RoleGuard]) // Additional endpoint-specific guard
  async deleteUser() {
    // Requires both authentication and role check
  }
}
```

### 3. Keep Controllers Thin

Controllers should orchestrate business logic, not implement it:

```typescript
// api/users.ts
import { builder } from '@navios/builder'

import { z } from 'zod'

export const api = builder()

const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
})

export const getUserByIdEndpoint = api.declareEndpoint({
  method: 'GET',
  url: '/users/$id',
  responseSchema: UserSchema,
})
```

```typescript
// controllers/user.controller.ts
import { inject } from '@navios/di'

import { getUserByIdEndpoint } from '../api/users.js'

@Controller()
export class UserController {
  private userService = inject(UserService)

  @Endpoint(getUserByIdEndpoint)
  async getUserById(params: EndpointParams<typeof getUserByIdEndpoint>) {
    // Delegate business logic to service
    return this.userService.findById(params.params.id)
  }
}
```

### 4. Use TypeScript Types

Leverage TypeScript and `@navios/builder` for better type safety:

```typescript
// api/users.ts
import { builder } from '@navios/builder'

import { z } from 'zod'

export const api = builder()

const UserResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
})

export const getUserByIdEndpoint = api.declareEndpoint({
  method: 'GET',
  url: '/users/$id', // $id is automatically typed as string
  responseSchema: UserResponseSchema,
})
```

```typescript
// controllers/user.controller.ts
@Controller()
export class UserController {
  @Endpoint(getUserByIdEndpoint)
  async getUserById(params: EndpointParams<typeof getUserByIdEndpoint>) {
    // params is properly typed with full intellisense
    // params.params.id is string (from URL parameter)
    return { id: params.params.id, name: 'John', email: 'john@example.com' }
  }
}
```

## Dependency Injection in Controllers

Controllers support full dependency injection:

```typescript
import { Controller } from '@navios/core'
import { inject } from '@navios/di'

@Controller()
export class UserController {
  // Inject services
  private userService = inject(UserService)
  private logger = inject(Logger, { context: 'UserController' })

  @Endpoint(createUserEndpoint)
  async createUser({ body }: { body: CreateUserDto }) {
    this.logger.debug('Creating new user')
    return this.userService.create(body)
  }
}
```

## Error Handling in Controllers

Controllers can throw HTTP exceptions that are automatically handled:

```typescript
import { BadRequestException, NotFoundException } from '@navios/core'

@Controller()
export class UserController {
  private userService = inject(UserService)

  @Endpoint(getUserByIdEndpoint)
  async getUserById({ params }: { params: { id: string } }) {
    if (!params.id) {
      throw new BadRequestException('User ID is required')
    }

    const user = await this.userService.findById(params.id)
    if (!user) {
      throw new NotFoundException('User not found')
    }

    return user
  }
}
```

## Controller Metadata

Each controller decorated with `@Controller()` has associated metadata:

```typescript
export interface ControllerMetadata {
  guards: Set<ClassType>
  attributes: Map<symbol, unknown>
}
```

This metadata is used internally by Navios to:

- Apply guards to all controller endpoints
- Store custom attributes
- Manage controller lifecycle

## Advanced Patterns

### Resource Controllers

Create controllers that follow REST conventions using `@navios/builder`:

```typescript
// api/users.ts
import { builder } from '@navios/builder'

import { z } from 'zod'

export const api = builder()

const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
})

const CreateUserSchema = z.object({
  name: z.string(),
  email: z.string(),
})

const UpdateUserSchema = CreateUserSchema.partial()

export const getAllUsersEndpoint = api.declareEndpoint({
  method: 'GET',
  url: '/users',
  responseSchema: z.array(UserSchema),
})

export const getUserByIdEndpoint = api.declareEndpoint({
  method: 'GET',
  url: '/users/$id',
  responseSchema: UserSchema,
})

export const createUserEndpoint = api.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema: CreateUserSchema,
  responseSchema: UserSchema,
})

export const updateUserEndpoint = api.declareEndpoint({
  method: 'PUT',
  url: '/users/$id',
  requestSchema: UpdateUserSchema,
  responseSchema: UserSchema,
})

export const deleteUserEndpoint = api.declareEndpoint({
  method: 'DELETE',
  url: '/users/$id',
  responseSchema: z.object({ success: z.boolean() }),
})
```

```typescript
// controllers/user.controller.ts
import type { EndpointParams } from '@navios/core'

import { Controller, Endpoint } from '@navios/core'
import { inject } from '@navios/di'

import {
  createUserEndpoint,
  deleteUserEndpoint,
  getAllUsersEndpoint,
  getUserByIdEndpoint,
  updateUserEndpoint,
} from '../api/users.js'

@Controller()
export class UserController {
  private userService = inject(UserService)

  @Endpoint(getAllUsersEndpoint)
  async index(params: EndpointParams<typeof getAllUsersEndpoint>) {
    return this.userService.findAll()
  }

  @Endpoint(getUserByIdEndpoint)
  async show(params: EndpointParams<typeof getUserByIdEndpoint>) {
    return this.userService.findById(params.params.id)
  }

  @Endpoint(createUserEndpoint)
  async create(params: EndpointParams<typeof createUserEndpoint>) {
    return this.userService.create(params.data)
  }

  @Endpoint(updateUserEndpoint)
  async update(params: EndpointParams<typeof updateUserEndpoint>) {
    return this.userService.update(params.params.id, params.data)
  }

  @Endpoint(deleteUserEndpoint)
  async destroy(params: EndpointParams<typeof deleteUserEndpoint>) {
    await this.userService.delete(params.params.id)
    return { success: true }
  }
}
```
