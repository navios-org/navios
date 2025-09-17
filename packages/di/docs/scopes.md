# Service Scopes

Service scopes determine the lifetime and sharing behavior of service instances in Navios DI. Understanding scopes is crucial for managing resources efficiently and avoiding common pitfalls.

## Overview

Navios DI supports two service scopes:

- **Singleton**: One instance shared across the entire application
- **Transient**: New instance created for each injection

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
    const logger = await this.logger
    logger.log(`Handling request ${this.requestId}`)
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

## Scope Compatibility

### Injection Method Compatibility

| Scope     | inject           | asyncInject  |
| --------- | ---------------- | ------------ |
| Singleton | ✅ Supported     | ✅ Supported |
| Transient | ❌ Not Supported | ✅ Supported |

### Why inject Doesn't Work with Transient

```typescript
// ❌ This will cause an error
@Injectable({ scope: InjectableScope.Transient })
class TransientService {}

@Injectable()
class ConsumerService {
  private readonly service = inject(TransientService)
  // Error: Cannot use inject with transient services
}

// ✅ Use inject instead
@Injectable()
class ConsumerService {
  private readonly service = asyncInject(TransientService)

  async doSomething() {
    const service = await this.service
    // Use the service
  }
}
```

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
import { Injectable, InjectableScope } from '@navios/di'

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
  private readonly context = asyncInject(RequestContext)

  async handleRequest() {
    const ctx = await this.context
    console.log(`Handling request ${ctx.getRequestId()} from ${ctx.getIp()}`)

    // Process request...

    console.log(
      `Request ${ctx.getRequestId()} completed in ${ctx.getDuration()}ms`,
    )
  }
}
```

### Mixed Scopes

```typescript
import { asyncInject, inject, Injectable, InjectableScope } from '@navios/di'

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
  private readonly session = asyncInject(UserSession) // Transient

  async authenticateUser(userId: string) {
    this.logger.log(`Authenticating user ${userId}`)

    const session = await this.session
    this.logger.log(
      `Created session ${session.getSessionId()} for user ${userId}`,
    )

    return {
      userId,
      sessionId: session.getSessionId(),
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

### 2. Incorrect Injection Method

```typescript
// ❌ Problem: Using inject with transient
@Injectable({ scope: InjectableScope.Transient })
class TransientService {}

@Injectable()
class ConsumerService {
  private readonly service = inject(TransientService)
  // Error: Cannot use inject with transient services
}

// ✅ Solution: Use asyncInject with transient
@Injectable()
class ConsumerService {
  private readonly service = asyncInject(TransientService)

  async doSomething() {
    const service = await this.service
    // Use the service
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
}
```

### Scope Configuration

```typescript
@Injectable({ scope: InjectableScope.Singleton })
class SingletonService {}

@Injectable({ scope: InjectableScope.Transient })
class TransientService {}
```
