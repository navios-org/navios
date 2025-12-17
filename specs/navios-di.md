# @navios/di Specification

## Overview

`@navios/di` is a powerful, type-safe dependency injection framework for TypeScript. It provides decorator-based service registration, multiple injection scopes, lifecycle management, and comprehensive async support.

**Package:** `@navios/di`
**Version:** 0.5.1
**License:** MIT
**Peer Dependencies:** `zod` (^3.25.0 || ^4.0.0)

## Core Concepts

### Dependency Injection Pattern

The DI system follows a registration-resolution pattern:

1. **Registration** - Services are registered via decorators (`@Injectable`, `@Factory`)
2. **Resolution** - Dependencies are resolved via injection functions (`inject`, `asyncInject`)
3. **Lifecycle** - Services have scoped lifetimes and lifecycle hooks

### Key Components

| Component             | Purpose                                 |
| --------------------- | --------------------------------------- |
| `Registry`            | Central storage for service metadata    |
| `Container`           | Main entry point for service resolution |
| `ServiceLocator`      | Coordinates dependency resolution       |
| `ServiceInstantiator` | Creates service instances               |
| `InjectionToken`      | Type-safe tokens for dynamic resolution |

---

## API Reference

### Decorators

#### `@Injectable(options?)`

Marks a class as an injectable service.

```typescript
import { Injectable, InjectableScope } from '@navios/di'

@Injectable()
class UserService {
  getUsers() {
    return []
  }
}

@Injectable({ scope: InjectableScope.Request })
class RequestScopedService {
  // New instance per request
}

@Injectable({ scope: InjectableScope.Transient })
class TransientService {
  // New instance per injection
}
```

**Options:**

| Property   | Type              | Default          | Description                            |
| ---------- | ----------------- | ---------------- | -------------------------------------- |
| `scope`    | `InjectableScope` | `Singleton`      | Service lifetime scope                 |
| `token`    | `InjectionToken`  | -                | Custom injection token                 |
| `schema`   | `ZodType`         | -                | Constructor argument validation schema |
| `registry` | `Registry`        | `globalRegistry` | Target registry                        |

#### `@Factory(options?)`

Marks a class as a factory for creating service instances.

```typescript
import { Factorable, Factory } from '@navios/di'

@Factory()
class ConnectionFactory implements Factorable<Connection> {
  async create(ctx?: FactoryContext): Promise<Connection> {
    return new Connection(await this.getConfig())
  }
}
```

**Options:**

| Property   | Type              | Default          | Description            |
| ---------- | ----------------- | ---------------- | ---------------------- |
| `scope`    | `InjectableScope` | `Singleton`      | Factory output scope   |
| `token`    | `InjectionToken`  | -                | Custom injection token |
| `registry` | `Registry`        | `globalRegistry` | Target registry        |

---

### Injection Scopes

```typescript
enum InjectableScope {
  Singleton = 'singleton', // One instance for entire application
  Transient = 'transient', // New instance per injection
  Request = 'request', // One instance per request context
}
```

#### Singleton (Default)

Single instance shared across the entire application lifecycle.

```typescript
@Injectable({ scope: InjectableScope.Singleton })
class ConfigService {
  // Same instance everywhere
}
```

#### Transient

New instance created for every injection.

```typescript
@Injectable({ scope: InjectableScope.Transient })
class LogEntry {
  timestamp = Date.now()
  // New instance each time
}
```

#### Request

One instance per request context. Requires explicit request context management.

```typescript
@Injectable({ scope: InjectableScope.Request })
class RequestContext {
  userId?: string
  // Isolated per HTTP request
}
```

---

### Injection Functions

#### `inject<T>(token: T, args?): T`

Synchronously injects a dependency. Returns a proxy if the service is not yet initialized.

```typescript
import { inject } from '@navios/di'

@Injectable()
class OrderService {
  private userService = inject(UserService)

  async createOrder() {
    const user = await this.userService.getCurrentUser()
    // ...
  }
}
```

**Warning:** The proxy throws if accessed before the dependency is ready. Use `asyncInject` for circular dependencies.

#### `asyncInject<T>(token: T, args?): Promise<T>`

Asynchronously injects a dependency. Primarily used for resolving circular dependencies where two services depend on each other.

