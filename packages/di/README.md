# Navios DI

A powerful, type-safe dependency injection library for TypeScript applications. Navios DI provides a modern, decorator-based approach to dependency injection with support for singletons, transients, request-scoped services, factories, injection tokens, and service lifecycle management.

## Features

- **Type-safe**: Full TypeScript support with compile-time type checking
- **Decorator-based**: Clean, declarative syntax using decorators
- **Lifecycle Management**: Built-in support for service initialization and cleanup
- **Factory Pattern**: Create instances using factory classes
- **Injection Tokens**: Flexible token-based dependency resolution
- **Scoped Instances**: Singleton, transient, and request scopes
- **Priority System**: Register multiple services per token with priority levels
- **Async/Sync Injection**: Both synchronous and asynchronous dependency resolution
- **Container API**: Simple container-based API for dependency management
- **Request Context**: Manage request-scoped services with automatic cleanup via ScopedContainer
- **Circular Dependency Detection**: Automatic detection and helpful error messages for circular dependencies
- **Enhanced Testing**: Comprehensive test utilities with assertion helpers and auto-tracking

## Installation

```bash
npm install @navios/di
# or
yarn add @navios/di
```

## Quick Start

### Basic Usage

```typescript
import { asyncInject, Container, Injectable } from '@navios/di'

@Injectable()
class DatabaseService {
  async connect() {
    return 'Connected to database'
  }
}

@Injectable()
class UserService {
  private readonly db = asyncInject(DatabaseService)

  async getUsers() {
    const dbService = await this.db
    const connection = await dbService.connect()
    return `Users from ${connection}`
  }
}

// Using Container
const container = new Container()
const userService = await container.get(UserService)
console.log(await userService.getUsers()) // "Users from Connected to database"
```

## Core Concepts

### Container

The `Container` class provides a simplified API for dependency injection:

```typescript
import { Container } from '@navios/di'

const container = new Container()

// Get instances
const service = await container.get(MyService)

// Invalidate services and their dependencies
await container.invalidate(service)

// Wait for all pending operations
await container.ready()

// Clean up all resources
await container.dispose()
```

### ScopedContainer (Request Context)

For request-scoped services, use `ScopedContainer` which provides isolated service resolution:

```typescript
import { Container, Injectable, InjectableScope } from '@navios/di'

@Injectable({ scope: InjectableScope.Request })
class RequestLogger {
  constructor() {
    console.log('New logger for this request')
  }
}

const container = new Container()

// Begin a request context - returns a ScopedContainer
const scopedContainer = container.beginRequest('req-123', { userId: 456 })

// Use the scoped container for request-scoped services
const logger = await scopedContainer.get(RequestLogger)

// Access metadata
scopedContainer.setMetadata('correlationId', 'abc-123')
const corrId = scopedContainer.getMetadata('correlationId')

// End the request (cleanup all request-scoped instances)
await scopedContainer.endRequest()
```

### Injectable Decorator

The `@Injectable` decorator marks a class as injectable:

```typescript
import { Injectable, InjectableScope } from '@navios/di'
import { z } from 'zod'

// Singleton (default)
@Injectable()
class SingletonService {}

// Transient (new instance each time)
@Injectable({ scope: InjectableScope.Transient })
class TransientService {}

// Request-scoped (new instance per request context)
@Injectable({ scope: InjectableScope.Request })
class RequestService {}

// With custom injection token
@Injectable({ token: MyToken })
class TokenizedService {}

// With priority (higher priority wins when multiple registrations exist)
@Injectable({ priority: 100 })
class DefaultService {}

@Injectable({ priority: 200 }) // This wins
class OverrideService {}

// With schema for constructor arguments
const configSchema = z.object({
  host: z.string(),
  port: z.number(),
})

@Injectable({ schema: configSchema })
class DatabaseConfig {
  constructor(public readonly config: z.output<typeof configSchema>) {}
}
```

### Injection Methods

#### `inject` - Synchronous Injection

