# Navios DI Documentation

Welcome to the comprehensive documentation for Navios DI, a powerful dependency injection library for TypeScript applications.

## Table of Contents

- [Getting Started](./getting-started.md) - Installation and basic setup
- [Container](./container.md) - Container API and usage patterns
- [Injectable Decorator](./injectable.md) - Service registration and configuration
- [Factory Decorator](./factory.md) - Factory pattern implementation
- [Injection Tokens](./injection-tokens.md) - Token-based dependency resolution
- [Request Contexts](./request-contexts.md) - Request-scoped services and cleanup
- [Service Lifecycle](./lifecycle.md) - Initialization and cleanup hooks
- [Scopes](./scopes.md) - Singleton, transient, and request service scopes
- [API Reference](./api-reference.md) - Complete API documentation
- [Migration Guide](./migration.md) - Upgrading from older versions

## Quick Links

### Core Concepts

- **[Container](./container.md)** - The main entry point for dependency injection
- **[Injectable](./injectable.md)** - Decorator for marking classes as injectable services
- **[Factory](./factory.md)** - Decorator for creating factory classes
- **[Injection Tokens](./injection-tokens.md)** - Flexible token-based dependency resolution
- **[Request Contexts](./request-contexts.md)** - Request-scoped services with automatic cleanup

### Key Features

- **Type Safety** - Full TypeScript support with compile-time checking
- **Lifecycle Management** - Built-in hooks for service initialization and cleanup
- **Multiple Scopes** - Singleton, transient, and request service lifetimes
- **Async/Sync Injection** - Both synchronous and asynchronous dependency resolution
- **Circular Dependency Detection** - Automatic detection with clear error messages
- **Factory Pattern** - Complex object creation with factory classes
- **Request Contexts** - Request-scoped services with priority resolution and automatic cleanup
- **Cross-Platform** - Works in Node.js, Bun, Deno, and browsers

### Getting Started

```typescript
import { inject, Container, Injectable } from '@navios/di'

@Injectable()
class DatabaseService {
  async connect() {
    return 'Connected to database'
  }
}

@Injectable()
class UserService {
  private readonly db = inject(DatabaseService)

  async getUsers() {
    const users = await this.db.query('SELECT * FROM users')
    return users
  }
}

// Using Container
const container = new Container()
const userService = await container.get(UserService)
console.log(await userService.getUsers())
```

## Architecture Overview

Navios DI follows a modern, decorator-based architecture:

1. **Services** are marked with `@Injectable()` decorator
2. **Dependencies** are injected using `inject()` or `asyncInject()`
3. **Container** manages service instances and their lifecycle
4. **ScopedContainer** provides request-scoped isolation
5. **Injection Tokens** provide flexible dependency resolution
6. **Factories** handle complex object creation
7. **CircularDetector** prevents circular dependency deadlocks

## Design Principles

- **Type Safety First** - Leverage TypeScript's type system for compile-time safety
- **Declarative Configuration** - Use decorators for clean, readable service definitions
- **Flexible Resolution** - Support both class-based and token-based injection
- **Lifecycle Awareness** - Built-in support for service initialization and cleanup
- **Performance Optimized** - Efficient instance management and caching
- **Safe by Default** - Automatic circular dependency detection

## Platform Support

| Platform | AsyncLocalStorage | Notes                              |
| -------- | ----------------- | ---------------------------------- |
| Node.js  | Native            | Full async tracking support        |
| Bun      | Native            | Full async tracking support        |
| Deno     | Native            | Via Node compatibility layer       |
| Browser  | Polyfill          | Sync-only tracking (SyncLocalStorage) |

## Examples

### Basic Service Injection

```typescript
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
    return this.emailService.sendEmail(user, `Notification: ${message}`)
  }
}
```

### Configuration with Injection Tokens

```typescript
import { z } from 'zod'

const configSchema = z.object({
  apiUrl: z.string(),
  timeout: z.number(),
})

const CONFIG_TOKEN = InjectionToken.create<Config, typeof configSchema>(
  'APP_CONFIG',
  configSchema,
)

@Injectable({ token: CONFIG_TOKEN })
class ConfigService {
  constructor(private config: z.infer<typeof configSchema>) {}

  getApiUrl() {
    return this.config.apiUrl
  }
}
```

### Service Lifecycle

```typescript
@Injectable()
class DatabaseService implements OnServiceInit, OnServiceDestroy {
  private connection: any = null

  async onServiceInit() {
    console.log('Initializing database...')
    this.connection = await this.connect()
  }

  async onServiceDestroy() {
    console.log('Closing database...')
    if (this.connection) {
      await this.connection.close()
    }
  }
}
```

### Handling Circular Dependencies

```typescript
// Use asyncInject to break circular dependencies
@Injectable()
class ServiceA {
  private serviceB = asyncInject(ServiceB)  // Use asyncInject to break cycle

  async doSomething() {
    const b = await this.serviceB
    return b.process()
  }
}

@Injectable()
class ServiceB {
  private serviceA = inject(ServiceA)  // This side can use inject()

  process() {
    return 'processed'
  }
}
```

### Request-Scoped Services

```typescript
@Injectable({ scope: InjectableScope.Request })
class RequestContext {
  userId?: string
  correlationId?: string
}

// In HTTP middleware
app.use(async (req, res, next) => {
  const scoped = container.beginRequest(req.id, { userId: req.userId })
  req.container = scoped

  try {
    await next()
  } finally {
    await scoped.endRequest()
  }
})
```

## Need Help?

- Check the [API Reference](./api-reference.md) for detailed method documentation
- Review the [Migration Guide](./migration.md) if upgrading from older versions
- See the [Examples](./examples/) folder for complete working examples
