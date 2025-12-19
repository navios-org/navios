---
sidebar_position: 1
---

# Services

Services are the foundation of dependency injection in Navios DI. This guide covers everything you need to know about creating and using services.

## What is a Service?

A service is a class that provides functionality to other parts of your application. Services are registered with the DI container and can be injected into other services as dependencies.

## Basic Service Registration

The `@Injectable()` decorator marks a class as a service:

```typescript
import { Injectable } from '@navios/di'

@Injectable()
class EmailService {
  async sendEmail(to: string, subject: string, body: string) {
    console.log(`Sending email to ${to}: ${subject}`)
    return { success: true }
  }
}
```

## Service with Dependencies

Services can depend on other services. Dependencies are automatically resolved:

```typescript
import { inject, Injectable } from '@navios/di'

@Injectable()
class LoggerService {
  log(message: string) {
    console.log(`[LOG] ${message}`)
  }
}

@Injectable()
class EmailService {
  private readonly logger = inject(LoggerService)

  async sendEmail(to: string, subject: string, body: string) {
    this.logger.log(`Sending email to ${to}`)
    // Email sending logic
    return { success: true }
  }
}
```

### ⚠️ Avoid Accessing Services in Constructors

**Important**: Do not access injected services in the constructor. Services can go through initialization twice, which can lead to unexpected behavior. Instead, use lifecycle methods like `onServiceInit()` for initialization logic.

```typescript
import { inject, Injectable, OnServiceInit } from '@navios/di'

// ❌ Avoid: Accessing services in constructor
@Injectable()
class ProblematicService {
  private readonly logger = inject(LoggerService)
  private readonly db = inject(DatabaseService)

  constructor() {
    // ❌ Don't do this - service may not be fully initialized
    this.logger.log('Service created') // May fail or behave unexpectedly
    this.db.query('SELECT 1') // Service might not be ready
  }
}

// ✅ Good: Use lifecycle methods instead
@Injectable()
class CorrectService implements OnServiceInit {
  private readonly logger = inject(LoggerService)
  private readonly db = inject(DatabaseService)

  async onServiceInit() {
    // ✅ All dependencies are fully initialized here
    this.logger.log('Service initialized')
    await this.db.query('SELECT 1')
  }
}
```

## Service Configuration

The `@Injectable()` decorator accepts configuration options:

### Scope Configuration

```typescript
import { Injectable, InjectableScope } from '@navios/di'

// Singleton (default) - one instance shared across the application
@Injectable({ scope: InjectableScope.Singleton })
class SingletonService {}

// Transient - new instance created for each injection
@Injectable({ scope: InjectableScope.Transient })
class TransientService {}

// Request - one instance per request context
@Injectable({ scope: InjectableScope.Request })
class RequestService {}
```

### Custom Injection Token

```typescript
import { Injectable, InjectionToken } from '@navios/di'

const USER_SERVICE_TOKEN = InjectionToken.create<UserService>('UserService')

@Injectable({ token: USER_SERVICE_TOKEN })
class UserService {
  getUsers() {
    return ['Alice', 'Bob']
  }
}
```

### Custom Registry

```typescript
import { Injectable, Registry } from '@navios/di'

const customRegistry = new Registry()

@Injectable({ registry: customRegistry })
class CustomService {}
```

## Injection Methods

Navios DI provides three ways to inject dependencies:

### inject() - Synchronous Injection

Use `inject()` when you need immediate access to a dependency:

```typescript
import { inject, Injectable } from '@navios/di'

@Injectable()
class EmailService {
  sendEmail(to: string, subject: string) {
    return `Email sent to ${to}: ${subject}`
  }
}

@Injectable()
class NotificationService {
  private readonly emailService = inject(EmailService)

  notify(user: string, message: string) {
    // Direct access - no await needed
    return this.emailService.sendEmail(user, `Notification: ${message}`)
  }
}
```

**Important:** The `inject` helper supports all service scopes including Transient. When using `inject` with Transient services, the dependency is tracked for async initialization and will be available in your service methods after initialization completes.