Use `inject` for immediate access to dependencies. **Note**: If the dependency is not immediately available, `inject` returns a proxy that will throw an error if accessed before the dependency is ready:

```typescript
@Injectable()
class EmailService {
  sendEmail(message: string) {
    return `Email sent: ${message}`
  }
}

@Injectable()
class NotificationService {
  private readonly emailService = inject(EmailService)

  notify(message: string) {
    // Safe to use if EmailService is already instantiated
    return this.emailService.sendEmail(message)
  }
}
```

#### `asyncInject` - Asynchronous Injection

Use `asyncInject` for async dependency resolution, especially useful for circular dependencies:

```typescript
@Injectable()
class AsyncService {
  private readonly emailService = asyncInject(EmailService)

  async notify(message: string) {
    const emailService = await this.emailService
    return emailService.sendEmail(message)
  }
}
```

#### `optional` - Optional Injection

Use `optional` to inject a dependency only if it's available:

```typescript
@Injectable()
class FeatureService {
  private readonly analytics = optional(AnalyticsService)

  track(event: string) {
    // Only calls analytics if the service is available
    this.analytics?.track(event)
  }
}
```

### Factory Decorator

Create instances using factory classes:

```typescript
import { Factory, Factorable, FactoryContext } from '@navios/di'

@Factory()
class DatabaseConnectionFactory implements Factorable<Connection> {
  async create(ctx?: FactoryContext) {
    const config = await ctx?.inject(ConfigService)

    const connection = {
      host: config?.host ?? 'localhost',
      port: config?.port ?? 5432,
      connected: true,
    }

    // Register cleanup callback
    ctx?.addDestroyListener(() => {
      connection.connected = false
    })

    return connection
  }
}

// Usage
const connection = await container.get(DatabaseConnectionFactory)
console.log(connection) // { host: 'localhost', port: 5432, connected: true }
```

### Service Lifecycle

Implement lifecycle hooks for initialization and cleanup:

```typescript
import { Injectable, OnServiceDestroy, OnServiceInit } from '@navios/di'

@Injectable()
class DatabaseService implements OnServiceInit, OnServiceDestroy {
  private connection: any = null

  async onServiceInit() {
    console.log('Initializing database connection...')
    this.connection = await this.connect()
  }

  async onServiceDestroy() {
    console.log('Closing database connection...')
    if (this.connection) {
      await this.connection.close()
    }
  }

  private async connect() {
    // Database connection logic
    return { connected: true, close: async () => {} }
  }
}
```

### Injection Tokens

Use injection tokens for flexible dependency resolution:

#### Basic Injection Token

```typescript
import { Container, Injectable, InjectionToken } from '@navios/di'
import { z } from 'zod'

const configSchema = z.object({
  apiUrl: z.string(),
  timeout: z.number(),
})

const CONFIG_TOKEN = InjectionToken.create<z.infer<typeof configSchema>, typeof configSchema>(
  'APP_CONFIG',
  configSchema,
)

@Injectable({ token: CONFIG_TOKEN })
class ConfigService {
  constructor(private config: z.infer<typeof configSchema>) {}

  getApiUrl() {
    return this.config.apiUrl
  }
}

// Usage
const container = new Container()
const config = await container.get(CONFIG_TOKEN, {
  apiUrl: 'https://api.example.com',
  timeout: 5000,
})
```

#### Bound Injection Token

Pre-bind values to injection tokens:

```typescript
const BoundConfig = InjectionToken.bound(CONFIG_TOKEN, {
  apiUrl: 'https://api.example.com',
  timeout: 5000,
})

// No need to provide arguments
const container = new Container()
const config = await container.get(BoundConfig)
```

#### Factory Injection Token

Use factories to resolve token values:

```typescript
const FactoryConfig = InjectionToken.factory(CONFIG_TOKEN, async () => {
  // Load config from environment or external source
  return {
    apiUrl: process.env.API_URL || 'https://api.example.com',
    timeout: parseInt(process.env.TIMEOUT || '5000'),
  }
})

const config = await container.get(FactoryConfig)
```

