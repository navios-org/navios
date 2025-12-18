# Legacy-Compatible Decorators

Navios provides a legacy-compatible decorator API for projects that cannot use Stage 3 decorators (the standard decorator proposal). These decorators use the TypeScript experimental decorator API and convert the arguments to Stage 3 format internally.

## Overview

The legacy-compat decorators are located in `@navios/core/legacy-compat` and provide the same functionality as the standard decorators, but with compatibility for TypeScript's experimental decorator system.

## When to Use Legacy-Compatible Decorators

Use legacy-compatible decorators if:

- Your project uses TypeScript with `experimentalDecorators` enabled
- You cannot migrate to Stage 3 decorators due to tooling or compatibility constraints
- You need to maintain compatibility with older TypeScript versions or build tools

## Installation and Setup

No additional installation is required. The legacy-compat decorators are included in `@navios/core`.

To use legacy-compatible decorators, import them from the `legacy-compat` subpath:

```typescript
import { Module, Controller, Endpoint, UseGuards, Header, HttpCode, Multipart, Stream } from '@navios/core/legacy-compat'
```

## Available Decorators

All standard Navios decorators are available in legacy-compatible form:

### Class Decorators

#### `@Module(options?)`

Defines an application module. Can be applied to classes.

```typescript
import { Module } from '@navios/core/legacy-compat'

@Module({
  controllers: [UserController, AuthController],
  imports: [DatabaseModule],
  guards: [AuthGuard],
})
export class AppModule {}
```

#### `@Controller(options?)`

Defines a request controller. Can be applied to classes.

```typescript
import { Controller } from '@navios/core/legacy-compat'

@Controller({ guards: [AuthGuard] })
export class UserController {
  // ...
}
```

### Method Decorators

#### `@Endpoint(endpoint)`

Defines an HTTP endpoint with type-safe request/response schemas. Must be applied to methods.

```typescript
import { Controller, Endpoint, type EndpointParams, type EndpointResult } from '@navios/core/legacy-compat'

@Controller()
export class UserController {
  @Endpoint(getUserEndpoint)
  async getUser(request: EndpointParams<typeof getUserEndpoint>): Promise<EndpointResult<typeof getUserEndpoint>> {
    const { id } = request
    return { id, name: 'John Doe' }
  }
}
```

#### `@Multipart(endpoint)`

Defines a multipart/form-data endpoint for file uploads. Must be applied to methods.

```typescript
import { Controller, Multipart, type MultipartParams, type MultipartResult } from '@navios/core/legacy-compat'

@Controller()
export class FileController {
  @Multipart(uploadFileEndpoint)
  async uploadFile(request: MultipartParams<typeof uploadFileEndpoint>): Promise<MultipartResult<typeof uploadFileEndpoint>> {
    const { file } = request.data
    return { url: 'https://example.com/file.jpg' }
  }
}
```

#### `@Stream(endpoint)`

Defines a streaming endpoint. Must be applied to methods.

```typescript
import { Controller, Stream, type StreamParams } from '@navios/core/legacy-compat'

@Controller()
export class FileController {
  @Stream(downloadFileEndpoint)
  async downloadFile(request: StreamParams<typeof downloadFileEndpoint>, reply: any): Promise<void> {
    const { fileId } = request.urlParams
    // Stream file data to reply
  }
}
```

#### `@UseGuards(...guards)`

Applies guards to controllers or endpoints. Can be applied to classes or methods.

```typescript
import { Controller, Endpoint, UseGuards } from '@navios/core/legacy-compat'

// Apply to a controller
@Controller()
@UseGuards(AuthGuard, RoleGuard)
export class UserController {
  // All endpoints in this controller will use AuthGuard and RoleGuard
}

// Apply to a specific endpoint
@Controller()
export class UserController {
  @Endpoint(getUserEndpoint)
  @UseGuards(AuthGuard)
  async getUser() {
    // Only this endpoint uses AuthGuard
  }
}
```

#### `@Header(name, value)`

Sets custom response headers. Must be applied to methods.

