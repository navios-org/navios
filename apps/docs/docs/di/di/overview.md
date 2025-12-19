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

Dependency Injection (DI) is a design pattern that helps manage dependencies between components. Instead of creating dependencies directly, services declare what they need, and the DI container provides them automatically.

**The DI system follows a registration-resolution pattern:**

1. **Registration** - Services are registered via decorators (`@Injectable`, `@Factory`)
2. **Resolution** - Dependencies are resolved via injection functions (`inject`, `asyncInject`, `optional`)
3. **Lifecycle** - Services have scoped lifetimes and lifecycle hooks

**Benefits:**
- **Loose coupling**: Services don't need to know how to create their dependencies
- **Testability**: Easy to mock dependencies for testing
- **Flexibility**: Swap implementations without changing dependent code
- **Lifecycle management**: Container manages service creation and cleanup

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

Services can have different lifetimes:

- **Singleton** (default): One instance shared across the entire application
- **Transient**: New instance created for each injection
- **Request**: One instance per request context (requires `ScopedContainer`)

```typescript
import { Injectable, InjectableScope } from '@navios/di'

@Injectable() // Singleton (default)
class ConfigService {}

@Injectable({ scope: InjectableScope.Transient })
class LogEntry {}

@Injectable({ scope: InjectableScope.Request })
class RequestContext {}
```

## Injection Functions

Navios DI provides three ways to inject dependencies:

- **`inject()`**: Synchronous injection for immediate access (supports all scopes)
- **`asyncInject()`**: Asynchronous injection, useful for breaking circular dependencies
- **`optional()`**: Optional injection that returns `null` if the service isn't available

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

## Lifecycle Hooks

Services can implement lifecycle hooks for initialization and cleanup:

- **`OnServiceInit`**: Called after the service is instantiated and all dependencies are injected
- **`OnServiceDestroy`**: Called when the service is being destroyed

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

**Important**: Never access injected services in constructors. Services can be initialized multiple times during dependency resolution. Always use `onServiceInit()` for initialization logic that depends on other services.

## Next Steps

- **[Getting Started](/docs/di/di/getting-started)** - Set up your first service
- **[Services Guide](/docs/di/di/guides/services)** - Learn how to create and use services
- **[Injection Tokens](/docs/di/di/guides/injection-tokens)** - Flexible dependency resolution
- **[Factories](/docs/di/di/guides/factories)** - Complex object creation
- **[Scopes](/docs/di/di/guides/scopes)** - Service lifetime management
- **[Lifecycle](/docs/di/di/guides/lifecycle)** - Initialization and cleanup hooks