### Injectable with Schema

Instead of creating an injection token with a schema, you can directly provide a schema to the `@Injectable` decorator:

```typescript
import { Injectable } from '@navios/di'
import { z } from 'zod'

const databaseConfigSchema = z.object({
  host: z.string(),
  port: z.number(),
  username: z.string(),
  password: z.string(),
})

@Injectable({ schema: databaseConfigSchema })
class DatabaseConfig {
  constructor(public readonly config: z.output<typeof databaseConfigSchema>) {}

  getConnectionString() {
    return `${this.config.host}:${this.config.port}`
  }
}

// Usage with arguments
const container = new Container()
const config = await container.get(DatabaseConfig, {
  host: 'localhost',
  port: 5432,
  username: 'admin',
  password: 'secret',
})
console.log(config.getConnectionString()) // "localhost:5432"
```

#### Using Schema-based Services as Dependencies

```typescript
const dbConfigSchema = z.object({
  connectionString: z.string(),
})

@Injectable({ schema: dbConfigSchema })
class DatabaseConfig {
  constructor(public readonly config: z.output<typeof dbConfigSchema>) {}
}

@Injectable()
class DatabaseService {
  // Inject with bound arguments
  private dbConfig = inject(DatabaseConfig, {
    connectionString: 'postgres://localhost:5432/myapp',
  })

  connect() {
    return `Connecting to ${this.dbConfig.config.connectionString}`
  }
}
```

## Advanced Usage

### Circular Dependency Detection

The library automatically detects circular dependencies and provides helpful error messages:

```typescript
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

### Custom Registry

```typescript
import { Container, Registry } from '@navios/di'

const customRegistry = new Registry()
const container = new Container(customRegistry)

// Get all registrations for a token (sorted by priority, highest first)
const allRegistrations = customRegistry.getAll(MyToken)
```

### Error Handling

```typescript
import { DIError, DIErrorCode } from '@navios/di'

try {
  const service = await container.get(NonExistentService)
} catch (error) {
  if (error instanceof DIError) {
    switch (error.code) {
      case DIErrorCode.FactoryNotFound:
        console.error('Service not registered')
        break
      case DIErrorCode.InstanceDestroying:
        console.error('Service is being destroyed')
        break
      case DIErrorCode.ScopeMismatchError:
        console.error('Wrong container for scope')
        break
      case DIErrorCode.TokenValidationError:
        console.error('Token validation failed')
        break
      // ... and more error codes
    }
  }
}
```

### Service Invalidation

```typescript
// Invalidate a specific service and its dependencies
await container.invalidate(myService)

