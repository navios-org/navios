# Navios DI

A powerful, type-safe dependency injection library for TypeScript applications. Navios DI provides a modern, decorator-based approach to dependency injection with support for singletons, transients, factories, injection tokens, and service lifecycle management.

## Features

- 🎯 **Type-safe**: Full TypeScript support with compile-time type checking
- 🏗️ **Decorator-based**: Clean, declarative syntax using decorators
- 🔄 **Lifecycle Management**: Built-in support for service initialization and cleanup
- 🏭 **Factory Pattern**: Create instances using factory classes
- 🎫 **Injection Tokens**: Flexible token-based dependency resolution
- 📦 **Scoped Instances**: Singleton and transient scopes
- ⚡ **Async/Sync Injection**: Both synchronous and asynchronous dependency resolution
- 🔧 **Container API**: Simple container-based API for dependency management
- 🌐 **Request Context**: Manage request-scoped services with automatic cleanup
- 🔀 **Priority Resolution**: Request contexts with priority-based resolution

## Installation

```bash
npm install @navios/di
# or
yarn add @navios/di
```

## Quick Start

### Basic Usage

```typescript
import { asyncInject, Container, Injectable } from '@navios/di'

@Injectable()
class DatabaseService {
  async connect() {
    return 'Connected to database'
  }
}

@Injectable()
class UserService {
  private readonly db = asyncInject(DatabaseService)

  async getUsers() {
    const dbService = await this.db
    const connection = await dbService.connect()
    return `Users from ${connection}`
  }
}

// Using Container
const container = new Container()
const userService = await container.get(UserService)
console.log(await userService.getUsers()) // "Users from Connected to database"
```

## Core Concepts

### Container

The `Container` class provides a simplified API for dependency injection:

```typescript
import { Container } from '@navios/di'

const container = new Container()

// Get instances
const service = await container.get(MyService)

// Invalidate services and their dependencies
await container.invalidate(service)

// Wait for all pending operations
await container.ready()

// Request context management
const context = container.beginRequest('req-123', { userId: 456 })
container.setCurrentRequestContext('req-123')
// ... do work within request context
await container.endRequest('req-123')
```

### Injectable Decorator

The `@Injectable` decorator marks a class as injectable:

```typescript
import { Injectable, InjectableScope } from '@navios/di'

// Singleton (default)
@Injectable()
class SingletonService {}

// Transient (new instance each time)
@Injectable({ scope: InjectableScope.Transient })
class TransientService {}

// With custom injection token
@Injectable({ token: MyToken })
class TokenizedService {}
```

### Injection Methods

#### `inject` - Synchronous Injection

Use `inject` for immediate access to dependencies. **Note**: If the dependency is not immediately available, `inject` returns a proxy that will throw an error if accessed before the dependency is ready:

```typescript
@Injectable()
class EmailService {
  sendEmail(message: string) {
    return `Email sent: ${message}`
  }
}

@Injectable()
class NotificationService {
  private readonly emailService = inject(EmailService)

  notify(message: string) {
    // Safe to use if EmailService is already instantiated
    return this.emailService.sendEmail(message)
  }
}
```

#### `asyncInject` - Asynchronous Injection

Use `asyncInject` for async dependency resolution:

```typescript
@Injectable()
class AsyncService {
  private readonly emailService = asyncInject(EmailService)

  async notify(message: string) {
    const emailService = await this.emailService
    return emailService.sendEmail(message)
  }
}
```

### Factory Decorator

Create instances using factory classes:

```typescript
import { Factory } from '@navios/di'

@Factory()
class DatabaseConnectionFactory {
  create() {
    return {
      host: 'localhost',
      port: 5432,
      connected: true,
    }
  }
}

// Usage
const connection = await container.get(DatabaseConnectionFactory)
console.log(connection) // { host: 'localhost', port: 5432, connected: true }
```

### Service Lifecycle

Implement lifecycle hooks for initialization and cleanup:

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

### Request Context Management

Manage request-scoped services with automatic cleanup and priority-based resolution:

```typescript
import { Container, Injectable, InjectionToken } from '@navios/di'

const REQUEST_ID_TOKEN = InjectionToken.create<string>('REQUEST_ID')

@Injectable()
class RequestLogger {
  private readonly requestId = asyncInject(REQUEST_ID_TOKEN)

  async log(message: string) {
    const id = await this.requestId
    console.log(`[${id}] ${message}`)
  }
}

// Usage
const container = new Container()

// Begin a request context
const context = container.beginRequest('req-123', { userId: 456 }, 100)
context.addInstance(REQUEST_ID_TOKEN, 'req-123')

// Set as current context
container.setCurrentRequestContext('req-123')

// Use services within the request context
const logger = await container.get(RequestLogger)
await logger.log('Processing request') // "[req-123] Processing request"

// End the request context (automatically cleans up)
await container.endRequest('req-123')
```

