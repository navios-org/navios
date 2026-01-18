# Request Contexts

Request contexts in Navios DI provide a powerful way to manage request-scoped services with automatic cleanup. This is particularly useful in web applications where you need to maintain request-specific data and ensure proper cleanup after each request.

## Overview

A `ScopedContainer` provides isolated request context management while sharing singleton and transient services with the parent `Container`. Each request gets its own `ScopedContainer` instance, ensuring complete isolation between concurrent requests.

### Key Features

- **Request isolation**: Each request has its own isolated container - no race conditions
- **Concurrent resolution locking**: Multiple concurrent requests for the same service within a request context are properly synchronized - only one instance is created
- **Automatic cleanup**: All request-scoped instances are automatically cleaned up when the request ends
- **Seamless delegation**: Singleton and transient services are resolved through the parent container
- **Metadata support**: Attach arbitrary metadata to request contexts
- **Thread-safe**: Safe to use in concurrent environments with no shared mutable state

## Basic Usage

### Creating and Managing Request Contexts

```typescript
import { Container, Injectable, InjectableScope } from '@navios/di'

const container = new Container()

// Begin a new request context - returns a ScopedContainer
const scoped = container.beginRequest('req-123', { userId: 456 })

// Use the scoped container for this request
const service = await scoped.get(RequestService)

// End the request when done
await scoped.endRequest()
```

### Using Request-Scoped Services

```typescript
import { Injectable, InjectableScope, inject } from '@navios/di'

@Injectable({ scope: InjectableScope.Request })
class RequestLogger {
  private requestId: string

  setRequestId(id: string) {
    this.requestId = id
  }

  log(message: string) {
    console.log(`[${this.requestId}] ${message}`)
  }
}

@Injectable({ scope: InjectableScope.Singleton })
class DatabaseService {
  query(sql: string) {
    return `Result: ${sql}`
  }
}

@Injectable({ scope: InjectableScope.Request })
class RequestHandler {
  private logger = inject(RequestLogger)
  private db = inject(DatabaseService) // Singleton, shared across requests

  async handle() {
    this.logger.log('Processing request')
    return this.db.query('SELECT * FROM users')
  }
}

// Usage
const scoped = container.beginRequest('req-123')
const handler = await scoped.get(RequestHandler)
await handler.handle()
await scoped.endRequest()
```

## ScopedContainer API

The `ScopedContainer` implements the same `IContainer` interface as `Container`:

```typescript
interface IContainer {
  get<T>(token, args?): Promise<T>
  invalidate(service: unknown): Promise<void>
  isRegistered(token): boolean
  dispose(): Promise<void>
  ready(): Promise<void>
  tryGetSync<T>(token, args?): T | null
}
```

### Additional ScopedContainer Methods

```typescript
class ScopedContainer implements IContainer {
  // Get the parent Container
  getParent(): Container

  // Get the request ID
  getRequestId(): string

  // Get metadata value
  getMetadata(key: string): any | undefined

  // Add a pre-prepared instance to the request context
  addInstance(token: InjectionToken<any>, instance: any): void

  // End the request and cleanup all request-scoped services
  endRequest(): Promise<void>
}
```

## Advanced Features

### Pre-prepared Instances

You can add pre-prepared instances to a request context:

```typescript
const REQUEST_TOKEN = InjectionToken.create<{ userId: string }>('RequestData')

const scoped = container.beginRequest('req-123')

// Add a pre-prepared instance
scoped.addInstance(REQUEST_TOKEN, { userId: 'user-456' })

// This will return the pre-prepared instance
const requestData = await scoped.get(REQUEST_TOKEN)
```

### Request Metadata

Request contexts can carry metadata:

```typescript
const scoped = container.beginRequest('req-123', {
  userId: 456,
  traceId: 'abc-123',
  userAgent: 'Mozilla/5.0...',
})

// Access metadata
const userId = scoped.getMetadata('userId') // 456
const traceId = scoped.getMetadata('traceId') // 'abc-123'
```

### Parallel Requests

Multiple requests can run concurrently without interference:

```typescript
// Start multiple requests in parallel
const scoped1 = container.beginRequest('req-1')
const scoped2 = container.beginRequest('req-2')

// Resolve services concurrently - each gets its own instance
const [service1, service2] = await Promise.all([
  scoped1.get(RequestService),
  scoped2.get(RequestService),
])

// service1 !== service2 (different instances)

// Clean up both
await Promise.all([scoped1.endRequest(), scoped2.endRequest()])
```

## Web Framework Integration

### Express.js Example

```typescript
import { Container, Injectable, InjectableScope, inject } from '@navios/di'
import express from 'express'

@Injectable({ scope: InjectableScope.Request })
class RequestHandler {
  private requestId: string = ''

  setContext(req: express.Request) {
    this.requestId = req.headers['x-request-id'] as string
  }

  async handle() {
    return { message: 'Hello!', requestId: this.requestId }
  }
}

const app = express()
const container = new Container()

app.use(async (req, res, next) => {
  const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2)}`

  // Create scoped container for this request
  const scoped = container.beginRequest(requestId, {
    path: req.path,
    method: req.method,
    userAgent: req.get('User-Agent'),
  })

  // Store scoped container on request for later use
  ;(req as any).scoped = scoped

  // Cleanup on response finish
  res.on('finish', async () => {
    await scoped.endRequest()
  })

  next()
})

app.get('/', async (req, res) => {
  const scoped = (req as any).scoped
  const handler = await scoped.get(RequestHandler)
  handler.setContext(req)
  const result = await handler.handle()
  res.json(result)
})
```

### Fastify Example

```typescript
import { Container, Injectable, InjectableScope } from '@navios/di'
import fastify from 'fastify'

const app = fastify()
const container = new Container()

// Type augmentation for request
declare module 'fastify' {
  interface FastifyRequest {
    scoped: ScopedContainer
  }
}

app.addHook('preHandler', async (request, reply) => {
  const requestId = `req-${request.id}`

  request.scoped = container.beginRequest(requestId, {
    ip: request.ip,
    userAgent: request.headers['user-agent'],
  })
})

app.addHook('onResponse', async (request, reply) => {
  if (request.scoped) {
    await request.scoped.endRequest()
  }
})

app.get('/', async (request, reply) => {
  const service = await request.scoped.get(MyRequestService)
  return service.getData()
})
```

## Best Practices

### 1. Always Clean Up

Always ensure request contexts are properly cleaned up:

```typescript
const scoped = container.beginRequest(requestId)

try {
  const service = await scoped.get(RequestService)
  await service.process()
} finally {
  // Always clean up, even on errors
  await scoped.endRequest()
}
```

### 2. Use Meaningful Request IDs

Use descriptive request IDs that help with debugging:

```typescript
const requestId = `${req.method}-${req.path}-${Date.now()}-${Math.random().toString(36).slice(2)}`
const scoped = container.beginRequest(requestId)
```

### 3. Leverage Metadata

Use metadata for cross-cutting concerns:

```typescript
const scoped = container.beginRequest('req-123', {
  traceId: generateTraceId(),
  correlationId: req.headers['x-correlation-id'],
  userId: req.user?.id,
  tenantId: req.tenant?.id,
  startTime: Date.now(),
})
```

### 4. Combine with Lifecycle Hooks

Use lifecycle hooks for request-scoped resource management:

```typescript
@Injectable({ scope: InjectableScope.Request })
class DatabaseTransaction implements OnServiceInit, OnServiceDestroy {
  private transaction: any = null

  async onServiceInit() {
    this.transaction = await db.beginTransaction()
  }

  async onServiceDestroy() {
    if (this.transaction) {
      await this.transaction.rollback()
    }
  }

  async commit() {
    await this.transaction.commit()
    this.transaction = null
  }
}
```

## Error Handling

### Request-Scoped Services from Container

Attempting to resolve a request-scoped service directly from `Container` throws an error:

```typescript
@Injectable({ scope: InjectableScope.Request })
class RequestService {}

// This throws an error!
await container.get(RequestService)
// Error: Cannot resolve request-scoped service "RequestService" from Container.
// Use beginRequest() to create a ScopedContainer for request-scoped services.

