# Request Contexts

Request contexts in Navios DI provide a powerful way to manage request-scoped services with automatic cleanup and priority-based resolution. This is particularly useful in web applications where you need to maintain request-specific data and ensure proper cleanup after each request.

## Overview

A request context is a scoped container that can hold pre-prepared instances and metadata for a specific request. When a request context is active, services can access request-specific data through dependency injection.

### Key Features

- **Request-scoped instances**: Services that exist only for the duration of a request
- **Automatic cleanup**: All request-scoped instances are automatically cleaned up when the request ends
- **Priority-based resolution**: Multiple contexts can exist with different priorities
- **Metadata support**: Attach arbitrary metadata to request contexts
- **Thread-safe**: Safe to use in concurrent environments

## Basic Usage

### Creating and Managing Request Contexts

```typescript
import { Container, Injectable, InjectionToken } from '@navios/di'

const container = new Container()

// Begin a new request context
const context = container.beginRequest('req-123', { userId: 456 }, 100)

// Set it as the current context
container.setCurrentRequestContext('req-123')

// End the request context when done
await container.endRequest('req-123')
```

### Using Request-Scoped Data

```typescript
const REQUEST_ID_TOKEN = InjectionToken.create<string>('REQUEST_ID')
const USER_ID_TOKEN = InjectionToken.create<number>('USER_ID')

@Injectable()
class RequestLogger {
  private readonly requestId = asyncInject(REQUEST_ID_TOKEN)
  private readonly userId = asyncInject(USER_ID_TOKEN)

  async log(message: string) {
    const reqId = await this.requestId
    const uid = await this.userId
    console.log(`[${reqId}] User ${uid}: ${message}`)
  }
}

// Setup request context
const context = container.beginRequest('req-123')
context.addInstance(REQUEST_ID_TOKEN, 'req-123')
context.addInstance(USER_ID_TOKEN, 456)

container.setCurrentRequestContext('req-123')

// Use the service
const logger = await container.get(RequestLogger)
await logger.log('Processing request') // "[req-123] User 456: Processing request"
```

## Advanced Features

### Priority-Based Resolution

When multiple request contexts exist, the one with the highest priority is used:

```typescript
// High priority context (e.g., admin request)
const adminContext = container.beginRequest('admin-req', {}, 200)

// Normal priority context
const userContext = container.beginRequest('user-req', {}, 100)

// Admin context will be used due to higher priority
container.setCurrentRequestContext('admin-req')
```

### Request Metadata

Request contexts can carry metadata that services can access:

```typescript
@Injectable()
class AuditService {
  private readonly context = asyncInject(Container)

  async logAction(action: string) {
    const container = await this.context
    const requestContext = container.getCurrentRequestContext()

    if (requestContext) {
      const userId = requestContext.getMetadata('userId')
      const traceId = requestContext.getMetadata('traceId')

      console.log(`User ${userId} performed ${action} (trace: ${traceId})`)
    }
  }
}

// Setup with metadata
const context = container.beginRequest('req-123', {
  userId: 456,
  traceId: 'abc-123',
  userAgent: 'Mozilla/5.0...',
})
```

### Pre-prepared Instances

You can add pre-prepared instances to a request context:

```typescript
@Injectable()
class DatabaseConnection {
  constructor(private connectionString: string) {}

  async query(sql: string) {
    return `Executing: ${sql} on ${this.connectionString}`
  }
}

// Create a request-specific database connection
const dbConnection = new DatabaseConnection('user-specific-db')
const context = container.beginRequest('req-123')
context.addInstance('DatabaseConnection', dbConnection)
```

## Web Framework Integration

### Express.js Example

```typescript
import { Container, Injectable, InjectionToken } from '@navios/di'

import express from 'express'

const REQUEST_TOKEN = InjectionToken.create<express.Request>('REQUEST')
const RESPONSE_TOKEN = InjectionToken.create<express.Response>('RESPONSE')

@Injectable()
class RequestHandler {
  private readonly req = asyncInject(REQUEST_TOKEN)
  private readonly res = asyncInject(RESPONSE_TOKEN)

  async handleRequest() {
    const request = await this.req
    const response = await this.res

    response.json({
      message: 'Hello!',
      path: request.path,
      method: request.method,
    })
  }
}

const app = express()
const container = new Container()

app.use('*', async (req, res, next) => {
  const requestId = `req-${Date.now()}-${Math.random()}`

  // Create request context
  const context = container.beginRequest(requestId, {
    path: req.path,
    method: req.method,
    userAgent: req.get('User-Agent'),
  })

  // Add request-specific instances
  context.addInstance(REQUEST_TOKEN, req)
  context.addInstance(RESPONSE_TOKEN, res)

  // Set as current context
  container.setCurrentRequestContext(requestId)

  try {
    const handler = await container.get(RequestHandler)
    await handler.handleRequest()
  } finally {
    // Clean up request context
    await container.endRequest(requestId)
  }
})
```