### asyncInject() - Asynchronous Injection

Use `asyncInject()` for explicit async control over dependency resolution:

```typescript
import { asyncInject, Injectable } from '@navios/di'

@Injectable()
class AsyncService {
  private readonly emailService = asyncInject(EmailService)

  async notify(message: string) {
    const emailService = await this.emailService
    return emailService.sendEmail('user@example.com', message)
  }
}
```

**Use cases:**

- Breaking circular dependencies
- When you need explicit async control
- When dependency might not be immediately available

### optional() - Optional Injection

Use `optional()` to inject a dependency only if it's available:

```typescript
import { Injectable, optional } from '@navios/di'

@Injectable()
class FeatureService {
  private readonly analytics = optional(AnalyticsService)

  track(event: string) {
    // Only calls analytics if the service is available
    this.analytics?.track(event)
  }
}
```

## Service with Schema

Services can accept constructor arguments validated by Zod schemas:

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
```

## Service with Multiple Dependencies

Services can depend on multiple other services:

```typescript
import { inject, Injectable } from '@navios/di'

@Injectable()
class LoggerService {
  log(message: string) {
    console.log(`[LOG] ${message}`)
  }
}

@Injectable()
class DatabaseService {
  async query(sql: string) {
    return `Query result: ${sql}`
  }
}

@Injectable()
class CacheService {
  set(key: string, value: any) {
    console.log(`Cache set: ${key}`)
  }

  get(key: string) {
    return `Cached value for ${key}`
  }
}

@Injectable()
class UserService {
  private readonly logger = inject(LoggerService)
  private readonly db = inject(DatabaseService)
  private readonly cache = inject(CacheService)

  async getUser(id: string) {
    this.logger.log(`Getting user ${id}`)

    // Check cache first
    const cached = this.cache.get(`user:${id}`)
    if (cached) {
      return cached
    }

    // Query database
    const user = await this.db.query(`SELECT * FROM users WHERE id = ${id}`)

    // Cache the result
    this.cache.set(`user:${id}`, user)

    return user
  }
}
```

## Service with Lifecycle Hooks

Services can implement lifecycle hooks for initialization and cleanup:

```typescript
import { Injectable, OnServiceDestroy, OnServiceInit } from '@navios/di'

@Injectable()
class DatabaseService implements OnServiceInit, OnServiceDestroy {
  private connection: any = null

  async onServiceInit() {
    console.log('Initializing database connection...')
    this.connection = await this.connect()
    console.log('Database connected successfully')
  }

  async onServiceDestroy() {
    console.log('Closing database connection...')
    if (this.connection) {
      await this.connection.close()
      console.log('Database connection closed')
    }
  }

  private async connect() {
    // Database connection logic
    return new Promise((resolve) => {
      setTimeout(() => resolve({ connected: true }), 100)
    })
  }

  async query(sql: string) {
    if (!this.connection) {
      throw new Error('Database not connected')
    }
    return `Query result: ${sql}`
  }
}
```

## Using Services

### Getting Services from Container

```typescript
import { Container } from '@navios/di'

const container = new Container()
const userService = await container.get(UserService)
await userService.getUser('123')
```

### Getting Services with Arguments

```typescript
const config = await container.get(DatabaseConfig, {
  host: 'localhost',
  port: 5432,
  username: 'admin',
  password: 'secret',
})
```

## Best Practices

### 1. Use Appropriate Injection Method

```typescript
// ✅ Good: Use inject for singleton dependencies
@Injectable()
class UserService {
  private readonly logger = inject(LoggerService)

  getUser(id: string) {
    this.logger.log(`Getting user ${id}`)
    // ...
  }
}

// ✅ Good: Use inject or asyncInject for transient dependencies
@Injectable()
class RequestService {
  private readonly transientService = inject(TransientService)

