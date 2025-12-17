# @navios/core Specification

## Overview

`@navios/core` is the foundation framework for building HTTP servers with Navios. It provides a decorator-based architecture for defining modules, controllers, and endpoints with full TypeScript support, Zod schema validation, and pluggable HTTP adapters.

**Package:** `@navios/core`
**Version:** 0.6.0
**License:** MIT
**Dependencies:** `@navios/di`, `zod`

## Core Concepts

### Architecture Overview

```
Application
├── Module (root)
│   ├── Controllers
│   │   ├── Endpoints
│   │   └── Attributes (custom metadata)
│   ├── Guards
│   ├── Attributes (custom metadata)
│   └── Imported Modules
│       └── (recursive)
```

### Key Principles

- **Decorator-Based** - Use decorators for metadata definition
- **Type-Safe** - Full TypeScript integration with Zod schemas
- **Modular** - Organize code into modules with clear boundaries
- **Adapter-Agnostic** - Support multiple HTTP runtimes (Fastify, Bun)
- **DI-Powered** - Built on `@navios/di` for dependency injection
- **Extensible via Attributes** - Custom metadata decorators for cross-cutting concerns

---

## Application Setup

### NaviosFactory

Creates and configures Navios applications.

```typescript
import { NaviosFactory } from '@navios/core'
import { defineFastifyEnvironment } from '@navios/adapter-fastify'

const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
  logger: ['log', 'error', 'warn'],
})

await app.listen({ port: 3000 })
```

#### NaviosFactory.create(module, options)

| Parameter | Type | Description |
|-----------|------|-------------|
| `module` | `Class` | Root application module |
| `options` | `NaviosApplicationOptions` | Application configuration |

#### NaviosApplicationOptions

```typescript
interface NaviosApplicationOptions {
  adapter: NaviosEnvironmentOptions | NaviosEnvironmentOptions[]
  logger?: LoggerService | LogLevel[] | false
}
```

### NaviosApplication

The main application instance with lifecycle methods.

```typescript
const app = await NaviosFactory.create(AppModule, options)

// Configure
app.setGlobalPrefix('/api/v1')
app.enableCors({
  origin: ['http://localhost:3000'],
  credentials: true,
})
app.enableMultipart({ limits: { fileSize: 10 * 1024 * 1024 } })

// Start
const address = await app.listen({ port: 3000, host: '0.0.0.0' })
console.log(`Server running at ${address}`)

// Access underlying server
const server = app.getServer()

// Shutdown
await app.dispose()
```

#### Methods

| Method | Return | Description |
|--------|--------|-------------|
| `setGlobalPrefix(prefix)` | `void` | Add path prefix to all routes |
| `enableCors(options)` | `void` | Configure CORS headers |
| `enableMultipart(options)` | `void` | Enable multipart form handling |
| `listen(options)` | `Promise<string>` | Start the HTTP server |
| `getServer()` | `ServerInstance` | Get underlying server |
| `dispose()` | `Promise<void>` | Cleanup and shutdown |
| `close()` | `Promise<void>` | Alias for dispose |

---

## Decorators

### @Module(options)

Defines a module that groups controllers and imports other modules.

```typescript
import { Module } from '@navios/core'

@Module({
  controllers: [UserController, ProductController],
  imports: [DatabaseModule, AuthModule],
  guards: [AuthGuard],
})
class AppModule {}
```

#### Options

| Property | Type | Description |
|----------|------|-------------|
| `controllers` | `Class[]` | Controller classes for this module |
| `imports` | `Class[]` | Other modules to import |
| `guards` | `Guard[]` | Guards applied to all controllers in module |

#### Module Lifecycle

Modules can implement `OnModuleInit` for initialization logic:

```typescript
@Module({ controllers: [UserController] })
class UserModule {
  async onModuleInit() {
    console.log('UserModule initialized')
  }
}
```

---

### @Controller(options?)

Marks a class as a controller that handles HTTP requests.

```typescript
import { Controller, inject } from '@navios/core'

@Controller()
class UserController {
  private userService = inject(UserService)

  // Endpoint methods...
}

// With guards
@Controller({ guards: [AdminGuard] })
class AdminController {
  // All endpoints require AdminGuard
}
```

#### Options

| Property | Type | Description |
|----------|------|-------------|
| `guards` | `Guard[]` | Guards applied to all endpoints |

