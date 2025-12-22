---
sidebar_position: 1
---

# Services

Services are the foundation of dependency injection in Navios DI. This guide covers everything you need to know about creating and using services.

## What is a Service?

A service is a class that provides functionality to other parts of your application. Services are registered with the DI container using the `@Injectable()` decorator and can be injected into other services as dependencies.

**Key characteristics:**
- **Registered**: Services must be decorated with `@Injectable()` to be available for injection
- **Injectable**: Services can request other services as dependencies
- **Scoped**: Services can have different lifetimes (singleton, transient, request)
- **Lifecycle-aware**: Services can implement initialization and cleanup hooks

## Basic Service Registration

The `@Injectable()` decorator marks a class as a service that can be injected:

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

By default, services are **singleton** scoped, meaning one instance is shared across the entire application.

## Service Dependencies

Services can depend on other services. Dependencies are automatically resolved by the container when you use `inject()`, `asyncInject()`, or `optional()`.

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

The container automatically resolves `LoggerService` when `EmailService` is requested.

### ⚠️ Avoid Accessing Services in Constructors

**Critical**: Never access injected services in constructors. Services can be initialized multiple times during dependency resolution, and dependencies may not be fully ready. Use lifecycle methods like `onServiceInit()` for initialization logic instead.

```typescript
import { inject, Injectable, OnServiceInit } from '@navios/di'

// ❌ Avoid: Accessing services in constructor
@Injectable()
class ProblematicService {
  private readonly logger = inject(LoggerService)

  constructor() {
    this.logger.log('Service created') // ❌ Service may not be ready
  }
}

// ✅ Good: Use lifecycle methods
@Injectable()
class CorrectService implements OnServiceInit {
  private readonly logger = inject(LoggerService)

  async onServiceInit() {
    // ✅ All dependencies are fully initialized here
    this.logger.log('Service initialized')
  }
}
```

## Service Configuration

The `@Injectable()` decorator accepts configuration options:

### Scope

Services can have different lifetimes:

- **Singleton** (default): One instance shared across the entire application
- **Transient**: New instance created for each injection
- **Request**: One instance per request context (requires `ScopedContainer`)

```typescript
import { Injectable, InjectableScope } from '@navios/di'

@Injectable() // Singleton (default)
class SingletonService {}

@Injectable({ scope: InjectableScope.Transient })
class TransientService {}

@Injectable({ scope: InjectableScope.Request })
class RequestService {}
```

Learn more about [scopes](/docs/di/di/guides/scopes).

### Custom Injection Token

Use injection tokens to decouple service implementations from their consumers:

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

Learn more about [injection tokens](/docs/di/di/guides/injection-tokens).

### Custom Registry

Services can be registered in custom registries for isolation:

```typescript
import { Injectable, Registry } from '@navios/di'

const customRegistry = new Registry()

@Injectable({ registry: customRegistry })
class CustomService {}
```

### Priority

Services can be registered with priority levels. When multiple services are registered for the same token, the one with the highest priority wins:

```typescript
import { Injectable } from '@navios/di'

// Default service (priority: 0)
@Injectable({ priority: 100 })
class DefaultUserService {
  getUsers() {
    return ['Alice', 'Bob']
  }
}

// Override service (priority: 200 - wins)
@Injectable({ priority: 200 })
class OverrideUserService {
  getUsers() {
    return ['Charlie', 'David']
  }
}

// When resolving, OverrideUserService will be returned
const container = new Container()
const service = await container.get(UserService) // Returns OverrideUserService
```

You can also retrieve all registrations using `registry.getAll(token)`:

```typescript
const registry = container.getRegistry()
const allRegistrations = registry.getAll(UserService)
// Returns both services, sorted by priority (highest first)
```

## Injection Methods

Navios DI provides three ways to inject dependencies:

- **`inject()`**: Synchronous injection for immediate access. Supports all scopes including transient.
- **`asyncInject()`**: Asynchronous injection, useful for breaking circular dependencies or when you need explicit async control.
- **`optional()`**: Optional injection that returns `null` if the service isn't available.

```typescript
// Synchronous injection (most common)
private readonly emailService = inject(EmailService)

// Asynchronous injection (for circular dependencies)
private readonly serviceB = asyncInject(ServiceB)
// Later: const b = await this.serviceB

// Optional injection
private readonly analytics = optional(AnalyticsService)
// Later: this.analytics?.track(event)
```

## Service with Schema

Services can accept constructor arguments validated by Zod schemas. This is useful for configuration services:

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

## Service Lifecycle

Services can implement lifecycle hooks for initialization and cleanup:

```typescript
import { Injectable, OnServiceDestroy, OnServiceInit } from '@navios/di'

@Injectable()
class DatabaseService implements OnServiceInit, OnServiceDestroy {
  private connection: any = null

  async onServiceInit() {
    console.log('Initializing database connection...')
    this.connection = await this.connect()
  }

  async onServiceDestroy() {
    console.log('Closing database connection...')
    if (this.connection) {
      await this.connection.close()
    }
  }

  private async connect() {
    // Database connection logic
    return { connected: true }
  }
}
```

Learn more about [lifecycle hooks](/docs/di/di/guides/lifecycle).

## Using Services

### Getting Services from Container

```typescript
import { Container } from '@navios/di'

const container = new Container()
const userService = await container.get(UserService)
await userService.getUser('123')
```

### Getting Services with Arguments

For services with schemas, provide arguments when getting them:

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

- Use `inject()` for most cases - it's simple and supports all scopes
- Use `asyncInject()` only when needed (circular dependencies, explicit async control)
- Use `optional()` when a dependency might not be available

### 2. Prefer Singleton for Stateless Services

Stateless services (like utilities, validators, or pure functions) should be singletons. Stateful services should use transient or request scope to avoid shared state issues.

### 3. Use Injection Tokens for Interfaces

When working with interfaces or abstract types, use injection tokens to decouple implementations:

```typescript
interface PaymentProcessor {
  processPayment(amount: number): Promise<string>
}

const PAYMENT_PROCESSOR_TOKEN = InjectionToken.create<PaymentProcessor>('PaymentProcessor')

@Injectable({ token: PAYMENT_PROCESSOR_TOKEN })
class StripePaymentProcessor implements PaymentProcessor {
  async processPayment(amount: number) {
    return `Processed $${amount} via Stripe`
  }
}
```

### 4. Never Access Services in Constructors

Always use `onServiceInit()` for initialization logic that depends on other services. Constructors should only handle simple property initialization.

### 5. Implement Lifecycle Hooks for Resource Management

Services that manage resources (database connections, file handles, network connections) should implement `OnServiceInit` and `OnServiceDestroy` to properly initialize and clean up resources.

## Next Steps

- Learn about [factories](/docs/di/di/guides/factories) for complex object creation
- Explore [injection tokens](/docs/di/di/guides/injection-tokens) for flexible resolution
- Understand [scopes](/docs/di/di/guides/scopes) for service lifetime management
- Implement [lifecycle hooks](/docs/di/di/guides/lifecycle) for resource management