```typescript
import { asyncInject } from '@navios/di'

// Circular dependency example
@Injectable()
class ServiceA {
  // Use asyncInject to break circular dependency
  private serviceB = asyncInject(ServiceB)

  async doSomething() {
    const b = await this.serviceB
    return b.getValue()
  }
}

@Injectable()
class ServiceB {
  private serviceA = inject(ServiceA)

  getValue() {
    return 'value from B'
  }
}
```

**When to use `asyncInject`:**

- Circular dependencies between services
- When you need to defer resolution until the dependency is actually needed

**Note:** You cannot use `asyncInject` inside `onServiceInit` - dependencies should be declared as class properties.

#### `optional<T>(token: T, args?): T | null`

Injects a dependency if available, returns `null` otherwise.

```typescript
import { optional } from '@navios/di'

@Injectable()
class NotificationService {
  private emailService = optional(EmailService)

  notify(message: string) {
    if (this.emailService) {
      this.emailService.send(message)
    }
  }
}
```

---

### Injection Tokens

#### `InjectionToken<T, S, Required>`

Creates type-safe tokens for dynamic dependency resolution.

```typescript
import { InjectionToken } from '@navios/di'

import { z } from 'zod'

// Simple token
const CONFIG_TOKEN = InjectionToken.create<AppConfig>('CONFIG')

// Token with schema validation
const configSchema = z.object({
  apiUrl: z.string(),
  timeout: z.number(),
})

const VALIDATED_CONFIG = InjectionToken.create('VALIDATED_CONFIG', configSchema)
```

#### Static Methods

```typescript
// Create a token
InjectionToken.create<T>(name: string, schema?: ZodType): InjectionToken<T>

// Create a pre-bound token with value
InjectionToken.bound<T>(token: InjectionToken<T>, value: T): BoundInjectionToken<T>

// Create a factory token
InjectionToken.factory<T>(token: InjectionToken<T>, factory: () => T): FactoryInjectionToken<T>

// Refine type for existing token
InjectionToken.refineType<T>(token: InjectionToken): InjectionToken<T>
```

#### Usage with Injectable

```typescript
const DATABASE_TOKEN = InjectionToken.create<Database>('DATABASE')

@Injectable({ token: DATABASE_TOKEN })
class PostgresDatabase implements Database {
  // ...
}

// Inject by token
const db = inject(DATABASE_TOKEN)
```

---

### Container API

The `Container` class is the main entry point for the DI system.

```typescript
import { Container } from '@navios/di'

const container = new Container()
```

#### Methods

| Method                 | Return           | Description                                   |
| ---------------------- | ---------------- | --------------------------------------------- |
| `get<T>(token, args?)` | `Promise<T>`     | Resolve a service instance with optional args |
| `invalidate(service)`  | `Promise<void>`  | Invalidate service and dependents             |
| `ready()`              | `Promise<void>`  | Wait for all pending operations               |
| `isRegistered(token)`  | `boolean`        | Check if service is registered                |
| `dispose()`            | `Promise<void>`  | Clean up all resources                        |
| `clear()`              | `Promise<void>`  | Clear all instances and bindings              |
| `getServiceLocator()`  | `ServiceLocator` | Access underlying service locator             |

#### Request Context Methods

| Method                                          | Return                         | Description                       |
| ----------------------------------------------- | ------------------------------ | --------------------------------- |
| `beginRequest(requestId, metadata?, priority?)` | `RequestContextHolder`         | Start a new request context       |
| `endRequest(requestId)`                         | `Promise<void>`                | End and cleanup a request context |
| `getCurrentRequestContext()`                    | `RequestContextHolder \| null` | Get the current request context   |
| `setCurrentRequestContext(requestId)`           | `void`                         | Set the active request context    |

#### Example

```typescript
const container = new Container()

// Get a service
const userService = await container.get(UserService)

// Get a service with constructor arguments (if schema defined)
const configuredService = await container.get(ConfigurableService, {
  host: 'localhost',
  port: 3000,
})

// Wait for initialization
await container.ready()

// Clean up
await container.dispose()
```

#### Request Context Example

```typescript
const container = new Container()

// Begin a request context (e.g., in HTTP middleware)
const requestContext = container.beginRequest('req-123', {
  userId: 'user-456',
  correlationId: 'corr-789',
})

// Set as current context for this async flow
container.setCurrentRequestContext('req-123')

// Request-scoped services are now isolated to this request
const requestLogger = await container.get(RequestLogger)

// Access metadata from context
const currentContext = container.getCurrentRequestContext()
const userId = currentContext?.getMetadata()?.userId

// End request and cleanup request-scoped instances
await container.endRequest('req-123')
```