```typescript
import { Controller, Endpoint, Header } from '@navios/core/legacy-compat'

@Controller()
export class UserController {
  @Endpoint(getUserEndpoint)
  @Header('Cache-Control', 'max-age=3600')
  async getUser() {
    return { id: '1', name: 'John' }
  }
}
```

#### `@HttpCode(code)`

Sets a custom HTTP status code for the response. Must be applied to methods.

```typescript
import { Controller, Endpoint, HttpCode } from '@navios/core/legacy-compat'

@Controller()
export class UserController {
  @Endpoint(createUserEndpoint)
  @HttpCode(201)
  async createUser() {
    return { id: '1', name: 'John' }
  }
}
```

## Type Utilities

The legacy-compat module also exports type utilities for working with endpoints:

```typescript
import type {
  ModuleOptions,
  ControllerOptions,
  EndpointParams,
  EndpointResult,
  MultipartParams,
  MultipartResult,
  StreamParams,
} from '@navios/core/legacy-compat'
```

## Complete Example

Here's a complete example using legacy-compatible decorators:

```typescript
import { builder } from '@navios/builder'
import { Module, Controller, Endpoint, UseGuards, HttpCode, type EndpointParams, type EndpointResult } from '@navios/core/legacy-compat'
import { Injectable, syncInject } from '@navios/core'
import { z } from 'zod/v4'

// Define API endpoints
const api = builder()

const getUserEndpoint = api.declareEndpoint({
  method: 'get',
  url: '/users/:id',
  responseSchema: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
  }),
})

const createUserEndpoint = api.declareEndpoint({
  method: 'post',
  url: '/users',
  requestSchema: z.object({
    name: z.string(),
    email: z.string().email(),
  }),
  responseSchema: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
  }),
})

// Service
@Injectable()
export class UserService {
  async findById(id: string) {
    // Implementation
  }

  async create(data: { name: string; email: string }) {
    // Implementation
  }
}

// Controller
@Controller()
@UseGuards(AuthGuard)
export class UserController {
  userService = syncInject(UserService)

  @Endpoint(getUserEndpoint)
  async getUser(request: EndpointParams<typeof getUserEndpoint>): Promise<EndpointResult<typeof getUserEndpoint>> {
    const { id } = request.urlParams
    return await this.userService.findById(id)
  }

  @Endpoint(createUserEndpoint)
  @HttpCode(201)
  async createUser(request: EndpointParams<typeof createUserEndpoint>): Promise<EndpointResult<typeof createUserEndpoint>> {
    const { name, email } = request.body
    return await this.userService.create({ name, email })
  }
}

// Module
@Module({
  controllers: [UserController],
})
export class AppModule {}
```

## Migration from Standard Decorators

If you're migrating from standard decorators to legacy-compatible decorators:

1. Update your imports to use the `legacy-compat` subpath:

```typescript
// Before
import { Module, Controller, Endpoint } from '@navios/core'

// After
import { Module, Controller, Endpoint } from '@navios/core/legacy-compat'
```

2. Ensure your `tsconfig.json` has `experimentalDecorators` enabled:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true
  }
}
```

3. The decorator usage remains the same - no changes to how you apply them.

## Differences from Standard Decorators

The legacy-compatible decorators:

- Use TypeScript's experimental decorator API instead of Stage 3 decorators
- Convert decorator arguments internally to work with the standard Navios implementation
- Provide the same functionality and type safety as standard decorators
- May have slightly different type inference behavior in some edge cases

## TypeScript Configuration

To use legacy-compatible decorators, ensure your `tsconfig.json` includes:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

The `emitDecoratorMetadata` option is optional but recommended for better runtime behavior with dependency injection.

## Notes

- Legacy-compatible decorators are fully compatible with all Navios features including guards, attributes, dependency injection, and adapters
- You can mix legacy-compatible decorators with standard decorators in the same project, but it's recommended to use one approach consistently
- The legacy-compat module is maintained alongside the standard decorators and receives the same updates and bug fixes

