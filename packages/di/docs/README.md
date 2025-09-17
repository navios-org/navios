# Navios DI Documentation

Welcome to the comprehensive documentation for Navios DI, a powerful dependency injection library for TypeScript applications.

## Table of Contents

- [Getting Started](./getting-started.md) - Installation and basic setup
- [Container](./container.md) - Container API and usage patterns
- [Injectable Decorator](./injectable.md) - Service registration and configuration
- [Factory Decorator](./factory.md) - Factory pattern implementation
- [Injection Tokens](./injection-tokens.md) - Token-based dependency resolution
- [Service Lifecycle](./lifecycle.md) - Initialization and cleanup hooks
- [Scopes](./scopes.md) - Singleton and transient service scopes
- [Advanced Patterns](./advanced-patterns.md) - Complex usage scenarios
- [API Reference](./api-reference.md) - Complete API documentation
- [Migration Guide](./migration.md) - Upgrading from older versions

## Quick Links

### Core Concepts

- **[Container](./container.md)** - The main entry point for dependency injection
- **[Injectable](./injectable.md)** - Decorator for marking classes as injectable services
- **[Factory](./factory.md)** - Decorator for creating factory classes
- **[Injection Tokens](./injection-tokens.md)** - Flexible token-based dependency resolution

### Key Features

- **Type Safety** - Full TypeScript support with compile-time checking
- **Lifecycle Management** - Built-in hooks for service initialization and cleanup
- **Multiple Scopes** - Singleton and transient service lifetimes
- **Async/Sync Injection** - Both synchronous and asynchronous dependency resolution
- **Factory Pattern** - Complex object creation with factory classes

### Getting Started

```typescript
import { Container, inject, Injectable } from '@navios/di'

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
    const connection = await this.db.connect()
    return `Users from ${connection}`
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
2. **Dependencies** are injected using `asyncInject()` or `inject()`
3. **Container** manages service instances and their lifecycle
4. **Injection Tokens** provide flexible dependency resolution
5. **Factories** handle complex object creation

## Design Principles

- **Type Safety First** - Leverage TypeScript's type system for compile-time safety
- **Declarative Configuration** - Use decorators for clean, readable service definitions
- **Flexible Resolution** - Support both class-based and token-based injection
- **Lifecycle Awareness** - Built-in support for service initialization and cleanup
- **Performance Optimized** - Efficient instance management and caching

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

## Need Help?

- Check the [API Reference](./api-reference.md) for detailed method documentation
- Look at [Advanced Patterns](./advanced-patterns.md) for complex scenarios
- Review the [Migration Guide](./migration.md) if upgrading from older versions
- See the [Examples](./examples/) folder for complete working examples
