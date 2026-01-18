# Testing Guide

This guide covers testing strategies and best practices for Navios applications, including unit testing, integration testing, and end-to-end testing.

## Testing Philosophy

Navios promotes a testing-first approach with:

- **Unit Tests** - Test individual components in isolation
- **Integration Tests** - Test component interactions
- **End-to-End Tests** - Test complete user workflows

## Setting Up Testing

### Test Dependencies

```bash
npm install --save-dev vitest supertest @navios/builder
```

## Testing Module

Navios provides a dedicated testing module that simplifies setting up test environments with mock dependencies.

### Creating a Testing Module

The `createTestingModule` function is the main entry point for setting up tests:

```typescript
import { createTestingModule } from '@navios/core/testing'

import { AppModule } from './app.module'
import { DatabaseService } from './database.service'

describe('AppModule', () => {
  it('should create application with mocked dependencies', async () => {
    const mockDatabase = {
      query: vi.fn().mockResolvedValue([]),
    }

    const testingModule = createTestingModule(AppModule, {
      adapter: [], // No HTTP adapter for unit tests
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDatabase)

    const app = await testingModule.compile()

    // App is ready to use with mocked DatabaseService
    expect(app).toBeDefined()

    await testingModule.close()
  })
})
```

### TestingModule API

#### `createTestingModule(appModule, options)`

Creates a new testing module builder.

```typescript
const testingModule = createTestingModule(AppModule, {
  adapter: [], // Required: HTTP adapter configuration
  logger: false, // Optional: Disable logging for tests
  overrides: [
    // Optional: Initial overrides
    { token: SomeService, useValue: mockService },
  ],
})
```

#### `.overrideProvider(token)`

Returns a builder for overriding a provider:

```typescript
testingModule.overrideProvider(DatabaseService).useValue(mockDatabaseService) // Use a mock value

testingModule.overrideProvider(CacheService).useClass(MockCacheService) // Use a mock class
```

#### `.compile()`

Compiles the testing module and returns the `NaviosApplication`:

```typescript
const app = await testingModule.compile()
```

#### `.init()`

Compiles and initializes the application (equivalent to calling `compile()` then `app.init()`):

```typescript
const app = await testingModule.init()
```

#### `.get(token)`

Gets an instance from the container:

```typescript
const userService = await testingModule.get(UserService)
```

#### `.getContainer()`

Gets the underlying `TestContainer` for direct manipulation:

```typescript
const container = testingModule.getContainer()
container.bind(SomeToken).toValue(someValue)
```

#### `.close()`

Disposes the testing module and cleans up resources:

```typescript
await testingModule.close()
```

### Custom Container Support

You can also pass a custom container directly to `NaviosFactory.create()`:

```typescript
import { NaviosFactory } from '@navios/core'
import { TestContainer } from '@navios/core/testing'

const container = new TestContainer()
container.bind(DatabaseService).toValue(mockDatabase)

const app = await NaviosFactory.create(AppModule, {
  adapter: [],
  container, // Use custom container
})
```

This is useful when you need more control over the container setup or when integrating with existing test infrastructure.

## Unit Testing

### Testing Services

```typescript
import { TestContainer } from '@navios/core/testing'

import { DatabaseService } from './database.service.js'
import { UserService } from './user.service.js'

describe('UserService', () => {
  let userService: UserService
  let mockDatabase: vi.Mocked<DatabaseService>

  beforeEach(() => {
    const container = new TestContainer()

    // Create mock database
    mockDatabase = {
      users: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    } as any

    container.bind(DatabaseService).toValue(mockDatabase)
    userService = container.get(UserService)
  })

  describe('findById', () => {
    it('should return user when found', async () => {
      const mockUser = { id: '1', name: 'John', email: 'john@test.com' }
      mockDatabase.users.findUnique.mockResolvedValue(mockUser)

      const result = await userService.findById('1')

      expect(result).toEqual(mockUser)
      expect(mockDatabase.users.findUnique).toHaveBeenCalledWith({
        where: { id: '1' },
      })
    })

    it('should return null when user not found', async () => {
      mockDatabase.users.findUnique.mockResolvedValue(null)

      const result = await userService.findById('1')

      expect(result).toBeNull()
    })
  })

  describe('create', () => {
    it('should create and return new user', async () => {
      const userData = { name: 'John', email: 'john@test.com' }
      const createdUser = { id: '1', ...userData }

      mockDatabase.users.create.mockResolvedValue(createdUser)

      const result = await userService.create(userData)

      expect(result).toEqual(createdUser)
      expect(mockDatabase.users.create).toHaveBeenCalledWith({
        data: userData,
      })
    })
  })
})
```

