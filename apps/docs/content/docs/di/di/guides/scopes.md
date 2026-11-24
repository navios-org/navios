---
sidebar_position: 4
---

# Scopes

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
  getValue() {
    return Math.random()
  }
}

@Injectable()
class ConsumerService {
  // ✅ This now works! The inject helper tracks async initialization
  private readonly service = inject(TransientService)

  async doSomething() {
    // The service will be available after initialization completes
    this.service.getValue()
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
import {
  Injectable,
  InjectableScope,
  OnServiceDestroy,
  OnServiceInit,
} from '@navios/di'

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
}
```

## Best Practices

### 1. Use Singleton for Stateless Services

```typescript
// ✅ Good: Stateless service as singleton
@Injectable({ scope: InjectableScope.Singleton })
class EmailService {
  async sendEmail(to: string, subject: string) {
    // No state, safe to share
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
}
```

### 3. Use Request Scope for Request-Specific Data

```typescript
// ✅ Good: Request-specific data as request scope
@Injectable({ scope: InjectableScope.Request })
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

## Next Steps

- Learn about [request contexts](/docs/di/di/guides/request-contexts) for request-scoped services
- Explore [lifecycle hooks](/docs/di/di/guides/lifecycle) for resource management
- Understand [services](/docs/di/di/guides/services) for service creation
