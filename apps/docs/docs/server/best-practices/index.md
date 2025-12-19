---
sidebar_position: 1
title: Best Practices
---

# Best Practices

This guide covers best practices for building Navios applications, including project structure, design patterns, error handling, performance optimization, security, and testing strategies.

## Table of Contents

- [Project Structure](#project-structure)
- [Module Design](#module-design)
- [Service Patterns](#service-patterns)
- [Error Handling](#error-handling)
- [Performance Optimization](#performance-optimization)
- [Security](#security)
- [Testing Strategies](#testing-strategies)
- [Type Safety with Builder](#type-safety-with-builder)

## Project Structure

### Recommended Folder Structure

Organize your application with a clear, scalable structure:

```
src/
├── api/                    # API endpoint definitions
│   ├── user.endpoints.ts
│   ├── order.endpoints.ts
│   └── index.ts
├── modules/                # Feature modules
│   ├── user/
│   │   ├── user.module.ts
│   │   ├── user.controller.ts
│   │   ├── user.service.ts
│   │   └── user.repository.ts
│   └── order/
│       ├── order.module.ts
│       ├── order.controller.ts
│       └── order.service.ts
├── shared/                 # Shared utilities
│   ├── guards/
│   ├── decorators/
│   └── utils/
├── config/                 # Configuration
│   ├── app.config.ts
│   └── database.config.ts
├── app.module.ts          # Root module
└── main.ts                # Application entry point
```

### API Definitions Location

Keep all endpoint definitions in a centralized `api/` directory:

```typescript
// api/user.endpoints.ts
import { builder } from '@navios/builder'
import { z } from 'zod'

const userApi = builder()

export const getUser = userApi.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

export const createUser = userApi.declareEndpoint({
  method: 'POST',
  url: '/users',
  dataSchema: createUserSchema,
  responseSchema: userSchema,
})
```

:::tip
Always use `@navios/builder` to define endpoints. See the [Builder documentation](/docs/builder/guides/defining-endpoints) for details.
:::

## Module Design

### Feature Modules

Organize code into feature modules that group related functionality:

```typescript
// ✅ Good - Feature module
@Module({
  controllers: [UserController],
})
export class UserModule {}

// ❌ Avoid - God module with everything
@Module({
  controllers: [UserController, OrderController, ProductController, ...],
})
export class AppModule {}
```

### Module Imports

Import modules to compose functionality:

```typescript
@Module({
  controllers: [OrderController],
  imports: [UserModule, ProductModule], // Import related modules
})
export class OrderModule {}
```

### Shared Modules

Create shared modules for common functionality:

```typescript
@Module({
  controllers: [], // No controllers, just provides services
})
export class DatabaseModule {}

@Module({
  controllers: [], // No controllers, just provides services
})
export class AuthModule {}
```

## Service Patterns

### Single Responsibility

Each service should have a single, well-defined responsibility:

```typescript
// ✅ Good - Single responsibility
@Injectable()
export class UserService {
  async findById(id: string) { /* ... */ }
  async create(user: CreateUserDto) { /* ... */ }
  async update(id: string, user: UpdateUserDto) { /* ... */ }
}

// ❌ Avoid - Multiple responsibilities
@Injectable()
export class UserEmailAuthService {
  // Too many responsibilities mixed together
}
```

### Repository Pattern

Use repositories to abstract data access:

```typescript
@Injectable()
export class UserRepository {
  private db = inject(DatabaseService)

  async findById(id: string) {
    return this.db.users.findUnique({ where: { id } })
  }
}

@Injectable()
export class UserService {
  private repository = inject(UserRepository)

  async getUser(id: string) {
    const user = await this.repository.findById(id)
    if (!user) {
      throw new NotFoundException('User not found')
    }
    return user
  }
}
```

### Keep Controllers Thin

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

## Error Handling

### Use Appropriate Exceptions

Use the correct exception type for each scenario:

```typescript
// ✅ Good - Appropriate exceptions
if (!user) {
  throw new NotFoundException('User not found')
}

if (!hasPermission) {
  throw new ForbiddenException('Insufficient permissions')
}

if (invalidInput) {
  throw new BadRequestException('Invalid input')
}

// ❌ Avoid - Generic exceptions
if (!user) {
  throw new Error('User not found') // Should use NotFoundException
}
```

### Error Messages

Provide clear, actionable error messages:

```typescript
// ✅ Good - Clear error messages
throw new NotFoundException(`User with ID ${id} not found`)
throw new BadRequestException('Email is required and must be valid')

// ❌ Avoid - Vague error messages
throw new NotFoundException('Not found')
throw new BadRequestException('Invalid')
```

### Error Handling in Services

Let exceptions bubble up from services:

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

  async update(id: string, data: UpdateUserDto) {
    const user = await this.findById(id) // Throws if not found
    return this.repository.update(id, data)
  }
}
```

For more details, see the [Error Handling guide](/docs/server/guides/error-handling).

## Performance Optimization

### Use Request Scoping Wisely

Use request-scoped services for request-specific data:

```typescript
// ✅ Good - Request-scoped for request data
@Injectable({ scope: InjectableScope.Request })
export class RequestContext {
  userId: string | null = null
}

// ✅ Good - Singleton for stateless services
@Injectable({ scope: InjectableScope.Singleton })
export class CacheService {
  // Stateless caching logic
}
```

### Database Query Optimization

Optimize database queries in repositories:

```typescript
@Injectable()
export class UserRepository {
  private db = inject(DatabaseService)

  // ✅ Good - Select only needed fields
  async findById(id: string) {
    return this.db.users.findUnique({
      where: { id },
      select: { id: true, name: true, email: true }, // Only select needed fields
    })
  }

  // ✅ Good - Use pagination
  async findAll(page: number, limit: number) {
    return this.db.users.findMany({
      skip: (page - 1) * limit,
      take: limit,
    })
  }
}
```

### Caching

Implement caching for expensive operations:

```typescript
@Injectable()
export class UserService {
  private cache = inject(CacheService)

  async findById(id: string) {
    // Check cache first
    const cached = await this.cache.get(`user:${id}`)
    if (cached) {
      return cached
    }

    // Fetch from database
    const user = await this.repository.findById(id)
    
    // Cache the result
    await this.cache.set(`user:${id}`, user, 3600) // Cache for 1 hour

    return user
  }
}
```

## Security

### Input Validation

Always validate input using Zod schemas:

```typescript
// ✅ Good - Validate with Zod
const createUser = API.declareEndpoint({
  method: 'POST',
  url: '/users',
  dataSchema: z.object({
    name: z.string().min(1).max(100),
    email: z.string().email(),
    age: z.number().min(0).max(120),
  }),
  responseSchema: userSchema,
})

// ❌ Avoid - No validation
const createUser = API.declareEndpoint({
  method: 'POST',
  url: '/users',
  // Missing dataSchema
})
```

### Authentication & Authorization

Use guards for authentication and authorization:

```typescript
// ✅ Good - Use guards
@Module({
  controllers: [UserController],
  guards: [AuthGuard], // Require authentication
})
export class UserModule {}

@Controller()
export class AdminController {
  @Endpoint(deleteUser)
  @UseGuards(AdminGuard) // Require admin role
  async deleteUser(params: EndpointParams<typeof deleteUser>) {
    // Only admins can reach here
  }
}
```

### Sensitive Data

Never log sensitive data:

```typescript
// ✅ Good - Don't log sensitive data
logger.log('User logged in', { userId: user.id }) // Only log user ID

// ❌ Avoid - Logging sensitive data
logger.log('User logged in', { password: user.password }) // Never log passwords
logger.log('Payment processed', { creditCard: card.number }) // Never log credit cards
```

### Environment Variables

Store sensitive configuration in environment variables:

```typescript
// ✅ Good - Use environment variables
const config = new ConfigService({
  jwt: {
    secret: process.env.JWT_SECRET!, // Required, fail if missing
  },
  database: {
    password: process.env.DATABASE_PASSWORD!,
  },
})

// ❌ Avoid - Hardcoded secrets
const config = new ConfigService({
  jwt: {
    secret: 'my-secret-key', // Never hardcode secrets
  },
})
```

For more details, see the [Guards & Authentication guide](/docs/server/guides/guards).

## Testing Strategies

### Unit Tests

Test services in isolation:

```typescript
describe('UserService', () => {
  let service: UserService
  let mockRepository: vi.Mocked<UserRepository>

  beforeEach(() => {
    const container = new TestContainer()
    mockRepository = { findById: vi.fn() } as any
    container.bind(UserRepository).toValue(mockRepository)
    service = container.get(UserService)
  })

  it('should return user when found', async () => {
    const mockUser = { id: '1', name: 'John' }
    mockRepository.findById.mockResolvedValue(mockUser)

    const result = await service.findById('1')

    expect(result).toEqual(mockUser)
  })
})
```

### Integration Tests

Test module integration:

```typescript
describe('UserModule', () => {
  let testingModule: ReturnType<typeof createTestingModule>

  beforeAll(async () => {
    testingModule = createTestingModule(UserModule, {
      adapter: defineFastifyEnvironment(),
    })
    await testingModule.init()
  })

  afterAll(async () => {
    await testingModule.close()
  })

  it('should inject dependencies correctly', async () => {
    const userService = await testingModule.get(UserService)
    expect(userService).toBeDefined()
  })
})
```

### E2E Tests

Test complete workflows:

```typescript
describe('UserController (e2e)', () => {
  let httpServer: any

  beforeAll(async () => {
    const testingModule = createTestingModule(AppModule, {
      adapter: defineFastifyEnvironment(),
    })
    const app = await testingModule.init()
    httpServer = app.getServer()
  })

  it('should create and retrieve user', async () => {
    const userData = { name: 'John', email: 'john@test.com' }

    // Create user
    const createResponse = await request(httpServer)
      .post('/users')
      .send(userData)
      .expect(201)

    const userId = createResponse.body.id

    // Retrieve user
    const getResponse = await request(httpServer)
      .get(`/users/${userId}`)
      .expect(200)

    expect(getResponse.body.name).toBe(userData.name)
  })
})
```

For more details, see the [Testing guide](/docs/server/guides/testing).

## Type Safety with Builder

### Always Use Builder

Always use `@navios/builder` to define endpoints:

```typescript
// ✅ Good - Use builder
const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

@Endpoint(getUser)
async getUser(params: EndpointParams<typeof getUser>) {
  // params.urlParams.userId is typed as string
}

// ❌ Avoid - Direct configuration
@Endpoint({
  method: 'GET',
  url: '/users/:userId',
})
async getUser(params: any) {
  // No type safety
}
```

### Type-Safe Schemas

Use Zod schemas for type safety:

```typescript
// ✅ Good - Type-safe schemas
const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
})

const createUser = API.declareEndpoint({
  method: 'POST',
  url: '/users',
  dataSchema: z.object({
    name: z.string().min(1),
    email: z.string().email(),
  }),
  responseSchema: userSchema,
})

@Endpoint(createUser)
async createUser(params: EndpointParams<typeof createUser>) {
  // params.data.name is typed as string
  // params.data.email is typed as string
  // Return type must match userSchema
}
```

### Shared API Definitions

Share API definitions between client and server:

```typescript
// api/user.endpoints.ts (shared)
export const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

// Server - use in controller
@Endpoint(getUser)
async getUser(params: EndpointParams<typeof getUser>) { /* ... */ }

// Client - use in HTTP client
const user = await client.getUser({ userId: '123' })
```

For more details, see the [Builder documentation](/docs/builder/guides/defining-endpoints).

## Configuration Management

### Use ConfigService

Use `ConfigService` for type-safe configuration:

```typescript
// ✅ Good - Type-safe configuration
interface AppConfig {
  port: number
  database: { host: string; port: number }
}

const config = new ConfigService<AppConfig>({
  port: parseInt(process.env.PORT || '3000', 10),
  database: {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  },
})

// ❌ Avoid - Direct environment variable access
const port = process.env.PORT // No type safety
```

### Environment-Specific Configuration

Load different configuration based on environment:

```typescript
const environment = process.env.NODE_ENV || 'development'

const configs = {
  development: { debug: true, logLevel: 'debug' },
  production: { debug: false, logLevel: 'error' },
  test: { debug: true, logLevel: 'silent' },
}

const config = new ConfigService(configs[environment])
```

For more details, see the [ConfigService guide](/docs/server/guides/config-service).

## Logging

### Use Appropriate Log Levels

```typescript
// ✅ Good - Appropriate log levels
logger.error('Payment failed', error.stack) // For errors
logger.warn('Rate limit approaching') // For warnings
logger.log('User created successfully') // For important events
logger.debug('Cache lookup', { key }) // For debugging

// ❌ Avoid - Wrong log level
logger.error('User logged in') // Should be logger.log()
```

### Include Context

Always include context in logs:

```typescript
// ✅ Good - Clear context
private logger = inject(Logger, { context: 'UserService' })

// ❌ Avoid - No context
private logger = inject(Logger)
```

For more details, see the [Logging guide](/docs/server/guides/logging).

## Summary

Following these best practices will help you build maintainable, scalable, and secure Navios applications:

1. **Organize code** into feature modules with clear structure
2. **Keep controllers thin** and delegate to services
3. **Use appropriate exceptions** with clear error messages
4. **Validate input** with Zod schemas
5. **Use guards** for authentication and authorization
6. **Test thoroughly** with unit, integration, and E2E tests
7. **Use Builder** for type-safe endpoint definitions
8. **Use ConfigService** for type-safe configuration
9. **Log appropriately** with correct levels and context

For more specific guidance, see the individual guides:

- [Services & DI](/docs/server/guides/services)
- [Error Handling](/docs/server/guides/error-handling)
- [Guards & Authentication](/docs/server/guides/guards)
- [Testing](/docs/server/guides/testing)
- [ConfigService](/docs/server/guides/config-service)
- [Logging](/docs/server/guides/logging)