// The service will be recreated on next access
const newService = await container.get(MyService)
```

## API Reference

### Container

- `get<T>(token: T, args?): Promise<T>` - Get an instance
- `invalidate(service: unknown): Promise<void>` - Invalidate a service
- `ready(): Promise<void>` - Wait for pending operations
- `dispose(): Promise<void>` - Clean up all resources
- `clear(): Promise<void>` - Clear all instances and bindings
- `isRegistered(token: any): boolean` - Check if service is registered
- `calculateInstanceName(token, args?): string | null` - Calculate the instance name for a token (returns null for unresolved factory tokens or validation errors)
- `getRegistry(): Registry` - Get the registry
- `beginRequest(requestId: string, metadata?, priority?): ScopedContainer` - Begin request context
- `getActiveRequestIds(): ReadonlySet<string>` - Get active request IDs
- `hasActiveRequest(requestId: string): boolean` - Check if request is active
- `removeRequestId(requestId: string): void` - Remove a request ID from tracking
- **Component Access Methods** (for advanced usage):
  - `getStorage(): UnifiedStorage` - Get storage instance
  - `getServiceInitializer(): ServiceInitializer` - Get service initializer
  - `getServiceInvalidator(): ServiceInvalidator` - Get service invalidator
  - `getTokenResolver(): TokenResolver` - Get token resolver
  - `getNameResolver(): NameResolver` - Get name resolver
  - `getScopeTracker(): ScopeTracker` - Get scope tracker
  - `getEventBus(): LifecycleEventBus` - Get event bus
  - `getInstanceResolver(): InstanceResolver` - Get instance resolver

### ScopedContainer

- `get<T>(token: T, args?): Promise<T>` - Get an instance (request-scoped or delegated)
- `invalidate(service: unknown): Promise<void>` - Invalidate a service
- `endRequest(): Promise<void>` - End request and cleanup
- `dispose(): Promise<void>` - Alias for endRequest()
- `ready(): Promise<void>` - Wait for pending operations
- `isRegistered(token: any): boolean` - Check if service is registered
- `calculateInstanceName(token, args?): string | null` - Calculate the instance name for a token (returns null for unresolved factory tokens or validation errors)
- `getMetadata(key: string): any` - Get request metadata
- `setMetadata(key: string, value: any): void` - Set request metadata
- `getRequestId(): string` - Get the request ID
- `getParent(): Container` - Get the parent container
- `getStorage(): UnifiedStorage` - Get the underlying storage instance

### Injectable Decorator

- `@Injectable(options?: InjectableOptions)` - Mark class as injectable
- Options:
  - `scope?: InjectableScope` - Service scope (Singleton | Transient | Request)
  - `token?: InjectionToken` - Custom injection token
  - `schema?: ZodSchema` - Zod schema for constructor arguments
  - `registry?: Registry` - Custom registry
  - `priority?: number` - Priority level (higher wins when multiple registrations exist, default: 0)
- Note: Cannot use both `token` and `schema` options together

### Factory Decorator

- `@Factory(options?: FactoryOptions)` - Mark class as factory
- Options:
  - `scope?: InjectableScope` - Factory scope
  - `token?: InjectionToken` - Custom injection token
  - `registry?: Registry` - Custom registry

### Injection Methods

- `inject<T>(token: T, args?): T` - Synchronous injection
- `asyncInject<T>(token: T, args?): Promise<T>` - Asynchronous injection
- `optional<T>(token: T, args?): T | null` - Optional injection
- `wrapSyncInit<T>(fn: () => T): T` - Wrap synchronous initialization
- `provideFactoryContext<T>(ctx: FactoryContext, fn: () => T): T` - Provide factory context

### Injection Tokens

- `InjectionToken.create<T>(name: string | symbol): InjectionToken<T>`
- `InjectionToken.create<T, S>(name: string | symbol, schema: S): InjectionToken<T, S>`
- `InjectionToken.bound<T, S>(token: InjectionToken<T, S>, value: z.input<S>): BoundInjectionToken<T, S>`
- `InjectionToken.factory<T, S>(token: InjectionToken<T, S>, factory: () => Promise<z.input<S>>): FactoryInjectionToken<T, S>`

### Lifecycle Interfaces

- `OnServiceInit` - Implement `onServiceInit(): Promise<void> | void`
- `OnServiceDestroy` - Implement `onServiceDestroy(): Promise<void> | void`

### Registry

- `set(token, scope, target, type, priority?): void` - Register a service factory
- `get(token): FactoryRecord` - Get the highest priority factory record for a token
- `getAll(token): FactoryRecord[]` - Get all factory records for a token (sorted by priority, highest first)
- `has(token): boolean` - Check if a token is registered
- `delete(token): void` - Remove all registrations for a token
- `updateScope(token, scope): boolean` - Update the scope of an already registered factory

## Testing

### TestContainer

`TestContainer` extends `Container` with enhanced testing utilities, including fluent binding API, assertion helpers, method call tracking, and dependency graph inspection.

```typescript
import { TestContainer } from '@navios/di/testing'

