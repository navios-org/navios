# Service Scopes

Service scopes determine the lifetime and sharing behavior of service instances in Navios DI. Understanding scopes is crucial for managing resources efficiently and avoiding common pitfalls.

## Overview

Navios DI supports three service scopes:

- **Singleton**: One instance shared across the entire application
- **Transient**: New instance created for each injection
- **Request**: One instance shared within a request context, isolated between requests

## Singleton Scope

Singleton is the default scope. A single instance is created and shared across all injections.

### Basic Usage

```typescript
import { Injectable, InjectableScope } from '@navios/di'

// Explicit singleton (default)
@Injectable({ scope: InjectableScope.Singleton })
class DatabaseService {
  private connection: any = null

  async connect() {
    if (!this.connection) {
      this.connection = await this.createConnection()
    }
    return this.connection
  }

  private async createConnection() {
    console.log('Creating database connection...')
    return { connected: true, id: Math.random() }
  }
}

// Implicit singleton (same as above)
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
```

### Singleton Behavior

```typescript
import { Container } from '@navios/di'

const container = new Container()

// All these calls return the same instance
const db1 = await container.get(DatabaseService)
const db2 = await container.get(DatabaseService)
const db3 = await container.get(DatabaseService)

console.log(db1 === db2) // true
console.log(db2 === db3) // true
console.log(db1 === db3) // true
```

### Singleton with Dependencies

```typescript
import { inject, Injectable } from '@navios/di'

@Injectable()
class LoggerService {
  private logs: string[] = []

  log(message: string) {
    this.logs.push(message)
    console.log(`[LOG] ${message}`)
  }

  getLogs() {
    return [...this.logs]
  }
}

@Injectable()
class UserService {
  private readonly logger = inject(LoggerService)

  createUser(name: string) {
    this.logger.log(`Creating user: ${name}`)
    return { id: Math.random().toString(36), name }
  }
}

@Injectable()
class OrderService {
  private readonly logger = inject(LoggerService)

  createOrder(userId: string) {
    this.logger.log(`Creating order for user: ${userId}`)
    return { id: Math.random().toString(36), userId }
  }
}

// Usage
const container = new Container()
const userService = await container.get(UserService)
const orderService = await container.get(OrderService)

const user = userService.createUser('Alice')
const order = orderService.createOrder(user.id)

// Both services share the same logger instance
const logger = await container.get(LoggerService)
console.log(logger.getLogs()) // Contains logs from both services
```

## Transient Scope

Transient scope creates a new instance for each injection request.

### Basic Usage

```typescript
import { Injectable, InjectableScope } from '@navios/di'

@Injectable({ scope: InjectableScope.Transient })
class RequestService {
  private readonly requestId = Math.random().toString(36)
  private readonly createdAt = new Date()

  getRequestId() {
    return this.requestId
  }

  getCreatedAt() {
    return this.createdAt
  }
}
```

### Transient Behavior

```typescript
import { Container } from '@navios/di'

const container = new Container()

// Each call creates a new instance
const req1 = await container.get(RequestService)
const req2 = await container.get(RequestService)
const req3 = await container.get(RequestService)

console.log(req1 === req2) // false
console.log(req2 === req3) // false
console.log(req1 === req3) // false

console.log(req1.getRequestId()) // Different ID
console.log(req2.getRequestId()) // Different ID
console.log(req3.getRequestId()) // Different ID
```

### Transient with Dependencies

```typescript
import { inject, Injectable, InjectableScope } from '@navios/di'

@Injectable()
class LoggerService {
  log(message: string) {
    console.log(`[LOG] ${message}`)
  }
}

@Injectable({ scope: InjectableScope.Transient })
class RequestHandler {
  private readonly logger = inject(LoggerService)
  private readonly requestId = Math.random().toString(36)

  async handleRequest() {
    // Logger is available in async methods
    this.logger.log(`Handling request ${this.requestId}`)
    return { requestId: this.requestId, status: 'processed' }
  }
}

// Usage
const container = new Container()
const handler1 = await container.get(RequestHandler)
const handler2 = await container.get(RequestHandler)

const result1 = await handler1.handleRequest()
const result2 = await handler2.handleRequest()

console.log(result1.requestId) // Different ID
console.log(result2.requestId) // Different ID
```

## Request Scope

Request scope creates one instance per request context and shares it within that request. This is ideal for web applications where you need request-specific data that should be isolated between different requests.

### Basic Usage

```typescript
import { Injectable, InjectableScope } from '@navios/di'

@Injectable({ scope: InjectableScope.Request })
class RequestContext {
  private readonly requestId = Math.random().toString(36)
  private readonly startTime = Date.now()
  userId?: string

  getRequestId() {
    return this.requestId
  }

  getDuration() {
    return Date.now() - this.startTime
  }
}
```