// Correct way:
const scoped = container.beginRequest('req-123')
await scoped.get(RequestService) // Works!
```

### Duplicate Request IDs

Each request ID must be unique while the request is active:

```typescript
const scoped1 = container.beginRequest('req-123')

// This throws an error!
const scoped2 = container.beginRequest('req-123')
// Error: Request context "req-123" already exists. Use a unique request ID.

// After ending the first request, the ID can be reused
await scoped1.endRequest()
const scoped3 = container.beginRequest('req-123') // Works!
```

## API Reference

### Container Methods

- `beginRequest(requestId: string, metadata?: Record<string, any>, priority?: number): ScopedContainer` - Creates a new ScopedContainer for the request
- `hasActiveRequest(requestId: string): boolean` - Checks if a request ID is currently active
- `getActiveRequestIds(): ReadonlySet<string>` - Gets all active request IDs

### ScopedContainer Methods

- `get<T>(token, args?): Promise<T>` - Gets a service instance (request-scoped resolved locally, others delegated)
- `invalidate(service: unknown): Promise<void>` - Invalidates a service and its dependents
- `isRegistered(token): boolean` - Checks if a token is registered
- `dispose(): Promise<void>` - Alias for `endRequest()`
- `ready(): Promise<void>` - Waits for pending operations
- `tryGetSync<T>(token, args?): T | null` - Synchronously gets an instance if available
- `getParent(): Container` - Gets the parent Container
- `getRequestId(): string` - Gets the request ID
- `getMetadata(key: string): any` - Gets metadata value
- `addInstance(token, instance): void` - Adds a pre-prepared instance
- `endRequest(): Promise<void>` - Ends the request and cleans up all request-scoped services

## Concurrent Resolution Safety

Request-scoped services have the same locking mechanism as singletons - when multiple concurrent operations request the same service simultaneously, only one instance is created. This prevents duplicate initialization which could cause issues with resources like database connections or sessions.

```typescript
@Injectable({ scope: InjectableScope.Request })
class ExpensiveResource {
  constructor() {
    // Only called once per request, even with concurrent resolution
    console.log('Creating expensive resource')
  }

  async onServiceInit() {
    // Simulate expensive async initialization
    await connectToDatabase()
  }
}

// In a request handler with concurrent operations:
const scoped = container.beginRequest('request-123')

// These run concurrently, but only ONE instance is created
const [resource1, resource2, resource3] = await Promise.all([
  scoped.get(ExpensiveResource),
  scoped.get(ExpensiveResource),
  scoped.get(ExpensiveResource),
])

// resource1 === resource2 === resource3 (same instance)
```

The locking works by:

1. When the first call starts creating a service, it stores a "creating" holder immediately (synchronously, before any async operations)
2. Subsequent concurrent calls find this holder and wait for the creation to complete
3. Once created, all waiting calls receive the same instance

This is handled transparently - no special handling is needed in your code.

### Storage Strategy Pattern

Internally, both Singleton and Request-scoped services use the same unified resolution logic through the `IHolderStorage` interface. This ensures consistent behavior and eliminates code duplication:

- `SingletonHolderStorage` - stores holders in the global ServiceLocatorManager
- `RequestHolderStorage` - stores holders in the ScopedContainer's RequestContextHolder

The storage strategy is automatically selected based on the service's scope.

## Performance Considerations

- `ScopedContainer` instances are lightweight - create one per request
- Request-scoped services are stored in a simple Map per request
- Cleanup is asynchronous but fast - lifecycle hooks run in parallel
- No global state to synchronize - each request is completely isolated
- Concurrent resolution uses async/await locking - minimal overhead compared to creating duplicate instances

## Troubleshooting

### Common Issues

**"Cannot resolve request-scoped service from Container"**: Use `container.beginRequest()` to create a `ScopedContainer` first.

**"Request context already exists"**: Each request needs a unique ID. Generate unique IDs using timestamps or UUIDs.

**Memory leaks**: Always call `endRequest()` to clean up contexts, preferably in a `finally` block or response hook.

**Service not available after request ends**: Request-scoped services are destroyed when `endRequest()` is called. Don't hold references to them after the request.