**Note:** Controllers are automatically registered with `Request` scope in the DI container.

---

### @Endpoint(config)

Decorates a method as an HTTP endpoint.

Endpoint definitions should be created using `@navios/builder`'s `declareEndpoint` so they can be shared between client and server:

```typescript
// shared/endpoints/users.ts - Shared between client and server
import { builder } from '@navios/builder'
import { z } from 'zod'

const API = builder()

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
})

export const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

export const createUser = API.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema: userSchema.omit({ id: true }),
  responseSchema: userSchema,
})
```

```typescript
// server/controllers/user.controller.ts
import { Controller, Endpoint, EndpointParams } from '@navios/core'
import { getUser, createUser } from '../../shared/endpoints/users'

@Controller()
class UserController {
  @Endpoint(getUser)
  async getUser(params: EndpointParams<typeof getUser>) {
    return {
      id: params.urlParams.userId,
      name: 'John Doe',
    }
  }

  @Endpoint(createUser)
  async createUser(params: EndpointParams<typeof createUser>) {
    return this.userService.create(params.data)
  }
}
```

```typescript
// client/api.ts - Client uses same endpoint definitions
import { getUser, createUser, API } from '../shared/endpoints/users'
import { create } from 'navios'

API.provideClient(create({ baseURL: 'http://localhost:3000' }))

// Type-safe API calls
const user = await getUser({ urlParams: { userId: '123' } })
const newUser = await createUser({ data: { name: 'Jane' } })
```

#### EndpointParams<T>

Type-safe parameter object combining all inputs:

```typescript
type EndpointParams<Config> = {
  urlParams: { [K in ParsedUrlParams<Config['url']>]: string }
  params: z.infer<Config['querySchema']>      // If querySchema defined
  data: z.infer<Config['requestSchema']>      // If requestSchema defined
}
```

---

### @Stream(config)

Decorates a method for streaming responses.

Stream definitions should also be created using `@navios/builder`'s `declareStream`:

```typescript
// shared/endpoints/events.ts
import { builder } from '@navios/builder'

const API = builder()

export const streamEvents = API.declareStream({
  method: 'GET',
  url: '/events',
})
```

```typescript
// server/controllers/event.controller.ts
import { Controller, Stream, StreamParams, Reply } from '@navios/core'
import { streamEvents } from '../../shared/endpoints/events'

@Controller()
class EventController {
  @Stream(streamEvents)
  async streamEvents(
    params: StreamParams<typeof streamEvents>,
    reply: Reply,
  ) {
    reply.headers({ 'Content-Type': 'text/event-stream' })

    for await (const event of this.eventSource) {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
    }

    reply.raw.end()
  }
}
```

**Key Differences from @Endpoint:**
- Receives `reply` object for manual response control
- No automatic response serialization
- Suitable for SSE, file downloads, etc.

---

### @Multipart(config)

Decorates a method for handling multipart form data.

Multipart definitions should be created using `@navios/builder`'s `declareMultipart`:

```typescript
// shared/endpoints/files.ts
import { builder } from '@navios/builder'
import { z } from 'zod'

const API = builder()

export const uploadFile = API.declareMultipart({
  method: 'POST',
  url: '/upload',
  requestSchema: z.object({
    file: z.instanceof(File),
    description: z.string().optional(),
  }),
  responseSchema: z.object({
    fileId: z.string(),
  }),
})
```

```typescript
// server/controllers/upload.controller.ts
import { Controller, Multipart, MultipartParams } from '@navios/core'
import { uploadFile } from '../../shared/endpoints/files'

@Controller()
class UploadController {
  @Multipart(uploadFile)
  async upload(params: MultipartParams<typeof uploadFile>) {
    const file = params.data.file
    const fileId = await this.storage.save(file)
    return { fileId }
  }
}
```

**Features:**
- Automatic FormData parsing
- File object handling
- Array field support

---

### @HttpCode(statusCode)

Sets a custom success status code.

```typescript
@Controller()
class UserController {
  @Endpoint(createUserEndpoint)
  @HttpCode(201)
  async createUser(params) {
    return this.userService.create(params.data)
  }
}
```

---

### @Header(name, value)

Sets a response header.