### Request Context Management

Request-scoped services require using `ScopedContainer`, which is created via `container.beginRequest()`:

```typescript
import { Container } from '@navios/di'

const container = new Container()

// Begin a request context - returns a ScopedContainer
const scopedContainer = container.beginRequest('req-123', { userId: 'user123' })

// All injections within this request will share the same Request-scoped instances
const context1 = await scopedContainer.get(RequestContext)
const context2 = await scopedContainer.get(RequestContext)

console.log(context1 === context2) // true - same instance within request

// Access metadata
const userId = scopedContainer.getMetadata('userId')

// End the request context (cleans up all request-scoped instances)
await scopedContainer.endRequest()
```

**Important**: You cannot resolve request-scoped services directly from the main `Container`. Attempting to do so will throw an error:

```typescript
// ❌ This will throw an error
const context = await container.get(RequestContext)
// Error: Cannot resolve request-scoped service from Container

// ✅ Use ScopedContainer instead
const scoped = container.beginRequest('req-123')
const context = await scoped.get(RequestContext)
```

### Request Scope with Dependencies

```typescript
import { inject, Injectable, InjectableScope } from '@navios/di'

@Injectable()
class LoggerService {
  log(message: string) {
    console.log(`[LOG] ${message}`)
  }
}

@Injectable({ scope: InjectableScope.Request })
class UserSession {
  private readonly logger = inject(LoggerService)
  private readonly sessionId = Math.random().toString(36)
  userId?: string

  logActivity(activity: string) {
    this.logger.log(`User ${this.userId}: ${activity}`)
  }

  getSessionId() {
    return this.sessionId
  }
}

@Injectable({ scope: InjectableScope.Request })
class OrderService {
  private readonly userSession = inject(UserSession)
  private orders: string[] = []

  createOrder(productName: string) {
    const orderId = `order_${Math.random().toString(36)}`

    this.orders.push(orderId)
    this.userSession.logActivity(`Created order ${orderId} for ${productName}`)

    return { orderId, sessionId: this.userSession.getSessionId() }
  }
}
```

### Multiple Concurrent Requests

Each request gets its own isolated `ScopedContainer`:

```typescript
const container = new Container()

// Start multiple concurrent requests
const scoped1 = container.beginRequest('req-1', { userId: 'user1' })
const scoped2 = container.beginRequest('req-2', { userId: 'user2' })

// Each scoped container has its own request-scoped instances
const context1 = await scoped1.get(RequestContext)
const context2 = await scoped2.get(RequestContext)

// Different instances for different requests
console.log(context1 !== context2) // true

// Singletons are shared across all requests
const logger1 = await scoped1.get(LoggerService)
const logger2 = await scoped2.get(LoggerService)
console.log(logger1 === logger2) // true - same singleton

// Clean up each request independently
await scoped1.endRequest()
await scoped2.endRequest()
```

### Cross-Storage Dependency Invalidation

When a request-scoped service is destroyed (via `endRequest()`), any singleton services that depend on it are automatically invalidated:

```typescript
@Injectable({ scope: InjectableScope.Request })
class RequestData {
  data = 'request-specific'
}

@Injectable({ scope: InjectableScope.Singleton })
class SingletonConsumer {
  private requestData = inject(RequestData)

  getData() {
    return this.requestData.data
  }
}

const container = new Container()
const scoped = container.beginRequest('req-1')

const singleton = await scoped.get(SingletonConsumer)
await singleton.getData() // Works fine

await scoped.endRequest()
// SingletonConsumer is also invalidated because it depends on RequestData

// Next request gets fresh instances
const scoped2 = container.beginRequest('req-2')
const singleton2 = await scoped2.get(SingletonConsumer)
console.log(singleton !== singleton2) // true - new instance
```

## Scope Compatibility

### Injection Method Compatibility

| Scope     | inject                              | asyncInject  |
| --------- | ----------------------------------- | ------------ |
| Singleton | ✅ Supported                        | ✅ Supported |
| Transient | ✅ Supported (async initialization) | ✅ Supported |
| Request   | ✅ Supported                        | ✅ Supported |

### Using inject with Transient Services

The `inject` helper now supports Transient services through automatic async initialization tracking. When you use `inject` with a Transient service, the DI system tracks the async dependencies and ensures they're resolved before the service is fully initialized.