describe('UserService', () => {
  let container: TestContainer

  beforeEach(() => {
    container = new TestContainer()
  })

  afterEach(async () => {
    await container.clear()
  })

  it('should create user', async () => {
    // Fluent binding API
    container.bind(DatabaseService).toValue({
      save: vi.fn().mockResolvedValue({ id: '1' }),
    })

    // Or bind to class
    container.bind(UserService).toClass(MockUserService)

    // Or bind to factory
    container.bind(ConfigToken).toFactory(() => ({ apiKey: 'test' }))

    const userService = await container.get(UserService)
    const user = await userService.create({ name: 'John' })

    expect(user.id).toBe('1')

    // Assertion helpers
    container.expectResolved(UserService)
    container.expectSingleton(UserService)
    container.expectInitialized(UserService)

    // Method call tracking
    container.recordMethodCall(UserService, 'create', [{ name: 'John' }], user)
    container.expectCalled(UserService, 'create')
    container.expectCalledWith(UserService, 'create', [{ name: 'John' }])
    container.expectCallCount(UserService, 'create', 1)

    // Dependency graph inspection
    const graph = container.getDependencyGraph()
    console.log(graph)
  })
})
```

### UnitTestContainer

`UnitTestContainer` provides strict isolated unit testing with automatic method call tracking via Proxy. Only services explicitly provided can be resolved.

```typescript
import { UnitTestContainer } from '@navios/di/testing'

describe('UserService Unit Tests', () => {
  let container: UnitTestContainer

  beforeEach(() => {
    container = new UnitTestContainer({
      providers: [
        { token: UserService, useClass: MockUserService },
        { token: ConfigToken, useValue: { apiUrl: 'test' } },
        { token: ApiClient, useFactory: () => new MockApiClient() },
      ],
    })
  })

  afterEach(async () => {
    await container.dispose()
  })

  it('should track method calls automatically', async () => {
    const service = await container.get(UserService)
    await service.findUser('123')

    // Auto-tracked assertions (no manual recording needed)
    container.expectCalled(UserService, 'findUser')
    container.expectCalledWith(UserService, 'findUser', ['123'])
    container.expectNotCalled(UserService, 'deleteUser')
  })

  it('should throw on unregistered dependencies (strict mode)', async () => {
    // Strict mode (default): unregistered dependencies throw
    await expect(container.get(UnregisteredService)).rejects.toThrow(DIError)
  })

  it('should auto-mock unregistered dependencies', async () => {
    // Enable auto-mocking mode
    container.enableAutoMocking()
    const mock = await container.get(UnregisteredService)
    container.expectAutoMocked(UnregisteredService)
    container.disableAutoMocking()
  })
})
```

## Best Practices

1. **Use `asyncInject` for circular dependencies** - Breaks circular dependency cycles safely
2. **Use `inject` for simple dependencies** - When you're certain the dependency is ready
3. **Use `optional` for feature flags** - Dependencies that may not be available
4. **Implement lifecycle hooks** - For proper resource management
5. **Use injection tokens** - For configuration and interface-based dependencies
6. **Prefer singletons** - Unless you specifically need new instances each time
7. **Use factories** - For complex object creation logic
8. **Leverage ScopedContainer** - For request-scoped data and cleanup
9. **Use priority system** - When you need multiple implementations of the same token, use priority to control which one wins
10. **Use TestContainer for integration tests** - Provides comprehensive assertion helpers and dependency graph inspection
11. **Use UnitTestContainer for unit tests** - Provides strict isolation and automatic method call tracking

## Legacy Decorator Support

If you cannot use Stage 3 (native ES) decorators—for example, when working with existing TypeScript projects that have `experimentalDecorators` enabled, certain bundler configurations, or Bun—you can use the legacy-compatible decorators:

```typescript
import { Injectable, Factory } from '@navios/di/legacy-compat'
import { inject, asyncInject, Container } from '@navios/di'

@Injectable()
class UserService {
  private readonly db = inject(DatabaseService)
}

const container = new Container()
const userService = await container.get(UserService)
```

### TypeScript Configuration for Legacy Decorators

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

## License

MIT