---

### Lifecycle Hooks

#### `OnServiceInit`

Called after a service is instantiated and dependencies are injected.

```typescript
import { Injectable, OnServiceInit } from '@navios/di'

@Injectable()
class DatabaseService implements OnServiceInit {
  async onServiceInit(): Promise<void> {
    await this.connect()
    console.log('Database connected')
  }
}
```

#### `OnServiceDestroy`

Called before a service is disposed.

```typescript
import { Injectable, OnServiceDestroy } from '@navios/di'

@Injectable()
class DatabaseService implements OnServiceDestroy {
  async onServiceDestroy(): Promise<void> {
    await this.disconnect()
    console.log('Database disconnected')
  }
}
```

---

### Factory Pattern

#### Factorable Interface

```typescript
interface Factorable<T> {
  create(ctx?: FactoryContext): Promise<T> | T
}
```

#### FactorableWithArgs Interface

```typescript
interface FactorableWithArgs<T, Schema extends ZodType> {
  create(ctx?: FactoryContext, ...args: z.infer<Schema>): Promise<T> | T
}
```

#### Factory Context

The `FactoryContext` provides access to DI within factories:

```typescript
interface FactoryContext {
  inject: typeof asyncInject
  locator: ServiceLocator
  addDestroyListener: (listener: () => void | Promise<void>) => void
}
```

#### Example

```typescript
@Factory()
class HttpClientFactory implements Factorable<HttpClient> {
  async create(ctx?: FactoryContext): Promise<HttpClient> {
    const config = await ctx?.inject(ConfigService)

    const client = new HttpClient({
      baseURL: config?.apiUrl,
    })

    ctx?.addDestroyListener(() => {
      client.close()
    })

    return client
  }
}
```

---

### Request Context

For request-scoped services, manage request boundaries:

```typescript
import { RequestContextHolder } from '@navios/di'

// Begin a request
const requestId = 'req-123'
const context = requestContextHolder.beginRequest(requestId, {
  userId: 'user-456',
})

// Set as current
requestContextHolder.setCurrentRequestContext(requestId)

// Get current
const current = requestContextHolder.getCurrentRequestContext()

// Access metadata
const metadata = current?.getMetadata()

// End request (cleans up request-scoped services)
requestContextHolder.endRequest(requestId)
```

#### Methods

| Method                                   | Description                       |
| ---------------------------------------- | --------------------------------- |
| `beginRequest(id, metadata?, priority?)` | Start a new request context       |
| `endRequest(id)`                         | End and cleanup a request context |
| `setCurrentRequestContext(id)`           | Set the active request context    |
| `getCurrentRequestContext()`             | Get the current request context   |
| `getMetadata()`                          | Get metadata from current context |
| `setMetadata(key, value)`                | Set metadata on current context   |

---

### Error Handling

#### DIErrorCode

```typescript
enum DIErrorCode {
  FactoryNotFound = 'FACTORY_NOT_FOUND',
  FactoryTokenNotResolved = 'FACTORY_TOKEN_NOT_RESOLVED',
  InstanceNotFound = 'INSTANCE_NOT_FOUND',
  InstanceDestroying = 'INSTANCE_DESTROYING',
  UnknownError = 'UNKNOWN_ERROR',
}
```

#### DIError

```typescript
import { DIError, DIErrorCode } from '@navios/di'

try {
  const service = await container.get(UnregisteredService)
} catch (error) {
  if (error instanceof DIError) {
    switch (error.code) {
      case DIErrorCode.FactoryNotFound:
        console.error('Service not registered')
        break
      case DIErrorCode.InstanceDestroying:
        console.error('Service is being destroyed')
        break
    }
  }
}
```

---

### Testing Support

The `@navios/di/testing` export provides testing utilities.

#### TestContainer

```typescript
import { TestContainer } from '@navios/di/testing'

describe('UserService', () => {
  let container: TestContainer

  beforeEach(() => {
    container = new TestContainer()
  })

  it('should create user', async () => {
    // Bind mock
    container.bind(DatabaseService).toValue({
      save: vi.fn().mockResolvedValue({ id: '1' }),
    })

    const userService = await container.get(UserService)
    const user = await userService.create({ name: 'John' })

    expect(user.id).toBe('1')
  })
})
```

#### Binding Methods

