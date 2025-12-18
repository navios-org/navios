# @navios/di Specification

## Overview

`@navios/di` is a powerful, type-safe dependency injection framework for TypeScript. It provides decorator-based service registration, multiple injection scopes, lifecycle management, circular dependency detection, and comprehensive async support.

**Package:** `@navios/di`
**Version:** 0.5.1
**License:** MIT
**Peer Dependencies:** `zod` (^3.25.0 || ^4.0.0)

## Architecture

The library follows a modular architecture with clear separation of concerns:

```
src/
├── container/           # Public container API
│   ├── container.mts    # Main Container class
│   └── scoped-container.mts  # Request-scoped ScopedContainer
├── decorators/          # @Injectable, @Factory decorators
├── enums/               # InjectableScope, InjectableType
├── errors/              # DIError, DIErrorCode
├── interfaces/          # Public interfaces
├── internal/            # Internal implementation
│   ├── context/         # Resolution and request contexts
│   │   ├── async-local-storage.mts  # Cross-platform AsyncLocalStorage
│   │   ├── sync-local-storage.mts   # Browser polyfill
│   │   ├── factory-context.mts      # Factory context
│   │   ├── request-context.mts      # Request context
│   │   └── resolution-context.mts   # Resolution tracking for cycles
│   ├── core/            # Service locator, resolver, instantiator
│   ├── holder/          # Instance holder management
│   └── lifecycle/       # Event bus, circular detector
├── symbols/             # Symbol constants
├── testing/             # TestContainer utilities
├── token/               # InjectionToken, Registry
└── utils/               # Injection utilities
```

### Key Components

| Component          | Purpose                                             |
| ------------------ | --------------------------------------------------- |
| `Container`        | Main entry point for service resolution             |
| `ScopedContainer`  | Request-scoped container for isolated resolution    |
| `Registry`         | Central storage for service metadata                |
| `ServiceLocator`   | Coordinates dependency resolution                   |
| `Instantiator`     | Creates service instances                           |
| `InstanceResolver` | Resolves instances from storage or creates new      |
| `Invalidator`      | Handles service invalidation and cleanup            |
| `TokenProcessor`   | Normalizes and processes injection tokens           |
| `CircularDetector` | Detects circular dependencies during resolution     |
| `InjectionToken`   | Type-safe tokens for dynamic resolution             |

---

## Platform Support

The library supports multiple JavaScript runtimes:

| Platform | AsyncLocalStorage | Notes                              |
| -------- | ----------------- | ---------------------------------- |
| Node.js  | Native            | Full async tracking support        |
| Bun      | Native            | Full async tracking support        |
| Deno     | Native            | Via Node compatibility layer       |
| Browser  | Polyfill          | Sync-only tracking (SyncLocalStorage) |

### Browser Entry Point

For browser environments, use the dedicated entry point that uses a synchronous polyfill:

```typescript
// Bundlers automatically select the browser entry via package.json exports
import { Container, inject } from '@navios/di'
```

The browser build uses `SyncLocalStorage` which tracks context synchronously. This is sufficient for most use cases since:
1. Constructors are typically synchronous
2. Circular dependency detection mainly needs sync tracking

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
import { Factorable, Factory, FactoryContext } from '@navios/di'

