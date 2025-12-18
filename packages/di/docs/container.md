# Container

The `Container` class is the main entry point for dependency injection in Navios DI. It provides a simplified, high-level API for managing services and their dependencies.

## Overview

The Container wraps a `ServiceLocator` instance and provides convenient methods for:

- Getting service instances
- Invalidating services and their dependencies
- Managing service lifecycle
- Creating request-scoped containers via `ScopedContainer`
- Accessing the underlying service locator for advanced usage

## Basic Usage

### Creating a Container

```typescript
import { Container } from '@navios/di'

// Create with default registry
const container = new Container()

// Create with custom registry
const customRegistry = new Registry()
const container = new Container(customRegistry)

// Create with custom registry and logger
const container = new Container(customRegistry, console)
```

### Getting Service Instances

The `get` method is the primary way to retrieve service instances:

```typescript
import { Container, Injectable } from '@navios/di'

@Injectable()
class UserService {
  getUsers() {
    return ['Alice', 'Bob', 'Charlie']
  }
}

const container = new Container()
const userService = await container.get(UserService)
console.log(userService.getUsers()) // ['Alice', 'Bob', 'Charlie']
```

### Type-Safe Service Resolution

The Container provides full type safety for service resolution:

```typescript
// Simple class injection
const service: UserService = await container.get(UserService)

// Injection token with schema
const config = await container.get(CONFIG_TOKEN, {
  apiUrl: 'https://api.example.com',
  timeout: 5000,
})

// Bound injection token
const boundService = await container.get(BoundConfigToken)

// Factory injection token
const factoryService = await container.get(FactoryConfigToken)
```

## Advanced Usage

### Service Invalidation

The `invalidate` method allows you to remove a service and its dependencies from the container:

```typescript
@Injectable()
class CacheService {
  private cache = new Map()

  set(key: string, value: any) {
    this.cache.set(key, value)
  }

  get(key: string) {
    return this.cache.get(key)
  }
}

const container = new Container()
const cacheService = await container.get(CacheService)

// Use the service
cacheService.set('user:123', { name: 'Alice' })

// Invalidate the service
await container.invalidate(cacheService)

// Next access will create a new instance
const newCacheService = await container.get(CacheService)
console.log(newCacheService.get('user:123')) // undefined (new instance)
```

### Waiting for Operations

The `ready` method waits for all pending operations to complete:

```typescript
const container = new Container()

// Start multiple async operations
const promises = [
  container.get(UserService),
  container.get(EmailService),
  container.get(DatabaseService),
]

// Wait for all to complete
await container.ready()

// All services are now ready
const [userService, emailService, dbService] = await Promise.all(promises)
```

### Synchronous Instance Access

Use `tryGetSync` to get an instance synchronously if it already exists:

```typescript
const container = new Container()

// First, ensure the service is created
await container.get(UserService)

// Now you can get it synchronously
const userService = container.tryGetSync(UserService)
if (userService) {
  console.log('Service already exists:', userService)
} else {
  console.log('Service not yet created')
}
```

### Accessing the Service Locator

For advanced usage, you can access the underlying `ServiceLocator`:

```typescript
const container = new Container()
const serviceLocator = container.getServiceLocator()

// Use advanced ServiceLocator methods
const instance = await serviceLocator.getOrThrowInstance(UserService)
```

## Request Context Management

The Container provides built-in support for request contexts via `ScopedContainer`. This allows you to manage request-scoped services with proper isolation between concurrent requests.

### Creating a ScopedContainer

```typescript
import { Container, Injectable, InjectableScope } from '@navios/di'

@Injectable({ scope: InjectableScope.Request })
class RequestContext {
  userId?: string
  correlationId?: string
}

const container = new Container()

// Begin a request context - returns a ScopedContainer
const scoped = container.beginRequest('req-123', {
  userId: 'user-456',
  correlationId: 'corr-789',
})

// Get request-scoped services from the ScopedContainer
const context = await scoped.get(RequestContext)

// Access metadata
const userId = scoped.getMetadata('userId')

// Clean up when done
await scoped.endRequest()
```

### Why ScopedContainer?

The `ScopedContainer` pattern eliminates race conditions that occurred with the old API:

```typescript
// OLD API (removed) - had race conditions:
// container.setCurrentRequestContext('req-A')
// const serviceA = await container.get(RequestService) // async...
// container.setCurrentRequestContext('req-B') // Request B starts while A is resolving
// Service A might get Request B's context! Bug!

// NEW API - no race conditions:
const scopedA = container.beginRequest('req-A')
const serviceA = await scopedA.get(RequestService) // Always gets A's context

const scopedB = container.beginRequest('req-B')
const serviceB = await scopedB.get(RequestService) // Always gets B's context
```

### Request-Scoped Service Error

Attempting to get a request-scoped service from the main Container throws an error:

```typescript
@Injectable({ scope: InjectableScope.Request })
class RequestService {}

// ❌ This throws an error
await container.get(RequestService)
// Error: Cannot resolve request-scoped service "RequestService" from Container.
// Use beginRequest() to create a ScopedContainer for request-scoped services.

// ✅ Use ScopedContainer instead
const scoped = container.beginRequest('req-123')
const service = await scoped.get(RequestService)
```

### Tracking Active Requests

```typescript
const scoped1 = container.beginRequest('req-1')
const scoped2 = container.beginRequest('req-2')

// Check active requests
console.log(container.hasActiveRequest('req-1')) // true
console.log(container.getActiveRequestIds()) // Set { 'req-1', 'req-2' }

await scoped1.endRequest()
console.log(container.hasActiveRequest('req-1')) // false
```