```typescript
@Controller()
class CacheController {
  @Endpoint(getCachedEndpoint)
  @Header('Cache-Control', 'max-age=3600')
  @Header('X-Custom-Header', 'value')
  async getCached(params) {
    return this.cache.get(params.key)
  }
}
```

---

### @UseGuards(...guards)

Applies guards to a class or method.

```typescript
import { UseGuards } from '@navios/core'

// Class-level
@Controller()
@UseGuards(AuthGuard)
class SecureController {
  // All endpoints require AuthGuard
}

// Method-level
@Controller()
class MixedController {
  @Endpoint(publicEndpoint)
  async publicMethod() {}

  @Endpoint(privateEndpoint)
  @UseGuards(AuthGuard, RoleGuard)
  async privateMethod() {}
}
```

---

## Guards

Guards implement authorization logic before endpoint execution.

### CanActivate Interface

```typescript
interface CanActivate {
  canActivate(context: AbstractExecutionContext): boolean | Promise<boolean>
}
```

### Creating Guards

```typescript
import { Injectable, CanActivate, AbstractExecutionContext } from '@navios/core'

@Injectable()
class AuthGuard implements CanActivate {
  async canActivate(context: AbstractExecutionContext): Promise<boolean> {
    const request = context.getRequest()
    const token = request.headers.authorization

    if (!token) {
      return false
    }

    const user = await this.authService.verify(token)
    request.user = user

    return true
  }
}
```

### Guard Execution Order

Guards execute hierarchically:
1. **Module guards** - Applied first
2. **Controller guards** - Applied second
3. **Endpoint guards** - Applied last

All guards must return `true` for the request to proceed.

### Throwing Exceptions in Guards

```typescript
@Injectable()
class AuthGuard implements CanActivate {
  async canActivate(context: AbstractExecutionContext) {
    const request = context.getRequest()

    if (!request.headers.authorization) {
      throw new UnauthorizedException('Missing authorization header')
    }

    return true
  }
}
```

---

## Execution Context

The `AbstractExecutionContext` provides access to request metadata.

```typescript
interface AbstractExecutionContext {
  getModule(): ModuleMetadata
  getController(): ControllerMetadata
  getHandler(): HandlerMetadata
  getRequest(): any
  getReply(): any
}
```

### Usage in Guards

```typescript
@Injectable()
class RoleGuard implements CanActivate {
  canActivate(context: AbstractExecutionContext): boolean {
    const handler = context.getHandler()
    const requiredRoles = AttributeFactory.get(RolesAttribute, handler)

    const request = context.getRequest()
    const userRoles = request.user?.roles || []

    return requiredRoles.some(role => userRoles.includes(role))
  }
}
```

---

## HTTP Exceptions

Built-in exception classes for common HTTP errors.

### Base Exception

```typescript
class HttpException extends Error {
  constructor(
    response: string | Record<string, any>,
    statusCode: number,
  )

  get response(): any
  get statusCode(): number
}
```

### Built-in Exceptions

| Class | Status Code |
|-------|-------------|
| `BadRequestException` | 400 |
| `UnauthorizedException` | 401 |
| `ForbiddenException` | 403 |
| `NotFoundException` | 404 |
| `ConflictException` | 409 |
| `InternalServerErrorException` | 500 |

### Usage

```typescript
import { NotFoundException, BadRequestException } from '@navios/core'

@Controller()
class UserController {
  @Endpoint(getUserEndpoint)
  async getUser(params) {
    const user = await this.userService.findById(params.urlParams.userId)

    if (!user) {
      throw new NotFoundException('User not found')
    }

    return user
  }

  @Endpoint(createUserEndpoint)
  async createUser(params) {
    if (!params.data.email) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: [{ field: 'email', message: 'Email is required' }],
      })
    }

    return this.userService.create(params.data)
  }
}
```

---

## Configuration Service

Type-safe configuration management.

### ConfigService<T>

```typescript
import { ConfigService, inject } from '@navios/core'

interface AppConfig {
  database: {
    host: string
    port: number
  }
  api: {
    key: string
  }
}

@Injectable()
class DatabaseService {
  private config = inject(ConfigService<AppConfig>)

  connect() {
    const host = this.config.get('database.host')
    const port = this.config.get('database.port')
    // Type-safe dot notation access
  }
}
```

### Methods