@Factory()
class ConnectionFactory implements Factorable<Connection> {
  async create(ctx?: FactoryContext): Promise<Connection> {
    const config = await ctx?.inject(ConfigService)
    const connection = new Connection(config)

    ctx?.addDestroyListener(() => connection.close())

    return connection
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
  Request = 'request',     // One instance per request context
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

One instance per request context. Requires using `ScopedContainer`.

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

Asynchronously injects a dependency. Use for circular dependencies.

```typescript
import { asyncInject } from '@navios/di'

// Circular dependency example
@Injectable()
class ServiceA {
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
- `asyncInject` runs outside the resolution context, so it doesn't participate in circular dependency detection

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

#### `wrapSyncInit<T>(fn: () => T): T`

Wraps a synchronous initialization function.

```typescript
import { wrapSyncInit } from '@navios/di'

const result = wrapSyncInit(() => {
  // Synchronous initialization logic
  return computedValue
})
```

#### `provideFactoryContext<T>(ctx: FactoryContext, fn: () => T): T`

Provides a factory context for the duration of a function execution.

```typescript
import { provideFactoryContext } from '@navios/di'

const result = provideFactoryContext(ctx, () => {
  // Factory context is available here
  return createdValue
})
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

#### Constructor

```typescript
constructor(
  registry: Registry = globalRegistry,
  logger: Console | null = null,
  injectors: Injectors = defaultInjectors
)
```

#### Methods

| Method                              | Return                | Description                         |
| ----------------------------------- | --------------------- | ----------------------------------- |
| `get<T>(token, args?)`              | `Promise<T>`          | Resolve a service instance          |
| `invalidate(service)`               | `Promise<void>`       | Invalidate service and dependents   |
| `ready()`                           | `Promise<void>`       | Wait for all pending operations     |
| `isRegistered(token)`               | `boolean`             | Check if service is registered      |
| `dispose()`                         | `Promise<void>`       | Clean up all resources              |
| `clear()`                           | `Promise<void>`       | Clear all instances and bindings    |
| `getServiceLocator()`               | `ServiceLocator`      | Access underlying service locator   |
| `getRegistry()`                     | `Registry`            | Get the registry                    |
| `beginRequest(id, metadata?, prio?)`| `ScopedContainer`     | Start a new request context         |
| `getActiveRequestIds()`             | `ReadonlySet<string>` | Get active request IDs              |
| `hasActiveRequest(id)`              | `boolean`             | Check if request is active          |
| `tryGetSync<T>(token, args?)`       | `T \| null`           | Get instance sync if exists         |

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

---

### ScopedContainer API

The `ScopedContainer` class provides isolated request-scoped service resolution.

```typescript
const scopedContainer = container.beginRequest('req-123', { userId: 456 })
```

#### Methods

| Method                      | Return           | Description                         |
| --------------------------- | ---------------- | ----------------------------------- |
| `get<T>(token, args?)`      | `Promise<T>`     | Resolve a service (scoped or parent)|
| `invalidate(service)`       | `Promise<void>`  | Invalidate a service                |
| `endRequest()`              | `Promise<void>`  | End request and cleanup             |
| `dispose()`                 | `Promise<void>`  | Alias for endRequest()              |
| `ready()`                   | `Promise<void>`  | Wait for pending operations         |
| `isRegistered(token)`       | `boolean`        | Check if service is registered      |
| `getMetadata(key)`          | `any`            | Get request metadata                |
| `setMetadata(key, value)`   | `void`           | Set request metadata                |
| `addInstance(token, inst)`  | `void`           | Add pre-prepared instance           |
| `getRequestId()`            | `string`         | Get the request ID                  |
| `getParent()`               | `Container`      | Get the parent container            |
| `getRequestContextHolder()` | `RequestContext` | Get underlying request context      |
| `getHolderStorage()`        | `IHolderStorage` | Get holder storage                  |
| `tryGetSync<T>(token, args?)`| `T \| null`     | Get instance sync if exists         |

#### Request Context Example

```typescript
const container = new Container()

// Begin a request context (e.g., in HTTP middleware)
const scopedContainer = container.beginRequest('req-123', {
  userId: 'user-456',
  correlationId: 'corr-789',
})

// Request-scoped services are isolated to this request
const requestLogger = await scopedContainer.get(RequestLogger)

// Access metadata
const userId = scopedContainer.getMetadata('userId')

// Add pre-prepared instances
const REQUEST_ID = InjectionToken.create<string>('REQUEST_ID')
scopedContainer.addInstance(REQUEST_ID, 'req-123')

// End request and cleanup request-scoped instances
await scopedContainer.endRequest()
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

#### FactoryContext

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

### RequestContext

The `RequestContext` interface manages request-scoped instances.

```typescript
interface RequestContext {
  readonly requestId: string
  readonly priority: number
  readonly metadata: Map<string, any>
  readonly createdAt: number
  readonly holders: Map<string, InstanceHolder>

  addInstance(token: InjectionToken, instance: any): void
  addInstance(name: string, instance: any, holder: InstanceHolder): void
  get(instanceName: string): InstanceHolder | undefined
  set(instanceName: string, holder: InstanceHolder): void
  has(instanceName: string): boolean
  clear(): void
  getMetadata(key: string): any | undefined
  setMetadata(key: string, value: any): void
  filter(predicate: (value, key) => boolean): Map<string, InstanceHolder>
  delete(name: string): boolean
  size(): number
  isEmpty(): boolean
}
```

---

### Circular Dependency Detection

The library automatically detects circular dependencies and throws clear error messages.

#### How It Works

1. **Resolution Context Tracking**: Uses `AsyncLocalStorage` (or `SyncLocalStorage` in browsers) to track which service is currently being instantiated
2. **waitingFor Graph**: Each `InstanceHolder` tracks which services it's waiting for
3. **BFS Cycle Detection**: Before waiting on a "Creating" holder, `CircularDetector` uses BFS to find cycles in the waitingFor graph

#### Example

```typescript
// This will throw: "Circular dependency detected: ServiceA -> ServiceB -> ServiceA"
@Injectable()
class ServiceA {
  private serviceB = inject(ServiceB)
}

@Injectable()
class ServiceB {
  private serviceA = inject(ServiceA)
}
```

#### Breaking Circular Dependencies

Use `asyncInject` on at least one side of the circular dependency:

```typescript
@Injectable()
class ServiceA {
  private serviceB = asyncInject(ServiceB)  // Use asyncInject to break cycle

  async doSomething() {
    const b = await this.serviceB
    return b.process()
  }
}

@Injectable()
class ServiceB {
  private serviceA = inject(ServiceA)  // This side can use inject()

  process() {
    return 'processed'
  }
}
```

`asyncInject` works because it:
- Returns a Promise immediately without blocking the constructor
- Runs outside the resolution context (`withoutResolutionContext`)
- Does not participate in circular dependency detection

---

### Error Handling

#### DIErrorCode

```typescript
enum DIErrorCode {
  FactoryNotFound = 'FACTORY_NOT_FOUND',
  FactoryTokenNotResolved = 'FACTORY_TOKEN_NOT_RESOLVED',
  InstanceNotFound = 'INSTANCE_NOT_FOUND',
  InstanceDestroying = 'INSTANCE_DESTROYING',
  CircularDependency = 'CIRCULAR_DEPENDENCY',
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
      case DIErrorCode.CircularDependency:
        console.error('Circular dependency detected:', error.message)
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

  afterEach(async () => {
    await container.dispose()
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
await container.invalidate(databaseService)

// The service and any services that depend on it are destroyed
// They will be re-created on next injection
```

#### Cross-Storage Invalidation

Singletons that depend on request-scoped services are automatically invalidated when the request ends:

```typescript
@Injectable({ scope: InjectableScope.Request })
class RequestData {
  data = 'request-specific'
}

@Injectable({ scope: InjectableScope.Singleton })
class SingletonService {
  private requestData = inject(RequestData)

  async getData() {
    return (await this.requestData).data
  }
}

// When the request ends:
await scopedContainer.endRequest()
// SingletonService is also invalidated because it depends on RequestData
```

---

## Internal Components

These components are exported for advanced use cases but are considered internal API.

### InstanceHolder

Represents a managed service instance with its lifecycle state.

```typescript
enum InstanceStatus {
  Creating = 'creating',
  Created = 'created',
  Destroying = 'destroying',
  Error = 'error',
}

interface InstanceHolder<T = unknown> {
  name: string
  instance: T | null
  status: InstanceStatus
  type: InjectableType
  scope: InjectableScope
  deps: Set<string>          // Dependencies (services this holder depends on)
  waitingFor: Set<string>    // Services this holder is waiting for (for cycle detection)
  destroyListeners: InstanceDestroyListener[]
  createdAt: number
  creationPromise: Promise<[undefined, T]> | null
  destroyPromise: Promise<void> | null
}
```

### HolderManager

Manages instance holders and their lifecycle.

```typescript
class HolderManager extends BaseHolderManager {
  get(instanceName: string): InstanceHolder | undefined
  storeCreatingHolder(name, type, scope): InstanceHolder
  storeCreatedHolder(name, instance, type, scope): InstanceHolder
  filter(predicate): Map<string, InstanceHolder>
  // ...
}
```

### CircularDetector

Detects circular dependencies during resolution using BFS.

```typescript
class CircularDetector {
  static detectCycle(
    waiterName: string,
    targetName: string,
    getHolder: (name: string) => InstanceHolder | undefined
  ): string[] | null

  static formatCycle(cycle: string[]): string
}
```

### LifecycleEventBus

Manages lifecycle events for services.

```typescript
class LifecycleEventBus {
  onCreated(instanceName: string, callback: () => void): void
  onDestroyed(instanceName: string, callback: () => void): void
  emitCreated(instanceName: string): void
  emitDestroyed(instanceName: string): void
}
```

### Resolution Context

Tracks the current resolution context for circular dependency detection.

```typescript
interface ResolutionContextData {
  waiterHolder: InstanceHolder
  getHolder: (name: string) => InstanceHolder | undefined
}

// Run code within a resolution context
withResolutionContext(waiterHolder, getHolder, fn)

// Get current context
getCurrentResolutionContext(): ResolutionContextData | undefined

// Run code outside any resolution context (used by asyncInject)
withoutResolutionContext(fn)
```

---

## Advanced Patterns

### Circular Dependencies

Handle circular dependencies using `asyncInject`:

```typescript
@Injectable()
class ServiceA {
  private serviceB = asyncInject(ServiceB)

  async doSomething() {
    const b = await this.serviceB
    return b.process()
  }
}

@Injectable()
class ServiceB {
  private serviceA = inject(ServiceA)

  process() {
    return 'processed'
  }
}
```

At least one side of the circular dependency must use `asyncInject` to break the cycle.

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
const server = await container.get(ServerService, {
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
// May throw if circular - use asyncInject to break cycle
const service = inject(ServiceA)

// Safe for circular dependencies
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

### 6. Use ScopedContainer for Request Isolation

```typescript
// In HTTP middleware
app.use(async (req, res, next) => {
  const scopedContainer = container.beginRequest(req.id, { userId: req.userId })
  req.container = scopedContainer

  try {
    await next()
  } finally {
    await scopedContainer.endRequest()
  }
})
```

---

## Deprecated Aliases

For backward compatibility, the following deprecated aliases are provided:

| Deprecated Name                      | New Name                |
| ------------------------------------ | ----------------------- |
| `ServiceLocatorInstanceHolder`       | `InstanceHolder`        |
| `ServiceLocatorInstanceHolderStatus` | `InstanceStatus`        |
| `ServiceLocatorInstanceEffect`       | `InstanceEffect`        |
| `ServiceLocatorInstanceDestroyListener` | `InstanceDestroyListener` |
| `ServiceLocatorInstanceHolderCreating` | `InstanceHolderCreating` |
| `ServiceLocatorInstanceHolderCreated` | `InstanceHolderCreated` |
| `ServiceLocatorInstanceHolderDestroying` | `InstanceHolderDestroying` |
| `ServiceLocatorInstanceHolderError`  | `InstanceHolderError`   |
| `BaseInstanceHolderManager`          | `BaseHolderManager`     |
| `ServiceLocatorManager`              | `HolderManager`         |
| `SingletonHolderStorage`             | `SingletonStorage`      |
| `RequestHolderStorage`               | `RequestStorage`        |
| `ServiceLocatorEventBus`             | `LifecycleEventBus`     |
| `CircularDependencyDetector`         | `CircularDetector`      |
| `ServiceInstantiator`                | `Instantiator`          |
| `RequestContextHolder`               | `RequestContext`        |
| `DefaultRequestContextHolder`        | `DefaultRequestContext` |
| `createRequestContextHolder`         | `createRequestContext`  |