## Best Practices

### 1. Use Container for Application Setup

```typescript
// app.ts
import { Container } from '@navios/di'

async function bootstrap() {
  const container = new Container()

  // Initialize core services
  await container.get(DatabaseService)
  await container.get(CacheService)
  await container.get(EmailService)

  // Start the application
  const app = await container.get(ApplicationService)
  await app.start()

  return container
}

const container = await bootstrap()
```

### 2. Invalidate Services When Needed

```typescript
// When configuration changes
await container.invalidate(configService)

// When cache needs clearing
await container.invalidate(cacheService)

// When user logs out
await container.invalidate(userSessionService)
```

### 3. Handle Errors Gracefully

```typescript
import { DIError, DIErrorCode } from '@navios/di'

try {
  const service = await container.get(NonExistentService)
} catch (error) {
  if (error instanceof DIError) {
    switch (error.code) {
      case DIErrorCode.FactoryNotFound:
        console.error('Service not registered:', error.message)
        break
      case DIErrorCode.CircularDependency:
        console.error('Circular dependency:', error.message)
        break
      default:
        console.error('DI error:', error.message)
    }
  }
}
```

### 4. Use Custom Registries for Modularity

```typescript
// Create separate registries for different modules
const userRegistry = new Registry()
const paymentRegistry = new Registry()

// Register services in their respective registries
@Injectable({ registry: userRegistry })
class UserService {}

@Injectable({ registry: paymentRegistry })
class PaymentService {}

// Create containers with specific registries
const userContainer = new Container(userRegistry)
const paymentContainer = new Container(paymentRegistry)
```

### 5. Manage Request Contexts Properly

```typescript
// Always clean up request contexts with try/finally
async function handleRequest(req, res) {
  const requestId = generateRequestId()
  const scoped = container.beginRequest(requestId, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  })

  try {
    const service = await scoped.get(RequestHandler)
    await service.handle(req, res)
  } finally {
    await scoped.endRequest()
  }
}
```

### 6. Clean Up on Shutdown

```typescript
async function shutdown() {
  // Dispose the container to clean up all services
  await container.dispose()
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
```

## API Reference

### Constructor

```typescript
constructor(
  registry?: Registry,
  logger?: Console | null,
  injectors?: Injectors
)
```

- `registry`: Optional registry instance (defaults to global registry)
- `logger`: Optional logger instance for debugging
- `injectors`: Optional custom injectors

### Methods

#### `get<T>(token: T): Promise<InstanceType<T>>`

Gets a service instance from the container.

**Overloads:**

- `get<T extends ClassType>(token: T): Promise<InstanceType<T>>`
- `get<T, S extends InjectionTokenSchemaType>(token: InjectionToken<T, S>, args: z.input<S>): Promise<T>`
- `get<T>(token: InjectionToken<T, undefined>): Promise<T>`
- `get<T>(token: BoundInjectionToken<T, any>): Promise<T>`
- `get<T>(token: FactoryInjectionToken<T, any>): Promise<T>`

**Note:** Throws an error for request-scoped services. Use `ScopedContainer` instead.

#### `invalidate(service: unknown): Promise<void>`

Invalidates a service and its dependencies.

#### `ready(): Promise<void>`

Waits for all pending operations to complete.

#### `dispose(): Promise<void>`

Disposes the container and cleans up all resources.

#### `clear(): Promise<void>`

Clears all instances and bindings.

#### `isRegistered(token: any): boolean`

Checks if a service is registered.

#### `tryGetSync<T>(token: any, args?: any): T | null`

Gets an instance synchronously if it already exists and is ready.

#### `getServiceLocator(): ServiceLocator`

Returns the underlying ServiceLocator instance.

#### `getRegistry(): Registry`

Returns the registry used by this container.

#### `beginRequest(requestId: string, metadata?: Record<string, any>, priority?: number): ScopedContainer`

Begins a new request context and returns a `ScopedContainer`.

- `requestId`: Unique identifier for this request
- `metadata`: Optional metadata for the request
- `priority`: Priority for resolution (higher = more priority, defaults to 100)

#### `getActiveRequestIds(): ReadonlySet<string>`

Gets the set of active request IDs.

#### `hasActiveRequest(requestId: string): boolean`

Checks if a request is active.

## ScopedContainer API

The `ScopedContainer` is returned by `container.beginRequest()` and provides isolated request-scoped service resolution.

### Methods

#### `get<T>(token: T): Promise<InstanceType<T>>`

Gets a service instance. Request-scoped services are resolved from this container's context, others are delegated to the parent.

#### `invalidate(service: unknown): Promise<void>`

Invalidates a service within the request context.

#### `endRequest(): Promise<void>`

Ends the request and cleans up all request-scoped instances.

#### `dispose(): Promise<void>`

Alias for `endRequest()`.

#### `ready(): Promise<void>`

Waits for pending operations.

#### `getMetadata(key: string): any | undefined`

Gets request metadata.

#### `setMetadata(key: string, value: any): void`

Sets request metadata.

#### `addInstance(token: InjectionToken<any, undefined>, instance: any): void`

Adds a pre-prepared instance to the request context.

#### `getRequestId(): string`

Gets the request ID.

#### `getParent(): Container`

Gets the parent container.

#### `tryGetSync<T>(token: any, args?: any): T | null`

Gets an instance synchronously if it exists and is ready.

## Error Handling

The Container throws `DIError` with specific error codes:

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
      case DIErrorCode.UnknownError:
        console.error('Unknown error:', error.message)
        break
    }
  }
}
```