```typescript
@Injectable({ scope: InjectableScope.Transient })
class TransientService {
  async onServiceInit() {
    console.log('Transient service initialized')
  }
}

@Injectable()
class ConsumerService {
  // ✅ This now works! The inject helper tracks async initialization
  private readonly service = inject(TransientService)

  async doSomething() {
    // The service will be available after initialization completes
    this.service.someMethod()
  }
}

// ✅ You can still use asyncInject for explicit async access
@Injectable()
class ConsumerService {
  private readonly service = asyncInject(TransientService)

  async doSomething() {
    const service = await this.service
    service.someMethod()
  }
}
```

**Important Notes:**
- When using `inject` with Transient services, the dependency won't be immediately available during constructor execution
- Access the service only in async methods or after the service initialization completes
- For synchronous access during construction, use `asyncInject` and await it explicitly

## Real-World Examples

### Singleton: Database Connection Pool

```typescript
import { Injectable, OnServiceDestroy, OnServiceInit } from '@navios/di'

@Injectable({ scope: InjectableScope.Singleton })
class DatabasePool implements OnServiceInit, OnServiceDestroy {
  private connections: any[] = []
  private maxConnections = 10

  async onServiceInit() {
    console.log('Initializing database connection pool...')
    // Initialize connection pool
    for (let i = 0; i < this.maxConnections; i++) {
      this.connections.push({ id: i, busy: false })
    }
    console.log(`Pool initialized with ${this.maxConnections} connections`)
  }

  async onServiceDestroy() {
    console.log('Closing database connection pool...')
    this.connections = []
  }

  async getConnection() {
    const available = this.connections.find((conn) => !conn.busy)
    if (!available) {
      throw new Error('No available connections')
    }

    available.busy = true
    console.log(`Using connection ${available.id}`)
    return available
  }

  releaseConnection(connection: any) {
    connection.busy = false
    console.log(`Released connection ${connection.id}`)
  }
}
```

### Transient: Request Context

```typescript
import { inject, Injectable, InjectableScope } from '@navios/di'

@Injectable({ scope: InjectableScope.Transient })
class RequestContext {
  private readonly requestId = Math.random().toString(36)
  private readonly startTime = Date.now()
  private readonly userAgent: string
  private readonly ip: string

  constructor(userAgent: string, ip: string) {
    this.userAgent = userAgent
    this.ip = ip
  }

  getRequestId() {
    return this.requestId
  }

  getDuration() {
    return Date.now() - this.startTime
  }

  getUserAgent() {
    return this.userAgent
  }

  getIp() {
    return this.ip
  }
}

@Injectable()
class RequestHandler {
  private readonly context = inject(RequestContext)

  async handleRequest() {
    console.log(
      `Handling request ${this.context.getRequestId()} from ${this.context.getIp()}`,
    )

    // Process request...

    console.log(
      `Request ${this.context.getRequestId()} completed in ${this.context.getDuration()}ms`,
    )
  }
}
```

### Mixed Scopes

```typescript
import { inject, Injectable, InjectableScope } from '@navios/di'

// Singleton services
@Injectable()
class ConfigService {
  getConfig() {
    return { apiUrl: 'https://api.example.com', timeout: 5000 }
  }
}

@Injectable()
class LoggerService {
  log(message: string) {
    console.log(`[LOG] ${new Date().toISOString()} - ${message}`)
  }
}

// Transient service
@Injectable({ scope: InjectableScope.Transient })
class UserSession {
  private readonly sessionId = Math.random().toString(36)
  private readonly userId: string

  constructor(userId: string) {
    this.userId = userId
  }

  getSessionId() {
    return this.sessionId
  }

  getUserId() {
    return this.userId
  }
}

// Service using both scopes
@Injectable()
class UserService {
  private readonly config = inject(ConfigService) // Singleton
  private readonly logger = inject(LoggerService) // Singleton
  private readonly session = inject(UserSession) // Transient (with async initialization)

  async authenticateUser(userId: string) {
    this.logger.log(`Authenticating user ${userId}`)

    this.logger.log(
      `Created session ${this.session.getSessionId()} for user ${userId}`,
    )

    return {
      userId,
      sessionId: this.session.getSessionId(),
      apiUrl: this.config.getConfig().apiUrl,
    }
  }
}
```

## Best Practices

### 1. Use Singleton for Stateless Services

```typescript
// ✅ Good: Stateless service as singleton
@Injectable({ scope: InjectableScope.Singleton })
class EmailService {
  async sendEmail(to: string, subject: string, body: string) {
    // No state, safe to share
    return await this.sendViaProvider(to, subject, body)
  }
}

// ❌ Avoid: Stateful service as singleton
@Injectable({ scope: InjectableScope.Singleton })
class UserSessionService {
  private currentUser: User | null = null // State!

  setCurrentUser(user: User) {
    this.currentUser = user // Shared state can cause issues
  }
}
```

