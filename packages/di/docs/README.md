# Navios DI Documentation

This is the documentation for Navios DI 2.0, a dependency injection library for TypeScript applications.

## Table of Contents

- [Getting Started](./getting-started.md) - Installation and basic setup
- [Container](./container.md) - Container API, providers and usage patterns
- [Injectable Decorator](./injectable.md) - Service registration and injection functions
- [Factory Decorator](./factory.md) - Factory classes
- [Injection Tokens](./injection-tokens.md) - Token-based dependency resolution
- [Scoped Containers](./request-contexts.md) - Scopes created with `createScope()`
- [Service Lifecycle](./lifecycle.md) - Initialization and cleanup hooks
- [Scopes](./scopes.md) - Singleton, transient and request service scopes
- [API Reference](./api-reference.md) - The exported API
- [Migration Guide](./migration.md) - Upgrading from 1.x to 2.0

## Quick Links

### Core Concepts

- **[Container](./container.md)** - Holds singletons, resolves services and creates scopes
- **[Injectable](./injectable.md)** - Decorator that registers a class as a service
- **[Factory](./factory.md)** - Decorator that registers a factory class
- **[Injection Tokens](./injection-tokens.md)** - Resolution by token instead of by class
- **[Scoped Containers](./request-contexts.md)** - Request-scoped services with cleanup

### Key Features

- **Type safety** - Resolved types are inferred from classes and tokens
- **Sync-first resolution** - A constructor runs once and `inject()` returns the real instance
- **Explicit providers** - `provide()` replaces an implementation per container
- **Three scopes** - Singleton, transient and request
- **Lifecycle hooks** - `onServiceInit()` and `onServiceDestroy()`
- **Circular dependency detection** - Reported with the full path
- **Standard Schema** - Token args are validated with zod, valibot, arktype or any other Standard Schema library

### Getting Started

```ts
import { Container, inject, Injectable } from '@navios/di'

@Injectable()
class DatabaseService {
  async query(sql: string) {
    return [{ id: 1 }]
  }
}

@Injectable()
class UserService {
  private readonly db = inject(DatabaseService)

  async getUsers() {
    return this.db.query('SELECT * FROM users')
  }
}

const container = new Container()
const userService = await container.get(UserService)
console.log(await userService.getUsers())
```

## Architecture Overview

1. **Services** are registered with `@Injectable()` or `@Factory()`. Each class has its own token; the decorator attaches a default provider to it.
2. **Dependencies** are requested with `inject()`, `optional()` or `asyncInject()` while a class is being constructed.
3. **The container** looks up the provider for a token (its own providers first, then the token's default), builds the instance and stores it by token and args.
4. **A scope**, created with `container.createScope()`, stores request-scoped instances and resolves singletons from its parent.
5. **Injection tokens** name a dependency that is not a class, such as an interface or a configuration value.

## Design Principles

- **Identity, not names.** A token is identified by the token object. Two classes with the same name or the same source are different services.
- **Synchronous when possible.** A service whose dependencies are ready is built without awaiting anything. Only an `onServiceInit()` that returns a promise, an async factory or a factory token makes resolution asynchronous.
- **Declared scope only.** A service is built in the scope it declares. A scope conflict is an error, never a silent change of scope.
- **Explicit replacement.** A token has one default provider. Anything else is bound on a container with `provide()`.
- **Errors are not hidden.** `optional()` returns `null` only when nothing provides the token.

## Examples

### Basic Service Injection

```ts
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

```ts
import { Injectable, InjectionToken } from '@navios/di'
import { z } from 'zod'

const configSchema = z.object({
  apiUrl: z.string(),
  timeout: z.number(),
})

const CONFIG_TOKEN = InjectionToken.create<ConfigService, typeof configSchema>(
  'APP_CONFIG',
  configSchema,
)

@Injectable({ token: CONFIG_TOKEN })
class ConfigService {
  constructor(private readonly config: z.output<typeof configSchema>) {}

  getApiUrl() {
    return this.config.apiUrl
  }
}
```

### Service Lifecycle

```ts
@Injectable()
class DatabaseService implements OnServiceInit, OnServiceDestroy {
  private connection: Connection | null = null

  async onServiceInit() {
    this.connection = await connect()
  }

  async onServiceDestroy() {
    await this.connection?.close()
  }
}
```

### Replacing an Implementation

```ts
import { Container, provide } from '@navios/di'

const container = new Container({
  providers: [provide(DatabaseService, InMemoryDatabaseService)],
})
```

### Handling Circular Dependencies

```ts
@Injectable()
class ServiceA {
  private readonly serviceB = asyncInject(ServiceB) // breaks the cycle

  async doSomething() {
    const b = await this.serviceB
    return b.process()
  }
}

@Injectable()
class ServiceB {
  private readonly serviceA = inject(ServiceA)

  process() {
    return 'processed'
  }
}
```

### Request-Scoped Services

```ts
@Injectable({ scope: InjectableScope.Request })
class RequestState {
  userId?: string
}

// In HTTP middleware
app.use(async (req, res, next) => {
  await using scope = container.createScope({ userId: req.userId })
  req.scope = scope
  await next()
})
```

## Need Help?

- Check the [API Reference](./api-reference.md) for the exported API
- Read the [Migration Guide](./migration.md) if you are upgrading from 1.x
