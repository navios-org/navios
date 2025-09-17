# Injectable Decorator

The `@Injectable` decorator is the primary way to mark classes as injectable services in Navios DI. It registers the class with the dependency injection container and makes it available for injection into other services.

## Basic Usage

### Simple Service Registration

```typescript
import { Injectable } from '@navios/di'

@Injectable()
class UserService {
  getUsers() {
    return ['Alice', 'Bob', 'Charlie']
  }
}
```

### Service with Dependencies

```typescript
import { Injectable, syncInject } from '@navios/di'

@Injectable()
class DatabaseService {
  async connect() {
    return 'Connected to database'
  }
}

@Injectable()
class UserService {
  private readonly db = syncInject(DatabaseService)

  async getUsers() {
    const connection = await this.db.connect()
    return `Users from ${connection}`
  }
}
```

## Configuration Options

The `@Injectable` decorator accepts an options object with the following properties:

### Scope Configuration

```typescript
import { Injectable, InjectableScope } from '@navios/di'

// Singleton (default) - one instance shared across the application
@Injectable({ scope: InjectableScope.Singleton })
class SingletonService {}

// Transient - new instance created for each injection
@Injectable({ scope: InjectableScope.Transient })
class TransientService {}
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

### Synchronous Injection with `syncInject`

Use `syncInject` when you need immediate access to a dependency:

```typescript
import { Injectable, syncInject } from '@navios/di'

@Injectable()
class EmailService {
  sendEmail(to: string, subject: string) {
    return `Email sent to ${to}: ${subject}`
  }
}

@Injectable()
class NotificationService {
  private readonly emailService = syncInject(EmailService)

  notify(user: string, message: string) {
    // Direct access - no await needed
    return this.emailService.sendEmail(user, `Notification: ${message}`)
  }
}
```

**Important:** `syncInject` only works with singleton services. For transient services, use `inject` instead.

### Asynchronous Injection with `inject`

Use `inject` for services that might not be immediately available:

```typescript
import { inject, Injectable } from '@navios/di'

@Injectable({ scope: InjectableScope.Transient })
class TransientService {
  constructor() {
    console.log('Creating new transient instance')
  }

  getValue() {
    return Math.random()
  }
}

@Injectable()
class ConsumerService {
  private readonly transientService = inject(TransientService)

  async getRandomValue() {
    const service = await this.transientService
    return service.getValue()
  }
}
```

## Advanced Patterns

### Service with Configuration Schema

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

### Service with Multiple Dependencies

```typescript
import { Injectable, syncInject } from '@navios/di'

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
  private readonly logger = syncInject(LoggerService)
  private readonly db = syncInject(DatabaseService)
  private readonly cache = syncInject(CacheService)

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

### Service with Lifecycle Hooks

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
    // Simulate database connection
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

## Scopes and Injection Compatibility

### Singleton Services

```typescript
@Injectable({ scope: InjectableScope.Singleton })
class SingletonService {
  private readonly id = Math.random()

  getId() {
    return this.id
  }
}

@Injectable()
class ConsumerService {
  // Both injection methods work with singletons
  private readonly syncService = syncInject(SingletonService)
  private readonly asyncService = inject(SingletonService)

  async demonstrate() {
    // Both return the same instance
    console.log(this.syncService.getId()) // Same ID
    const asyncInstance = await this.asyncService
    console.log(asyncInstance.getId()) // Same ID
  }
}
```

### Transient Services

```typescript
@Injectable({ scope: InjectableScope.Transient })
class TransientService {
  private readonly id = Math.random()

  getId() {
    return this.id
  }
}

@Injectable()
class ConsumerService {
  // Only inject() works with transient services
  private readonly transientService = inject(TransientService)

  async demonstrate() {
    const instance1 = await this.transientService
    const instance2 = await this.transientService

    console.log(instance1.getId()) // Different ID
    console.log(instance2.getId()) // Different ID
  }
}
```

## Error Handling

### Common Errors

```typescript
import { Injectable, syncInject } from '@navios/di'

@Injectable()
class ProblematicService {
  private readonly nonExistentService = syncInject(NonExistentService)
  // Error: NonExistentService is not registered
}

@Injectable({ scope: InjectableScope.Transient })
class TransientService {}

@Injectable()
class WrongInjectionService {
  private readonly transientService = syncInject(TransientService)
  // Error: Cannot use syncInject with transient services
}
```

### Proper Error Handling

```typescript
import { inject, Injectable } from '@navios/di'

@Injectable()
class SafeService {
  private readonly optionalService = inject(OptionalService).catch(() => null)

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

## Best Practices

### 1. Use Appropriate Injection Method

```typescript
// ✅ Good: Use syncInject for singleton dependencies
@Injectable()
class UserService {
  private readonly logger = syncInject(LoggerService)

  getUser(id: string) {
    this.logger.log(`Getting user ${id}`)
    // ...
  }
}

// ✅ Good: Use inject for transient dependencies
@Injectable()
class RequestService {
  private readonly transientService = inject(TransientService)

  async handleRequest() {
    const service = await this.transientService
    return service.process()
  }
}
```

### 2. Prefer Singleton for Stateless Services

```typescript
// ✅ Good: Stateless service as singleton
@Injectable({ scope: InjectableScope.Singleton })
class EmailService {
  sendEmail(to: string, subject: string) {
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

### 4. Implement Lifecycle Hooks for Resource Management

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

## API Reference

### Injectable Options

```typescript
interface InjectableOptions {
  scope?: InjectableScope
  token?: InjectionToken<any, any>
  registry?: Registry
}
```

### InjectableScope Enum

```typescript
enum InjectableScope {
  Singleton = 'Singleton', // One instance shared across the application
  Transient = 'Transient', // New instance created for each injection
}
```

### Injection Methods

- `syncInject<T>(token: T): T` - Synchronous injection (singleton only)
- `inject<T>(token: T): Promise<T>` - Asynchronous injection (all scopes)
