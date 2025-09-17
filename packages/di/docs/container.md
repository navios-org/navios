# Container

The `Container` class is the main entry point for dependency injection in Navios DI. It provides a simplified, high-level API for managing services and their dependencies.

## Overview

The Container wraps a `ServiceLocator` instance and provides convenient methods for:

- Getting service instances
- Invalidating services and their dependencies
- Managing service lifecycle
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
const mockLogger = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
  debug: console.debug,
}
const container = new Container(customRegistry, mockLogger)
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

### Accessing the Service Locator

For advanced usage, you can access the underlying `ServiceLocator`:

```typescript
const container = new Container()
const serviceLocator = container.getServiceLocator()

// Use advanced ServiceLocator methods
const instance = await serviceLocator.getOrThrowInstance(UserService)
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
try {
  const service = await container.get(NonExistentService)
} catch (error) {
  if (error instanceof InstanceNotFoundError) {
    console.error('Service not registered:', error.message)
  } else {
    console.error('Unexpected error:', error)
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

## API Reference

### Constructor

```typescript
constructor(registry?: Registry, logger?: Console | null)
```

- `registry`: Optional registry instance (defaults to global registry)
- `logger`: Optional logger instance for debugging

### Methods

#### `get<T>(token: T): Promise<InstanceType<T>>`

Gets a service instance from the container.

**Overloads:**

- `get<T extends ClassType>(token: T): Promise<InstanceType<T>>`
- `get<T, S extends InjectionTokenSchemaType>(token: InjectionToken<T, S>, args: z.input<S>): Promise<T>`
- `get<T>(token: InjectionToken<T, undefined>): Promise<T>`
- `get<T>(token: BoundInjectionToken<T, any>): Promise<T>`
- `get<T>(token: FactoryInjectionToken<T, any>): Promise<T>`

#### `invalidate(service: unknown): Promise<void>`

Invalidates a service and its dependencies.

#### `ready(): Promise<void>`

Waits for all pending operations to complete.

#### `getServiceLocator(): ServiceLocator`

Returns the underlying ServiceLocator instance.

## Error Handling

The Container can throw various errors:

- `InstanceNotFoundError`: When a service is not registered
- `InstanceExpiredError`: When a service instance has expired
- `InstanceDestroyingError`: When trying to access a service being destroyed
- `UnknownError`: For unexpected errors

```typescript
import { InstanceNotFoundError } from '@navios/di'

try {
  const service = await container.get(UnregisteredService)
} catch (error) {
  if (error instanceof InstanceNotFoundError) {
    console.error('Service not found:', error.message)
  }
}
```