  async handleRequest() {
    return this.transientService.process()
  }
}
```

### 2. Prefer Singleton for Stateless Services

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

### 3. Use Injection Tokens for Interfaces

```typescript
// ✅ Good: Use injection tokens for interfaces
interface PaymentProcessor {
  processPayment(amount: number): Promise<string>
}

const PAYMENT_PROCESSOR_TOKEN =
  InjectionToken.create<PaymentProcessor>('PaymentProcessor')

@Injectable({ token: PAYMENT_PROCESSOR_TOKEN })
class StripePaymentProcessor implements PaymentProcessor {
  async processPayment(amount: number) {
    return `Processed $${amount} via Stripe`
  }
}
```

### 4. Avoid Accessing Services in Constructors

**Critical**: Never access injected services in constructors. Services can be initialized multiple times, and dependencies may not be fully ready. Use `onServiceInit()` for initialization logic instead.

```typescript
import { inject, Injectable, OnServiceInit } from '@navios/di'

// ❌ Avoid: Constructor access
@Injectable()
class BadService {
  private readonly logger = inject(LoggerService)

  constructor() {
    this.logger.log('Initializing...') // ❌ Service may not be ready
  }
}

// ✅ Good: Use lifecycle hooks
@Injectable()
class GoodService implements OnServiceInit {
  private readonly logger = inject(LoggerService)

  async onServiceInit() {
    // ✅ All dependencies are guaranteed to be ready
    this.logger.log('Initializing...')
  }
}
```

### 5. Implement Lifecycle Hooks for Resource Management

```typescript
// ✅ Good: Proper resource management
@Injectable()
class DatabaseService implements OnServiceInit, OnServiceDestroy {
  private connection: any = null

  async onServiceInit() {
    this.connection = await this.connect()
  }

  async onServiceDestroy() {
    if (this.connection) {
      await this.connection.close()
    }
  }
}
```

## Common Patterns

### Configuration Service

```typescript
import { Injectable, InjectionToken } from '@navios/di'

import { z } from 'zod'

const configSchema = z.object({
  apiUrl: z.string(),
  timeout: z.number(),
  retries: z.number().optional(),
})

const CONFIG_TOKEN = InjectionToken.create<ConfigService, typeof configSchema>(
  'APP_CONFIG',
  configSchema,
)

@Injectable({ token: CONFIG_TOKEN })
class ConfigService {
  constructor(private config: z.infer<typeof configSchema>) {}

  getApiUrl() {
    return this.config.apiUrl
  }

  getTimeout() {
    return this.config.timeout
  }

  getRetries() {
    return this.config.retries ?? 3
  }
}
```

### Repository Pattern

```typescript
@Injectable()
class UserRepository {
  private readonly db = inject(DatabaseService)

  async findById(id: string) {
    return this.db.query(`SELECT * FROM users WHERE id = ${id}`)
  }

  async create(userData: any) {
    return this.db.query(`INSERT INTO users VALUES ${JSON.stringify(userData)}`)
  }
}
```

## Error Handling

### Common Errors

```typescript
import { inject, Injectable } from '@navios/di'

@Injectable()
class ProblematicService {
  // Error: NonExistentService is not registered
  private readonly nonExistentService = inject(NonExistentService)
}
```

### Proper Error Handling

```typescript
import { inject, Injectable } from '@navios/di'

@Injectable()
class SafeService {
  private readonly optionalService = asyncInject(OptionalService).catch(
    () => null,
  )

  async doSomething() {
    try {
      const service = await this.optionalService
      if (service) {
        return service.doSomething()
      }
      return 'Service not available'
    } catch (error) {
      console.error('Error accessing service:', error)
      return 'Error occurred'
    }
  }
}
```

## Next Steps

- Learn about [factories](/docs/di/di/guides/factories) for complex object creation
- Explore [injection tokens](/docs/di/di/guides/injection-tokens) for flexible resolution
- Understand [scopes](/docs/di/di/guides/scopes) for service lifetime management
- Implement [lifecycle hooks](/docs/di/di/guides/lifecycle) for resource management