### 2. Use Transient for Stateful Services

```typescript
// ✅ Good: Stateful service as transient
@Injectable({ scope: InjectableScope.Transient })
class UserSession {
  private readonly userId: string
  private readonly sessionId: string
  private readonly createdAt: Date

  constructor(userId: string) {
    this.userId = userId
    this.sessionId = Math.random().toString(36)
    this.createdAt = new Date()
  }

  getUserId() {
    return this.userId
  }
}
```

### 3. Use Singleton for Expensive Resources

```typescript
// ✅ Good: Expensive resource as singleton
@Injectable({ scope: InjectableScope.Singleton })
class DatabaseConnection {
  private connection: any = null

  async getConnection() {
    if (!this.connection) {
      // Expensive operation - only do once
      this.connection = await this.createConnection()
    }
    return this.connection
  }
}
```

### 4. Use Transient for Request-Specific Data

```typescript
// ✅ Good: Request-specific data as transient
@Injectable({ scope: InjectableScope.Transient })
class RequestContext {
  private readonly requestId: string
  private readonly startTime: number
  private readonly headers: Record<string, string>

  constructor(headers: Record<string, string>) {
    this.requestId = Math.random().toString(36)
    this.startTime = Date.now()
    this.headers = headers
  }
}
```

### 5. Consider Performance Implications

```typescript
// ✅ Good: Lightweight transient service
@Injectable({ scope: InjectableScope.Transient })
class RequestIdGenerator {
  generate() {
    return Math.random().toString(36)
  }
}

// ❌ Avoid: Heavy transient service
@Injectable({ scope: InjectableScope.Transient })
class HeavyService {
  constructor() {
    // Heavy initialization for each instance
    this.initializeExpensiveResources()
  }
}
```

## Common Pitfalls

### 1. State Leakage in Singletons

```typescript
// ❌ Problem: State leakage
@Injectable({ scope: InjectableScope.Singleton })
class CacheService {
  private cache = new Map()

  set(key: string, value: any) {
    this.cache.set(key, value)
  }

  get(key: string) {
    return this.cache.get(key)
  }

  // Problem: Cache persists across requests
  clear() {
    this.cache.clear()
  }
}

// ✅ Solution: Use transient for request-scoped cache
@Injectable({ scope: InjectableScope.Transient })
class RequestCache {
  private cache = new Map()

  set(key: string, value: any) {
    this.cache.set(key, value)
  }

  get(key: string) {
    return this.cache.get(key)
  }
}
```

### 2. Accessing Transient Services Too Early

```typescript
// ❌ Problem: Accessing transient service during construction
@Injectable({ scope: InjectableScope.Transient })
class TransientService {
  getData() {
    return 'data'
  }
}

@Injectable()
class ConsumerService {
  private readonly service = inject(TransientService)

  constructor() {
    // Error: Service not initialized yet during construction!
    console.log(this.service.getData())
  }
}

// ✅ Solution 1: Access in async methods after initialization
@Injectable()
class ConsumerService {
  private readonly service = inject(TransientService)

  async doSomething() {
    // Service is available in methods
    console.log(this.service.getData())
  }
}

// ✅ Solution 2: Use asyncInject for explicit control
@Injectable()
class ConsumerService {
  private readonly service = asyncInject(TransientService)

  async doSomething() {
    const service = await this.service
    console.log(service.getData())
  }
}
```

### 3. Memory Leaks with Transient Services

```typescript
// ❌ Problem: Transient service holding references
@Injectable({ scope: InjectableScope.Transient })
class TransientService {
  private listeners: Function[] = []

  addListener(listener: Function) {
    this.listeners.push(listener)
  }

  // Problem: Listeners are never cleaned up
}

// ✅ Solution: Implement cleanup
@Injectable({ scope: InjectableScope.Transient })
class TransientService implements OnServiceDestroy {
  private listeners: Function[] = []

  addListener(listener: Function) {
    this.listeners.push(listener)
  }

  async onServiceDestroy() {
    this.listeners = []
  }
}
```

## API Reference

### InjectableScope Enum

```typescript
enum InjectableScope {
  Singleton = 'Singleton', // One instance shared across the application
  Transient = 'Transient', // New instance created for each injection
  Request = 'Request', // One instance shared within a request context
}
```

### Scope Configuration

```typescript
@Injectable({ scope: InjectableScope.Singleton })
class SingletonService {}

@Injectable({ scope: InjectableScope.Transient })
class TransientService {}

@Injectable({ scope: InjectableScope.Request })
class RequestService {}
```