### Testing Controllers

Controllers in Navios should use endpoints defined with `@navios/builder` for proper type safety and schema validation.

#### Endpoint Definitions

```typescript
// api/user.endpoints.ts
import { builder } from '@navios/builder'

import { z } from 'zod'

const userApi = builder()

export const getUserByIdEndpoint = userApi.declareEndpoint({
  method: 'GET',
  url: '/users/$id',
  responseSchema: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
  }),
})

export const createUserEndpoint = userApi.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema: z.object({
    name: z.string().min(1),
    email: z.string().email(),
  }),
  responseSchema: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
  }),
})
```

#### Controller Implementation

```typescript
// user.controller.ts
import { Controller, Endpoint, EndpointParams } from '@navios/core'
import { inject } from '@navios/di'

import { createUserEndpoint, getUserByIdEndpoint } from '../api/user.endpoints'
import { UserService } from './user.service'

@Controller()
export class UserController {
  private userService = inject(UserService)

  @Endpoint(getUserByIdEndpoint)
  async getUserById(params: EndpointParams<typeof getUserByIdEndpoint>) {
    const user = await this.userService.findById(params.params.id)
    if (!user) {
      throw new NotFoundException('User not found')
    }
    return user
  }

  @Endpoint(createUserEndpoint)
  async createUser(params: EndpointParams<typeof createUserEndpoint>) {
    return this.userService.create(params.data)
  }
}
```

#### Testing Controllers

```typescript
import type { EndpointParams } from '@navios/core'

import { NotFoundException } from '@navios/core'
import { TestContainer } from '@navios/core/testing'

import { UserController } from './user.controller'
import { UserService } from './user.service'

describe('UserController', () => {
  let container: TestContainer
  let controller: UserController
  let userService: vi.Mocked<UserService>

  beforeEach(async () => {
    userService = {
      findById: vi.fn(),
      findAll: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } as any

    container = new TestContainer()
    // Use dependency injection or manual injection
    controller = await container.get(UserController)
    // Inject mocked service (implementation depends on your DI setup)
  })

  describe('getUserById', () => {
    it('should return user when found', async () => {
      const mockUser = { id: '1', name: 'John', email: 'john@test.com' }
      userService.findById.mockResolvedValue(mockUser)

      const result = await controller.getUserById({
        params: { id: '1' },
        query: {},
        data: {},
        headers: {},
        request: {} as any,
        response: {} as any,
      })

      expect(result).toEqual(mockUser)
      expect(userService.findById).toHaveBeenCalledWith('1')
    })

    it('should throw NotFoundException when user not found', async () => {
      userService.findById.mockResolvedValue(null)

      await expect(
        controller.getUserById({
          params: { id: '1' },
          query: {},
          data: {},
          headers: {},
          request: {} as any,
          response: {} as any,
        }),
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('createUser', () => {
    it('should create and return new user', async () => {
      const userData = { name: 'John', email: 'john@test.com' }
      const createdUser = { id: '1', ...userData }

      userService.create.mockResolvedValue(createdUser)

      const result = await controller.createUser({
        params: {},
        query: {},
        data: userData,
        headers: {},
        request: {} as any,
        response: {} as any,
      })

      expect(result).toEqual(createdUser)
      expect(userService.create).toHaveBeenCalledWith(userData)
    })
  })
})
```

### Testing Guards

