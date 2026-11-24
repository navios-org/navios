---
sidebar_position: 3
title: Services & Dependency Injection
---

# Services & Dependency Injection

Services encapsulate business logic and can be injected into controllers or other services. Navios uses `@navios/di` for dependency injection.

## What are Services?

Services are classes that contain business logic separate from HTTP concerns. They promote code reusability, testability, and separation of concerns.

**Key characteristics:**

- Encapsulate business logic
- Can be injected into controllers or other services
- Can have different lifecycles (singleton, request, transient)
- Are easily testable in isolation

## Creating Services

Decorate services with `@Injectable()`:

```typescript
import { Injectable } from '@navios/di'

@Injectable()
export class UserService {
  async findAll() {
    return []
  }

  async findById(id: string) {
    return { id, name: 'John Doe' }
  }

  async create(userData: CreateUserDto) {
    return { id: '1', ...userData }
  }
}
```

## Injecting Dependencies

Use `inject()` to request dependencies:

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
}
```

## Using Services in Controllers

Controllers inject services to delegate business logic:

```typescript
import { Controller, Endpoint, EndpointParams } from '@navios/core'
import { inject } from '@navios/di'

@Controller()
export class UserController {
  private userService = inject(UserService)

  @Endpoint(getUser)
  async getUser(params: EndpointParams<typeof getUser>) {
    return this.userService.findById(params.urlParams.userId)
  }
}
```

## Service Scopes

Services can have different lifecycles:

| Scope | Description |
|-------|-------------|
| `Singleton` | One instance for the entire application (default) |
| `Request` | One instance per HTTP request |
| `Transient` | New instance every time it's injected |

### Singleton (Default)

Shared across the entire application:

```typescript
@Injectable({ scope: InjectableScope.Singleton })
export class ConfigService {
  private config = new Map()

  get(key: string) {
    return this.config.get(key)
  }
}
```

### Request Scope

New instance for each HTTP request - useful for request-specific state:

```typescript
import { Injectable, InjectableScope } from '@navios/di'

@Injectable({ scope: InjectableScope.Request })
export class RequestContextService {
  private requestId = crypto.randomUUID()
  private userId: string | null = null

  getRequestId() {
    return this.requestId
  }

  setUserId(userId: string) {
    this.userId = userId
  }
}
```

### Transient

New instance every injection:

```typescript
@Injectable({ scope: InjectableScope.Transient })
export class UtilityService {
  createId() {
    return crypto.randomUUID()
  }
}
```

## Repository Pattern

Abstract data access with repositories:

```typescript
@Injectable()
export class UserRepository {
  private database = inject(DatabaseService)

  async findById(id: string) {
    return this.database.users.findUnique({ where: { id } })
  }

  async create(data: CreateUserDto) {
    return this.database.users.create({ data })
  }
}

@Injectable()
export class UserService {
  private userRepository = inject(UserRepository)

  async getUser(id: string) {
    const user = await this.userRepository.findById(id)
    if (!user) {
      throw new NotFoundException('User not found')
    }
    return user
  }
}
```

## Best Practices

**Single responsibility**: Each service should have one well-defined purpose.

**Proper scopes**: Use singleton for stateless services, request scope for request-specific data.

**Let exceptions bubble**: Throw appropriate HTTP exceptions from services.

```typescript
@Injectable()
export class UserService {
  async findById(id: string) {
    const user = await this.repository.findById(id)
    if (!user) {
      throw new NotFoundException(`User ${id} not found`)
    }
    return user
  }
}
```

## Advanced Topics

For more advanced dependency injection topics, see the [DI documentation](/docs/di):

- [Injection Tokens](/docs/di/guides/injection-tokens) - For interfaces and non-class dependencies
- [Factories](/docs/di/guides/factories) - Creating services with factories
- [Scopes](/docs/di/guides/scopes) - Detailed scope documentation