### Fastify Example

```typescript
import { Container, Injectable, InjectionToken } from '@navios/di'

import fastify from 'fastify'

const REQUEST_TOKEN = InjectionToken.create<any>('FASTIFY_REQUEST')

const app = fastify()
const container = new Container()

app.addHook('preHandler', async (request, reply) => {
  const requestId = `req-${request.id}`

  const context = container.beginRequest(requestId, {
    ip: request.ip,
    userAgent: request.headers['user-agent'],
  })

  context.addInstance(REQUEST_TOKEN, request)
  container.setCurrentRequestContext(requestId)

  // Store requestId for cleanup
  request.requestId = requestId
})

app.addHook('onResponse', async (request, reply) => {
  if (request.requestId) {
    await container.endRequest(request.requestId)
  }
})
```

## Best Practices

### 1. Always Clean Up

Always ensure request contexts are properly cleaned up:

```typescript
const requestId = generateRequestId()
const context = container.beginRequest(requestId)

try {
  // Process request
  await processRequest()
} finally {
  // Always clean up, even on errors
  await container.endRequest(requestId)
}
```

### 2. Use Meaningful Request IDs

Use descriptive request IDs that help with debugging:

```typescript
const requestId = `${req.method}-${req.path}-${Date.now()}-${Math.random().toString(36).slice(2)}`
```

### 3. Set Appropriate Priorities

Use priorities to ensure correct resolution order:

```typescript
// System/admin requests - highest priority
const adminContext = container.beginRequest('admin-req', {}, 1000)

// Authenticated user requests
const userContext = container.beginRequest('user-req', {}, 500)

// Anonymous requests - lowest priority
const anonContext = container.beginRequest('anon-req', {}, 100)
```

### 4. Leverage Metadata

Use metadata for cross-cutting concerns:

```typescript
const context = container.beginRequest('req-123', {
  traceId: generateTraceId(),
  correlationId: req.headers['x-correlation-id'],
  userId: req.user?.id,
  tenantId: req.tenant?.id,
  startTime: Date.now(),
})
```

### 5. Combine with Lifecycle Hooks

Use lifecycle hooks for request-scoped resource management:

```typescript
@Injectable()
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
  }
}
```

## Error Handling

Request contexts handle errors gracefully:

```typescript
try {
  const context = container.beginRequest('req-123')
  container.setCurrentRequestContext('req-123')

  // If this throws, cleanup will still happen
  await processRequest()
} catch (error) {
  console.error('Request failed:', error)
  throw error
} finally {
  // Context cleanup happens automatically
  await container.endRequest('req-123')
}
```

## API Reference

### Container Methods

- `beginRequest(requestId: string, metadata?: Record<string, any>, priority?: number): RequestContextHolder`
- `endRequest(requestId: string): Promise<void>`
- `getCurrentRequestContext(): RequestContextHolder | null`
- `setCurrentRequestContext(requestId: string): void`

### RequestContextHolder Interface

- `requestId: string` - Unique identifier for this request
- `priority: number` - Priority for resolution
- `metadata: Map<string, any>` - Request-specific metadata
- `createdAt: number` - Timestamp when context was created
- `addInstance(token: InjectionToken<any>, instance: any): void`
- `getMetadata(key: string): any | undefined`
- `setMetadata(key: string, value: any): void`
- `clear(): void` - Clear all instances and metadata

## Performance Considerations

- Request contexts are lightweight and designed for high-throughput scenarios
- Cleanup is asynchronous and won't block request processing
- Use appropriate priorities to avoid unnecessary context switching
- Consider pooling request contexts for very high-frequency scenarios

## Troubleshooting

### Common Issues

**Context not found**: Make sure you've called `setCurrentRequestContext()` before accessing request-scoped services.

**Wrong priority resolution**: Check that your priority values are set correctly (higher = more priority).

**Memory leaks**: Always call `endRequest()` to clean up contexts, preferably in a `finally` block.

**Service not found in context**: Ensure you've added the instance to the context with `addInstance()`.