```typescript
import { TestContainer } from '@navios/core/testing'

import { AuthGuard } from './auth.guard'
import { JwtService } from './jwt.service'
import { UserService } from './user.service'

describe('AuthGuard', () => {
  let guard: AuthGuard
  let jwtService: vi.Mocked<JwtService>
  let userService: vi.Mocked<UserService>

  beforeEach(() => {
    const container = new TestContainer()

    jwtService = {
      verify: vi.fn(),
    } as any

    userService = {
      findById: vi.fn(),
    } as any

    container.bind(JwtService).toValue(jwtService)
    container.bind(UserService).toValue(userService)

    guard = container.get(AuthGuard)
  })

  describe('canActivate', () => {
    it('should return true for valid token', async () => {
      const mockUser = { id: '1', isActive: true }
      const context = {
        headers: { authorization: 'Bearer valid-token' },
        request: {},
      } as any

      jwtService.verify.mockResolvedValue({ sub: '1' })
      userService.findById.mockResolvedValue(mockUser)

      const result = await guard.canActivate(context)

      expect(result).toBe(true)
      expect(context.request.user).toEqual(mockUser)
    })

    it('should return false for invalid token', async () => {
      const context = {
        headers: { authorization: 'Bearer invalid-token' },
        request: {},
      } as any

      jwtService.verify.mockRejectedValue(new Error('Invalid token'))

      const result = await guard.canActivate(context)

      expect(result).toBe(false)
      expect(context.request.user).toBeUndefined()
    })

    it('should return false when no token provided', async () => {
      const context = {
        headers: {},
        request: {},
      } as any

      const result = await guard.canActivate(context)

      expect(result).toBe(false)
    })
  })
})
```

## Integration Testing

### Testing Module Integration

```typescript
import { createTestingModule } from '@navios/core/testing'
import { defineFastifyEnvironment } from '@navios/adapter-fastify'

import { DatabaseService } from './database.service'
import { UserModule } from './user.module'
import { UserService } from './user.service'

describe('UserModule', () => {
  let testingModule: ReturnType<typeof createTestingModule>
  let userService: UserService
  let databaseService: DatabaseService

  beforeAll(async () => {
    testingModule = createTestingModule(UserModule, {
      adapter: defineFastifyEnvironment(),
    })

    await testingModule.init()

    userService = await testingModule.get(UserService)
    databaseService = await testingModule.get(DatabaseService)
  })

  afterAll(async () => {
    await testingModule.close()
  })

  it('should be defined', () => {
    expect(userService).toBeDefined()
    expect(databaseService).toBeDefined()
  })

  it('should inject dependencies correctly', () => {
    expect(userService).toBeInstanceOf(UserService)
  })
})
```

### Testing HTTP Endpoints

When testing HTTP endpoints, ensure your endpoints are defined using `@navios/builder` for proper validation and type safety.

```typescript
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { createTestingModule } from '@navios/core/testing'

import * as request from 'supertest'

import { AppModule } from '../app.module'

describe('UserController (e2e)', () => {
  let testingModule: ReturnType<typeof createTestingModule>
  let httpServer: any

  beforeAll(async () => {
    testingModule = createTestingModule(AppModule, {
      adapter: defineFastifyEnvironment(),
    })

    const app = await testingModule.init()
    httpServer = app.getServer()
  })

  afterAll(async () => {
    await testingModule.close()
  })

  describe('/users (GET)', () => {
    it('should return array of users', () => {
      return request(httpServer)
        .get('/users')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true)
        })
    })
  })

  describe('/users/:id (GET)', () => {
    it('should return user by id', () => {
      return request(httpServer)
        .get('/users/1')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('id')
          expect(res.body.id).toBe('1')
        })
    })

    it('should return 404 for non-existent user', () => {
      return request(httpServer).get('/users/999').expect(404)
    })
  })

  describe('/users (POST)', () => {
    it('should create new user', () => {
      const userData = {
        name: 'John Doe',
        email: 'john@test.com',
      }

      return request(httpServer)
        .post('/users')
        .send(userData)
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id')
          expect(res.body.name).toBe(userData.name)
          expect(res.body.email).toBe(userData.email)
        })
    })

    it('should return 400 for invalid data', () => {
      return request(httpServer)
        .post('/users')
        .send({ name: '' }) // Invalid data
        .expect(400)
    })
  })
})

  describe('/upload (POST) - Multipart', () => {
    it('should handle file uploads', () => {
      return request(httpServer)
        .post('/upload')
        .attach('file', Buffer.from('test file content'), 'test.txt')
        .field('description', 'Test file upload')
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('filename')
          expect(res.body).toHaveProperty('size')
        })
    })
  })
})
```

### Testing Multipart Endpoints

When testing multipart endpoints defined with `@navios/builder`:

```typescript
// api/upload.endpoints.ts
import { builder } from '@navios/builder'
// upload.controller.ts
import { Controller, Multipart, MultipartParams } from '@navios/core'

import { z } from 'zod'

const api = builder()

export const uploadEndpoint = api.declareMultipart({
  method: 'POST',
  url: '/upload',
  requestSchema: z.object({
    files: z.array(z.instanceof(File)),
    description: z.string(),
  }),
  responseSchema: z.object({
    filename: z.string(),
    size: z.number(),
  }),
})

@Controller()
export class UploadController {
  @Multipart(uploadEndpoint)
  async uploadFile(params: MultipartParams<typeof uploadEndpoint>) {
    const { files, description } = params.data
    // Handle file upload logic
    return {
      filename: files[0].name,
      size: files[0].size,
    }
  }
}
```

## Testing with Authentication

### Testing Protected Endpoints

```typescript
describe('Protected Endpoints', () => {
  let authToken: string

  beforeAll(async () => {
    // Login and get auth token
    const loginResponse = await request(httpServer)
      .post('/auth/login')
      .send({
        email: 'test@example.com',
        password: 'password',
      })
      .expect(200)

    authToken = loginResponse.body.token
  })

  describe('/profile (GET)', () => {
    it('should return user profile with valid token', () => {
      return request(httpServer)
        .get('/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
    })

    it('should return 401 without token', () => {
      return request(httpServer).get('/profile').expect(401)
    })

    it('should return 401 with invalid token', () => {
      return request(httpServer)
        .get('/profile')
        .set('Authorization', `Bearer invalid-token`)
        .expect(401)
    })
  })
})
```

## Mock Strategies

### Creating Service Mocks

```typescript
// test/mocks/user.service.mock.ts
export const mockUserService = {
  findById: vi.fn(),
  findAll: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}

// Reset mocks between tests
beforeEach(() => {
  vi.clearAllMocks()
})
```

### Factory Pattern for Test Data

```typescript
// test/factories/user.factory.ts
export class UserFactory {
  static create(overrides: Partial<User> = {}): User {
    return {
      id: '1',
      name: 'John Doe',
      email: 'john@test.com',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }
  }

  static createMany(count: number, overrides: Partial<User> = {}): User[] {
    return Array.from({ length: count }, (_, i) =>
      this.create({
        id: String(i + 1),
        ...overrides,
      }),
    )
  }
}

// Usage in tests
describe('UserService', () => {
  it('should handle multiple users', async () => {
    const users = UserFactory.createMany(3)
    mockDatabase.users.findMany.mockResolvedValue(users)

    const result = await userService.findAll()

    expect(result).toHaveLength(3)
    expect(result).toEqual(users)
  })
})
```

## Test Organization

### Folder Structure

```
src/
├── user/
│   ├── user.controller.ts
│   ├── user.service.ts
│   ├── user.module.ts
│   └── __tests__/
│       ├── user.controller.spec.ts
│       ├── user.service.spec.ts
└── test/
    ├── fixtures/
    ├── mocks/
    ├── factories/
    └── e2e/
        └── user.e2e-spec.ts
```

## Best Practices

### 1. Test Isolation

Ensure tests don't depend on each other:

```typescript
describe('UserService', () => {
  beforeEach(() => {
    // Reset state before each test
    vi.clearAllMocks()
  })

  // Each test should be independent
})
```

### 2. Use Descriptive Test Names

```typescript
// ✅ Good - Descriptive names
it('should throw NotFoundException when user does not exist', () => {})
it('should return user data when valid ID is provided', () => {})

// ❌ Avoid - Vague names
it('should work', () => {})
it('should fail', () => {})
```

### 3. Test Edge Cases

```typescript
describe('UserService.findById', () => {
  it('should return user for valid ID', async () => {
    // Happy path
  })

  it('should return null for non-existent ID', async () => {
    // Edge case
  })

  it('should handle database connection errors', async () => {
    // Error case
  })

  it('should validate ID format', async () => {
    // Input validation
  })
})
```

### 4. Keep Tests Simple

```typescript
// ✅ Good - Simple and focused
it('should create user with valid data', async () => {
  const userData = { name: 'John', email: 'john@test.com' }
  mockDatabase.users.create.mockResolvedValue({ id: '1', ...userData })

  const result = await userService.create(userData)

  expect(result).toMatchObject(userData)
})

// ❌ Avoid - Testing multiple things
it('should create user and send email and log event', async () => {
  // Too many responsibilities
})
```
