---
sidebar_position: 3
title: Services & Dependency Injection
---

# Services & Dependency Injection

Navios provides a powerful dependency injection system based on `@navios/di` that allows you to create and manage services throughout your application. Services are typically used to encapsulate business logic, data access, and other shared functionality.

:::tip
For advanced dependency injection topics like injection tokens, factories, scopes, and lifecycle management, see the [DI documentation](/docs/di).
:::

## What are Services?

Services are classes that contain business logic and can be injected into controllers, other services, or any class within the Navios application. They promote code reusability, testability, and separation of concerns.

## Creating Services

### Basic Service

```typescript
import { Injectable } from '@navios/di'

@Injectable()
export class UserService {
  async findAll() {
    // Business logic here
    return []
  }

  async findById(id: string) {
    // Business logic here
    return { id, name: 'John Doe' }
  }

  async create(userData: CreateUserDto) {
    // Business logic here
    return { id: '1', ...userData }
  }
}
```

### Service with Dependencies

```typescript
import { inject, Injectable } from '@navios/di'
import { Logger } from '@navios/core'

@Injectable()
export class UserService {
  private database = inject(DatabaseService)
  private logger = inject(Logger, { context: 'UserService' })

  async findById(id: string) {
    this.logger.debug(`Finding user by ID: ${id}`)
    return this.database.users.findUnique({ where: { id } })
  }

  async create(userData: CreateUserDto) {
    this.logger.debug('Creating new user')
    return this.database.users.create({ data: userData })
  }
}
```

## Using Services in Controllers

Services are typically injected into controllers to handle business logic:

```typescript
import { Controller, Endpoint, EndpointParams } from '@navios/core'
import { inject } from '@navios/di'

import { getUser, createUser } from '../api/user.endpoints'
import { UserService } from './user.service'

@Controller()
export class UserController {
  private userService = inject(UserService)

  @Endpoint(getUser)
  async getUser(params: EndpointParams<typeof getUser>) {
    return this.userService.findById(params.urlParams.userId)
  }

  @Endpoint(createUser)
  async createUser(params: EndpointParams<typeof createUser>) {
    return this.userService.create(params.data)
  }
}
```

:::tip
Always use `@navios/builder` to define your endpoints. See the [Builder documentation](/docs/builder/guides/defining-endpoints) for details.
:::

## Dependency Injection

### Using `inject()`

The `inject()` function is the primary way to inject dependencies:

```typescript
import { inject } from '@navios/di'
import { Logger, ConfigService } from '@navios/core'

@Injectable()
export class UserService {
  private database = inject(DatabaseService)
  private config = inject(ConfigService)
  private logger = inject(Logger, { context: 'UserService' })

  async findAll() {
    const pageSize = this.config.getOrDefault('PAGE_SIZE', 10)
    this.logger.debug(`Fetching users with page size: ${pageSize}`)
    return this.database.users.findMany({ take: pageSize })
  }
}
```

### Injection with Options

You can pass options when injecting dependencies:

```typescript
@Injectable()
export class UserService {
  // Inject with context for logger
  private logger = inject(Logger, { context: 'UserService' })

  // Inject with custom options
  private cache = inject(CacheService, { ttl: 3600 })
}
```

## Service Scopes

Services can have different scopes that determine their lifecycle. For detailed information about scopes, see the [DI: Scopes documentation](/docs/di/guides/scopes).

### Singleton Scope (Default)

```typescript
import { Injectable, InjectableScope } from '@navios/di'

@Injectable({ scope: InjectableScope.Singleton })
export class ConfigService {
  // Single instance shared across the application
  private config = new Map()

  get(key: string) {
    return this.config.get(key)
  }
}
```

### Request Scope

Request-scoped services are particularly useful in Navios for managing per-request state:

```typescript
import { Injectable, InjectableScope } from '@navios/di'

@Injectable({ scope: InjectableScope.Request })
export class RequestContextService {
  // New instance created for each HTTP request
  private requestId = crypto.randomUUID()
  private userId: string | null = null

  getRequestId() {
    return this.requestId
  }

  setUserId(userId: string) {
    this.userId = userId
  }

  getUserId() {
    return this.userId
  }
}
```

### Transient Scope

```typescript
@Injectable({ scope: InjectableScope.Transient })
export class UtilityService {
  // New instance created every time it's injected
  createId() {
    return crypto.randomUUID()
  }
}
```

## Service Patterns

### Repository Pattern