```typescript
// Bind to a value
container.bind(TOKEN).toValue(mockValue)

// Bind to a class
container.bind(TOKEN).toClass(MockClass)

// Shorthand bindings
container.bindValue(TOKEN, value)
container.bindClass(TOKEN, Class)

// Create isolated child container
const child = container.createChild()
```

---

### Registry

The `Registry` stores all injectable metadata.

```typescript
import { globalRegistry, Registry } from '@navios/di'

// Use global registry (default)
@Injectable()
class MyService {}

// Use custom registry
const customRegistry = new Registry()

@Injectable({ registry: customRegistry })
class IsolatedService {}
```

---

### Service Invalidation

Invalidate a service and all its dependents:

```typescript
// Invalidate a service (calls onServiceDestroy)
await container.invalidate(DatabaseService)

// The service and any services that depend on it are destroyed
// They will be re-created on next injection
```

---

## Advanced Patterns

### Circular Dependencies

Handle circular dependencies using `asyncInject`:

```typescript
@Injectable()
class ServiceA {
  // Use asyncInject to break the circular dependency
  private serviceB = asyncInject(ServiceB)

  async doSomething() {
    const b = await this.serviceB
    return b.process()
  }
}

@Injectable()
class ServiceB {
  // One side can use regular inject
  private serviceA = inject(ServiceA)

  process() {
    return 'processed'
  }
}
```

At least one side of the circular dependency must use `asyncInject` to break the cycle. The async injection defers resolution until the dependency is actually needed.

### Conditional Services

Use optional injection for feature flags:

```typescript
@Injectable()
class FeatureService {
  private analytics = optional(AnalyticsService)
  private logging = optional(LoggingService)

  track(event: string) {
    this.analytics?.track(event)
    this.logging?.log('event', event)
  }
}
```

### Schema Validation for Constructor Args

```typescript
import { z } from 'zod'

const configSchema = z.object({
  host: z.string(),
  port: z.number(),
})

@Injectable({ schema: configSchema })
class ServerService {
  constructor(config: z.infer<typeof configSchema>) {
    console.log(`Connecting to ${config.host}:${config.port}`)
  }
}

// Inject with validated args
const server = await asyncInject(ServerService, {
  host: 'localhost',
  port: 3000,
})
```

---

## Integration with @navios/core

The DI system integrates with `@navios/core` for HTTP server development:

```typescript
import { Controller, Endpoint, inject } from '@navios/core'

@Controller()
class UserController {
  private userService = inject(UserService)

  @Endpoint(getUserEndpoint)
  async getUser(params) {
    return this.userService.findById(params.id)
  }
}
```

### Request-Scoped Services in Controllers

```typescript
@Injectable({ scope: InjectableScope.Request })
class RequestContext {
  userId?: string
  roles: string[] = []
}

@Controller()
class SecureController {
  private context = inject(RequestContext)

  @Endpoint(protectedEndpoint)
  async protected() {
    return { userId: this.context.userId }
  }
}
```

---

## Best Practices

### 1. Use Singleton by Default

Only use `Transient` or `Request` scopes when necessary:

```typescript
// Good - Singleton for stateless services
@Injectable()
class UtilityService {}

// Good - Request scope for request-specific state
@Injectable({ scope: InjectableScope.Request })
class RequestLogger {}
```

### 2. Implement Lifecycle Hooks

Clean up resources properly:

```typescript
@Injectable()
class ConnectionPool implements OnServiceInit, OnServiceDestroy {
  async onServiceInit() {
    await this.createPool()
  }

  async onServiceDestroy() {
    await this.drainPool()
  }
}
```

### 3. Use InjectionTokens for Interfaces

```typescript
interface Logger {
  log(message: string): void
}

const LOGGER_TOKEN = InjectionToken.create<Logger>('LOGGER')

@Injectable({ token: LOGGER_TOKEN })
class ConsoleLogger implements Logger {
  log(message: string) {
    console.log(message)
  }
}
```

### 4. Prefer asyncInject for Circular Dependencies

```typescript
// Avoid - may throw if not ready
const service = inject(ServiceA)

// Prefer - always safe
const service = await asyncInject(ServiceA)
```

### 5. Use TestContainer for Testing

```typescript
describe('Tests', () => {
  let container: TestContainer

  beforeEach(() => {
    container = new TestContainer()
    container.bind(ExternalService).toValue(mockService)
  })

  afterEach(async () => {
    await container.dispose()
  })
})
```
