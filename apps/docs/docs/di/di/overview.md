---
sidebar_position: 1
---

# @navios/di

A powerful, type-safe dependency injection framework for TypeScript. It provides decorator-based service registration, multiple injection scopes, lifecycle management, and comprehensive async support.

**Package:** `@navios/di`
**License:** MIT
**Peer Dependencies:** `zod` (^3.25.0 || ^4.0.0)

## Installation

```bash
npm install @navios/di zod
# or
yarn add @navios/di zod
# or
pnpm add @navios/di zod
```

## Core Concepts

### Dependency Injection Pattern

The DI system follows a registration-resolution pattern:

1. **Registration** - Services are registered via decorators (`@Injectable`, `@Factory`)
2. **Resolution** - Dependencies are resolved via injection functions (`inject`, `asyncInject`)
3. **Lifecycle** - Services have scoped lifetimes and lifecycle hooks

### Key Components

| Component | Purpose |
|-----------|---------|
| `Registry` | Central storage for service metadata |
| `Container` | Main entry point for service resolution |
| `ServiceLocator` | Coordinates dependency resolution |
| `ServiceInstantiator` | Creates service instances |
| `InjectionToken` | Type-safe tokens for dynamic resolution |

## Quick Start

```typescript
import { Injectable, inject, Container } from '@navios/di'

// Define services
@Injectable()
class ConfigService {
  getApiUrl() {
    return 'https://api.example.com'
  }
}

@Injectable()
class UserService {
  private config = inject(ConfigService)

  async getUsers() {
    const url = this.config.getApiUrl()
    // fetch users...
  }
}

// Use the container
const container = new Container()
const userService = await container.get(UserService)
await userService.getUsers()
```

## Injection Scopes

```typescript
import { Injectable, InjectableScope } from '@navios/di'

// Singleton - one instance for entire application (default)
@Injectable({ scope: InjectableScope.Singleton })
class ConfigService {}

// Transient - new instance per injection
@Injectable({ scope: InjectableScope.Transient })
class LogEntry {}

// Request - one instance per request context
@Injectable({ scope: InjectableScope.Request })
class RequestContext {}
```

## Injection Functions

### `inject<T>(token)`

Synchronously injects a dependency:

```typescript
@Injectable()
class OrderService {
  private userService = inject(UserService)
}
```

### `asyncInject<T>(token)`

Asynchronously injects a dependency (useful for circular dependencies):

```typescript
@Injectable()
class ServiceA {
  private serviceB = asyncInject(ServiceB)

  async doSomething() {
    const b = await this.serviceB
    return b.getValue()
  }
}
```

### `optional<T>(token)`

Injects a dependency if available, returns `null` otherwise:

```typescript
@Injectable()
class NotificationService {
  private emailService = optional(EmailService)

  notify(message: string) {
    this.emailService?.send(message)
  }
}
```

## Lifecycle Hooks

```typescript
import { Injectable, OnServiceInit, OnServiceDestroy } from '@navios/di'

@Injectable()
class DatabaseService implements OnServiceInit, OnServiceDestroy {
  async onServiceInit() {
    await this.connect()
    console.log('Database connected')
  }

  async onServiceDestroy() {
    await this.disconnect()
    console.log('Database disconnected')
  }
}
```

