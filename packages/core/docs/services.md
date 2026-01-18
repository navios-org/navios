# Services and Dependency Injection

Navios provides a powerful dependency injection system based on `@navios/di` that allows you to create and manage services throughout your application. Services are typically used to encapsulate business logic, data access, and other shared functionality.

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

## Dependency Injection

### Using `inject()`

The `inject()` function is the primary way to inject dependencies:

```typescript
import { inject } from '@navios/di'

@Injectable()
export class UserService {
  private database = inject(DatabaseService)
  private config = inject(ConfigService)
  private logger = inject(Logger, { context: 'UserService' })

  async findAll() {
    const pageSize = this.config.get('PAGE_SIZE')
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

Services can have different scopes that determine their lifecycle:

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

```typescript
@Injectable({ scope: InjectableScope.Request })
export class RequestContextService {
  // New instance created for each HTTP request
  private requestId = crypto.randomUUID()

  getRequestId() {
    return this.requestId
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

## Service Tokens

Use injection tokens for more flexible dependency injection:

### Creating Custom Tokens

```typescript
import { InjectionToken } from '@navios/di'

// Create a token for configuration
export const CONFIG_TOKEN = InjectionToken.create<{
  apiUrl: string
  apiKey: string
}>('CONFIG')

// Create a token for a database interface
export interface DatabaseInterface {
  findUser(id: string): Promise<User>
  createUser(data: CreateUserDto): Promise<User>
}

export const DATABASE_TOKEN = InjectionToken.create<DatabaseInterface>('DATABASE')
```

### Using Tokens in Services

```typescript
@Injectable()
export class UserService {
  private config = inject(CONFIG_TOKEN)
  private database = inject(DATABASE_TOKEN)

  async findById(id: string) {
    const apiUrl = this.config.apiUrl
    return this.database.findUser(id)
  }
}
```

## Common Service Patterns

### Repository Pattern

```typescript
export interface UserRepository {
  findById(id: string): Promise<User | null>
  findAll(): Promise<User[]>
  create(user: CreateUserDto): Promise<User>
  update(id: string, user: UpdateUserDto): Promise<User>
  delete(id: string): Promise<void>
}

export const USER_REPOSITORY_TOKEN = InjectionToken.create<UserRepository>('USER_REPOSITORY')

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
  private userRepository = inject(USER_REPOSITORY_TOKEN)

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

```typescript
export interface EmailProvider {
  send(to: string, subject: string, body: string): Promise<void>
}

@Factory()
export class EmailProviderFactory {
  private config = inject(ConfigService)

  create(): EmailProvider {
    const provider = this.config.get('EMAIL_PROVIDER')

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

### Event Service

```typescript
export interface DomainEvent {
  type: string
  payload: any
  timestamp: Date
}

@Injectable()
export class EventService {
  private events: DomainEvent[] = []
  private handlers = new Map<string, Function[]>()

  publish(event: DomainEvent) {
    this.events.push(event)
    const handlers = this.handlers.get(event.type) || []
    handlers.forEach((handler) => handler(event))
  }

  subscribe(eventType: string, handler: Function) {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, [])
    }
    this.handlers.get(eventType)!.push(handler)
  }
}

@Injectable()
export class UserService {
  private eventService = inject(EventService)

  async createUser(userData: CreateUserDto) {
    const user = await this.database.users.create({ data: userData })

    // Publish domain event
    this.eventService.publish({
      type: 'USER_CREATED',
      payload: { userId: user.id, email: user.email },
      timestamp: new Date(),
    })

    return user
  }
}
```

## Configuration Service

```typescript
import { Injectable } from '@navios/di'

@Injectable()
export class ConfigService {
  private config = new Map<string, any>()

  constructor() {
    // Load configuration from environment variables
    this.config.set('DATABASE_URL', process.env.DATABASE_URL)
    this.config.set('JWT_SECRET', process.env.JWT_SECRET)
    this.config.set('PORT', parseInt(process.env.PORT || '3000', 10))
  }

  get<T = string>(key: string): T {
    return this.config.get(key)
  }

  set(key: string, value: any) {
    this.config.set(key, value)
  }

  has(key: string): boolean {
    return this.config.has(key)
  }
}

// Usage in other services
@Injectable()
export class DatabaseService {
  private config = inject(ConfigService)

  connect() {
    const databaseUrl = this.config.get('DATABASE_URL')
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