| Method | Return | Description |
|--------|--------|-------------|
| `get(key)` | `Value \| null` | Get config value by dot path |
| `getOrDefault(key, default)` | `Value` | Get with fallback value |
| `getOrThrow(key, message?)` | `Value` | Get or throw exception |
| `getConfig()` | `T` | Get entire config object |

---

## Logger Service

Built-in logging with configurable levels.

### Log Levels

```typescript
type LogLevel = 'verbose' | 'debug' | 'log' | 'warn' | 'error' | 'fatal'
```

### LoggerInstance

```typescript
import { LoggerInstance, inject } from '@navios/core'

@Injectable()
class UserService {
  private logger = inject(LoggerInstance)

  async createUser(data) {
    this.logger.log('Creating user', { email: data.email })

    try {
      const user = await this.save(data)
      this.logger.debug('User created', { userId: user.id })
      return user
    } catch (error) {
      this.logger.error('Failed to create user', error)
      throw error
    }
  }
}
```

### Methods

| Method | Description |
|--------|-------------|
| `verbose(message, ...args)` | Verbose logging |
| `debug(message, ...args)` | Debug logging |
| `log(message, ...args)` | Standard logging |
| `warn(message, ...args)` | Warning logging |
| `error(message, ...args)` | Error logging |
| `fatal(message, ...args)` | Fatal error logging |

### Configuration

```typescript
const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
  logger: ['log', 'warn', 'error'], // Only show these levels
})

// Or disable
const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
  logger: false,
})
```

---

## Custom Attributes

Create custom metadata decorators using `AttributeFactory`.

### Creating an Attribute

```typescript
import { AttributeFactory, InjectionToken } from '@navios/core'
import { z } from 'zod'

const ROLES_TOKEN = InjectionToken.create<string[]>('ROLES')

// Simple attribute
const Roles = AttributeFactory.createAttribute(ROLES_TOKEN)

// With validation
const rolesSchema = z.array(z.string())
const ValidatedRoles = AttributeFactory.createAttribute(ROLES_TOKEN, rolesSchema)
```

### Using Attributes

```typescript
@Controller()
class AdminController {
  @Endpoint(adminEndpoint)
  @Roles(['admin', 'superuser'])
  async adminOnly(params) {
    // ...
  }
}

// Reading in guard
@Injectable()
class RoleGuard implements CanActivate {
  canActivate(context: AbstractExecutionContext) {
    const handler = context.getHandler()
    const roles = AttributeFactory.get(Roles, handler)

    if (!roles) return true

    const userRoles = context.getRequest().user?.roles || []
    return roles.some(r => userRoles.includes(r))
  }
}
```

### AttributeFactory Methods

| Method | Description |
|--------|-------------|
| `createAttribute(token, schema?)` | Create new attribute decorator |
| `get(attribute, target)` | Get first attribute value |
| `getAll(attribute, target)` | Get all attribute values |
| `getLast(attribute, target)` | Get last attribute value |
| `has(attribute, target)` | Check if attribute exists |

---

## Injection Tokens

Core tokens for accessing request-scoped values.

### Request Token

```typescript
import { Request, inject } from '@navios/core'

@Injectable({ scope: InjectableScope.Request })
class RequestLogger {
  private request = inject(Request)

  log(message: string) {
    console.log(`[${this.request.id}] ${message}`)
  }
}
```

### Reply Token

```typescript
import { Reply, inject } from '@navios/core'

@Injectable({ scope: InjectableScope.Request })
class ResponseHelper {
  private reply = inject(Reply)

  setCookie(name: string, value: string) {
    this.reply.setCookie(name, value)
  }
}
```

### ExecutionContext Token

```typescript
import { ExecutionContext, inject } from '@navios/core'

@Injectable({ scope: InjectableScope.Request })
class ContextAware {
  private context = inject(ExecutionContext)

  getControllerName() {
    return this.context.getController().name
  }
}
```

---

## Adapter Integration

Navios core is adapter-agnostic. Adapters provide runtime-specific implementations.

### Available Adapters

| Package | Runtime | Description |
|---------|---------|-------------|
| `@navios/adapter-fastify` | Node.js | Fastify HTTP server |
| `@navios/adapter-bun` | Bun | Bun native HTTP server |

### Adapter Tokens

Core defines abstract tokens that adapters implement:

| Token | Description |
|-------|-------------|
| `HttpAdapterToken` | Main HTTP adapter |
| `EndpointAdapterToken` | Endpoint handler |
| `StreamAdapterToken` | Stream handler |
| `MultipartAdapterToken` | Multipart handler |

### Using Adapters

```typescript
import { NaviosFactory } from '@navios/core'
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { defineBunEnvironment } from '@navios/adapter-bun'

// Fastify adapter
const fastifyApp = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
})

// Bun adapter
const bunApp = await NaviosFactory.create(AppModule, {
  adapter: defineBunEnvironment(),
})
```

---

## Complete Example

```typescript
// shared/endpoints/users.ts - Shared between client and server
import { builder } from '@navios/builder'
import { z } from 'zod'

export const API = builder()

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
})

export const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

export const createUser = API.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema: userSchema.omit({ id: true }),
  responseSchema: userSchema,
})
```

```typescript
// server/controllers/user.controller.ts
import { Controller, Endpoint, EndpointParams, HttpCode, inject } from '@navios/core'
import { getUser, createUser } from '../../shared/endpoints/users'

@Controller()
class UserController {
  private userService = inject(UserService)

  @Endpoint(getUser)
  async getUser(params: EndpointParams<typeof getUser>) {
    const user = await this.userService.findById(params.urlParams.userId)
    if (!user) throw new NotFoundException('User not found')
    return user
  }

  @Endpoint(createUser)
  @HttpCode(201)
  async createUser(params: EndpointParams<typeof createUser>) {
    return this.userService.create(params.data)
  }
}
```

```typescript
// server/modules/user.module.ts
import { Module } from '@navios/core'

@Module({
  controllers: [UserController],
})
class UserModule {}
```

```typescript
// server/app.module.ts
import { Module } from '@navios/core'

@Module({
  imports: [UserModule],
  guards: [LoggingGuard],
})
class AppModule {}
```

```typescript
// server/main.ts
import { NaviosFactory } from '@navios/core'
import { defineFastifyEnvironment } from '@navios/adapter-fastify'

async function bootstrap() {
  const app = await NaviosFactory.create(AppModule, {
    adapter: defineFastifyEnvironment(),
    logger: ['log', 'warn', 'error'],
  })

  app.setGlobalPrefix('/api/v1')
  app.enableCors({ origin: true })

  await app.listen({ port: 3000 })
  console.log('Server running on http://localhost:3000')
}

bootstrap()
```

```typescript
// client/api.ts - Client uses same endpoint definitions
import { create } from 'navios'
import { API, getUser, createUser } from '../shared/endpoints/users'

// Provide HTTP client
API.provideClient(create({ baseURL: 'http://localhost:3000/api/v1' }))

// Type-safe API calls with shared types
const user = await getUser({ urlParams: { userId: '123' } })
const newUser = await createUser({ data: { name: 'Jane', email: 'jane@example.com' } })
```

---

## Best Practices

### 1. Organize by Feature Modules

```
src/
├── modules/
│   ├── users/
│   │   ├── user.controller.ts
│   │   ├── user.service.ts
│   │   ├── user.module.ts
│   │   └── dto/
│   └── products/
│       └── ...
├── guards/
├── app.module.ts
└── main.ts
```

### 2. Define Schemas Separately

```typescript
// dto/user.dto.ts
export const userSchema = z.object({...})
export const createUserSchema = userSchema.omit({ id: true })
export const updateUserSchema = userSchema.partial().omit({ id: true })
```

### 3. Use Guards for Cross-Cutting Concerns

```typescript
// guards/logging.guard.ts
@Injectable()
class LoggingGuard implements CanActivate {
  private logger = inject(LoggerInstance)

  canActivate(context: AbstractExecutionContext) {
    const handler = context.getHandler()
    this.logger.log(`Executing ${handler.classMethod}`)
    return true
  }
}
```

### 4. Leverage Request Scope Appropriately

```typescript
// Only use Request scope when needed
@Injectable({ scope: InjectableScope.Request })
class RequestContext {
  user?: User
  correlationId = crypto.randomUUID()
}
```

### 5. Handle Errors Consistently

```typescript
@Injectable()
class ErrorFilter {
  transform(error: unknown) {
    if (error instanceof HttpException) {
      return error
    }
    return new InternalServerErrorException('Unexpected error')
  }
}
```