```typescript
export interface UserRepository {
  findById(id: string): Promise<User | null>
  findAll(): Promise<User[]>
  create(user: CreateUserDto): Promise<User>
  update(id: string, user: UpdateUserDto): Promise<User>
  delete(id: string): Promise<void>
}

@Injectable()
export class DatabaseUserRepository implements UserRepository {
  private database = inject(DatabaseService)

  async findById(id: string) {
    return this.database.users.findUnique({ where: { id } })
  }

  async findAll() {
    return this.database.users.findMany()
  }

  async create(user: CreateUserDto) {
    return this.database.users.create({ data: user })
  }

  async update(id: string, user: UpdateUserDto) {
    return this.database.users.update({ where: { id }, data: user })
  }

  async delete(id: string) {
    await this.database.users.delete({ where: { id } })
  }
}

@Injectable()
export class UserService {
  private userRepository = inject(DatabaseUserRepository)

  async getUser(id: string) {
    const user = await this.userRepository.findById(id)
    if (!user) {
      throw new NotFoundException('User not found')
    }
    return user
  }
}
```

### Factory Pattern

For more advanced factory patterns, see the [DI: Factories documentation](/docs/di/guides/factories).

```typescript
export interface EmailProvider {
  send(to: string, subject: string, body: string): Promise<void>
}

@Factory()
export class EmailProviderFactory {
  private config = inject(ConfigService)

  create(): EmailProvider {
    const provider = this.config.getOrDefault('EMAIL_PROVIDER', 'mock')

    switch (provider) {
      case 'sendgrid':
        return new SendGridProvider()
      case 'mailgun':
        return new MailgunProvider()
      default:
        return new MockEmailProvider()
    }
  }
}

@Injectable()
export class EmailService {
  private emailProvider = inject(EmailProviderFactory)

  async sendWelcomeEmail(user: User) {
    await this.emailProvider.send(
      user.email,
      'Welcome!',
      `Hello ${user.name}, welcome to our platform!`,
    )
  }
}
```

## Using ConfigService

The `ConfigService` provides type-safe access to configuration values. For detailed documentation, see the [ConfigService guide](/docs/server/guides/config-service).

```typescript
import { inject, Injectable } from '@navios/di'
import { ConfigService } from '@navios/core'

@Injectable()
export class DatabaseService {
  private config = inject(ConfigService)

  connect() {
    const databaseUrl = this.config.getOrThrow('DATABASE_URL', 'Database URL is required')
    // Connect to database
  }
}
```

## Best Practices

### 1. Single Responsibility

Each service should have a single, well-defined responsibility:

```typescript
// ✅ Good - Single responsibility
@Injectable()
export class UserService {
  async findById(id: string) {
    /* ... */
  }
  async create(user: CreateUserDto) {
    /* ... */
  }
  async update(id: string, user: UpdateUserDto) {
    /* ... */
  }
}

// ❌ Avoid - Multiple responsibilities
@Injectable()
export class UserEmailAuthService {
  // Too many responsibilities mixed together
}
```

### 2. Proper Error Handling

Handle errors appropriately in services:

```typescript
import { NotFoundException } from '@navios/core'

@Injectable()
export class UserService {
  private logger = inject(Logger, { context: 'UserService' })

  async findById(id: string) {
    try {
      const user = await this.database.users.findUnique({ where: { id } })
      if (!user) {
        throw new NotFoundException(`User with ID ${id} not found`)
      }
      return user
    } catch (error) {
      this.logger.error(`Failed to find user ${id}`, error.stack)
      throw error
    }
  }
}
```

### 3. Use Proper Scopes

Choose appropriate scopes for your services:

```typescript
// Singleton for stateless services
@Injectable({ scope: InjectableScope.Singleton })
export class UtilityService {}

// Request scope for request-specific data
@Injectable({ scope: InjectableScope.Request })
export class RequestContextService {}
```

### 4. Keep Controllers Thin

Controllers should delegate business logic to services:

```typescript
// ✅ Good - Controller is thin, logic in service
@Controller()
export class UserController {
  private userService = inject(UserService)

  @Endpoint(getUser)
  async getUser(params: EndpointParams<typeof getUser>) {
    return this.userService.findById(params.urlParams.userId)
  }
}

// ❌ Avoid - Business logic in controller
@Controller()
export class UserController {
  private database = inject(DatabaseService)

  @Endpoint(getUser)
  async getUser(params: EndpointParams<typeof getUser>) {
    // Business logic should be in a service
    const user = await this.database.users.findUnique({
      where: { id: params.urlParams.userId },
    })
    if (!user) {
      throw new NotFoundException('User not found')
    }
    return user
  }
}
```

## Advanced Topics

For more advanced dependency injection topics, see the [DI documentation](/docs/di):

- [Injection Tokens](/docs/di/guides/injection-tokens) - Using tokens for interfaces and non-class dependencies
- [Factories](/docs/di/guides/factories) - Creating services with factories
- [Lifecycle Hooks](/docs/di/guides/lifecycle) - Service initialization and cleanup
- [Request Contexts](/docs/di/guides/request-contexts) - Managing request-scoped services
- [Circular Dependencies](/docs/di/guides/circular-dependencies) - Handling circular dependencies
- [Testing](/docs/di/guides/testing) - Testing services with dependency injection