### Injection Tokens

Use injection tokens for flexible dependency resolution:

#### Basic Injection Token

```typescript
import { Container, Injectable, InjectionToken } from '@navios/di'

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

// Usage
const container = new Container()
const config = await container.get(CONFIG_TOKEN, {
  apiUrl: 'https://api.example.com',
  timeout: 5000,
})
```

#### Bound Injection Token

Pre-bind values to injection tokens:

```typescript
const BoundConfig = InjectionToken.bound(CONFIG_TOKEN, {
  apiUrl: 'https://api.example.com',
  timeout: 5000,
})

// No need to provide arguments
const container = new Container()

const config = await container.get(BoundConfig)
```

#### Factory Injection Token

Use factories to resolve token values:

```typescript
const FactoryConfig = InjectionToken.factory(CONFIG_TOKEN, async () => {
  // Load config from environment or external source
  return {
    apiUrl: process.env.API_URL || 'https://api.example.com',
    timeout: parseInt(process.env.TIMEOUT || '5000'),
  }
})

const config = await container.get(FactoryConfig)
```

## Advanced Usage

### Custom Registry

```typescript
import { Container, Registry } from '@navios/di'

const customRegistry = new Registry()
const container = new Container(customRegistry)
```

### Error Handling

```typescript
try {
  const service = await container.get(NonExistentService)
} catch (error) {
  console.error('Service not found:', error.message)
}
```

### Service Invalidation

```typescript
// Invalidate a specific service and its dependencies
await container.invalidate(myService)

// The service will be recreated on next access
const newService = await container.get(MyService)
```

## API Reference

### Container

- `get<T>(token: T): Promise<InstanceType<T>>` - Get an instance
- `invalidate(service: unknown): Promise<void>` - Invalidate a service
- `ready(): Promise<void>` - Wait for pending operations
- `getServiceLocator(): ServiceLocator` - Get underlying service locator
- `beginRequest(requestId: string, metadata?, priority?): RequestContextHolder` - Begin request context
- `endRequest(requestId: string): Promise<void>` - End request context
- `getCurrentRequestContext(): RequestContextHolder | null` - Get current request context
- `setCurrentRequestContext(requestId: string): void` - Set current request context

### Injectable Decorator

- `@Injectable(options?: InjectableOptions)` - Mark class as injectable
- Options:
  - `scope?: InjectableScope` - Service scope (Singleton | Transient)
  - `token?: InjectionToken` - Custom injection token
  - `registry?: Registry` - Custom registry

### Factory Decorator

- `@Factory(options?: FactoryOptions)` - Mark class as factory
- Options:
  - `scope?: InjectableScope` - Factory scope
  - `token?: InjectionToken` - Custom injection token
  - `registry?: Registry` - Custom registry

### Injection Methods

- `inject<T>(token: T): T` - Synchronous injection
- `asyncInject<T>(token: T): Promise<T>` - Asynchronous injection

### Injection Tokens

- `InjectionToken.create<T>(name: string | symbol): InjectionToken<T>`
- `InjectionToken.create<T, S>(name: string | symbol, schema: S): InjectionToken<T, S>`
- `InjectionToken.bound<T, S>(token: InjectionToken<T, S>, value: z.input<S>): BoundInjectionToken<T, S>`
- `InjectionToken.factory<T, S>(token: InjectionToken<T, S>, factory: () => Promise<z.input<S>>): FactoryInjectionToken<T, S>`

### Lifecycle Interfaces

- `OnServiceInit` - Implement `onServiceInit(): Promise<void> | void`
- `OnServiceDestroy` - Implement `onServiceDestroy(): Promise<void> | void`

### Request Context

- `RequestContextHolder` - Interface for managing request-scoped instances
- `beginRequest(requestId, metadata?, priority?)` - Create new request context
- `endRequest(requestId)` - Clean up request context
- `addInstance(token, instance)` - Add pre-prepared instance to context
- `setMetadata(key, value)` - Set request-specific metadata

## Best Practices

1. **Use `asyncInject` for most dependencies** - Safer than `inject` and handles async initialization
2. **Use `inject` only for immediate dependencies** - When you're certain the dependency is ready
3. **Implement lifecycle hooks** - For proper resource management
4. **Use injection tokens** - For configuration and interface-based dependencies
5. **Prefer singletons** - Unless you specifically need new instances each time
6. **Use factories** - For complex object creation logic
7. **Leverage request contexts** - For request-scoped data and cleanup
8. **Set appropriate priorities** - When using multiple request contexts

## License

MIT
