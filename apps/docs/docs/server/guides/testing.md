---
sidebar_position: 9
title: Testing
---

# Testing

Testing strategies for Navios applications: unit tests, integration tests, and end-to-end tests.

## Setup

Install test dependencies:

```bash
npm install --save-dev vitest supertest
```

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
})
```

## Testing Module

The `createTestingModule` function sets up test environments with mock dependencies.

### Basic Usage

```typescript
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { createTestingModule } from '@navios/core/testing'

describe('AppModule', () => {
  it('should create application with mocked dependencies', async () => {
    const mockDatabase = { query: vi.fn().mockResolvedValue([]) }

    const testingModule = createTestingModule(AppModule, {
      adapter: defineFastifyEnvironment(),
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDatabase)

    const app = await testingModule.compile()
    expect(app).toBeDefined()

    await testingModule.close()
  })
})
```

### TestingModule API

| Method | Description |
|--------|-------------|
| `overrideProvider(token).useValue(mock)` | Replace a service with a mock value |
| `overrideProvider(token).useClass(MockClass)` | Replace with a mock class |
| `compile()` | Compile and return the NaviosApplication |
| `init()` | Compile and initialize (equivalent to compile + app.init) |
| `get(token)` | Get an instance from the container |
| `close()` | Clean up resources |

## Unit Testing

### Testing Services

```typescript
import { TestContainer } from '@navios/core/testing'

describe('UserService', () => {
  let userService: UserService
  let mockDatabase: vi.Mocked<DatabaseService>

  beforeEach(() => {
    const container = new TestContainer()
    mockDatabase = {
      users: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
    } as any

    container.bind(DatabaseService).toValue(mockDatabase)
    userService = container.get(UserService)
  })

  it('should return user when found', async () => {
    const mockUser = { id: '1', name: 'John' }
    mockDatabase.users.findUnique.mockResolvedValue(mockUser)

    const result = await userService.findById('1')

    expect(result).toEqual(mockUser)
  })

  it('should throw when user not found', async () => {
    mockDatabase.users.findUnique.mockResolvedValue(null)

    await expect(userService.findById('1')).rejects.toThrow(NotFoundException)
  })
})
```

### Testing Controllers

```typescript
import { TestContainer } from '@navios/core/testing'

describe('UserController', () => {
  let controller: UserController
  let userService: vi.Mocked<UserService>

  beforeEach(async () => {
    userService = {
      findById: vi.fn(),
      create: vi.fn(),
    } as any

    const container = new TestContainer()
    container.bind(UserService).toValue(userService)
    controller = await container.get(UserController)
  })

  it('should return user when found', async () => {
    const mockUser = { id: '1', name: 'John' }
    userService.findById.mockResolvedValue(mockUser)

    const result = await controller.getUser({
      urlParams: { id: '1' },
      query: {},
      data: {},
      headers: {},
    })

    expect(result).toEqual(mockUser)
  })
})
```

### Testing Guards

```typescript
describe('AuthGuard', () => {
  let guard: AuthGuard
  let jwtService: vi.Mocked<JwtService>

  beforeEach(() => {
    const container = new TestContainer()
    jwtService = { verify: vi.fn() } as any
    container.bind(JwtService).toValue(jwtService)
    guard = container.get(AuthGuard)
  })

  it('should return true for valid token', async () => {
    const context = {
      getRequest: () => ({
        headers: { authorization: 'Bearer valid-token' },
      }),
    } as any

    jwtService.verify.mockResolvedValue({ sub: '1' })

    const result = await guard.canActivate(context)
    expect(result).toBe(true)
  })

  it('should throw for missing token', async () => {
    const context = {
      getRequest: () => ({ headers: {} }),
    } as any

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException)
  })
})
```

## Integration Testing

### Testing HTTP Endpoints

```typescript
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { createTestingModule } from '@navios/core/testing'
import * as request from 'supertest'

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

  it('GET /users/:id - should return user', () => {
    return request(httpServer)
      .get('/users/1')
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('id')
      })
  })

  it('POST /users - should create user', () => {
    return request(httpServer)
      .post('/users')
      .send({ name: 'John', email: 'john@test.com' })
      .expect(201)
  })

  it('POST /users - should return 400 for invalid data', () => {
    return request(httpServer)
      .post('/users')
      .send({ name: '' })
      .expect(400)
  })
})
```

### Testing Protected Endpoints

```typescript
describe('Protected Endpoints', () => {
  let httpServer: any
  let authToken: string

  beforeAll(async () => {
    // ... setup testingModule

    const loginResponse = await request(httpServer)
      .post('/auth/login')
      .send({ email: 'test@example.com', password: 'password' })

    authToken = loginResponse.body.token
  })

  it('should return profile with valid token', () => {
    return request(httpServer)
      .get('/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200)
  })

  it('should return 401 without token', () => {
    return request(httpServer)
      .get('/profile')
      .expect(401)
  })
})
```

## Test Utilities

### Test Data Factories

```typescript
// test/factories/user.factory.ts
export class UserFactory {
  static create(overrides: Partial<User> = {}): User {
    return {
      id: '1',
      name: 'John Doe',
      email: 'john@test.com',
      ...overrides,
    }
  }

  static createMany(count: number): User[] {
    return Array.from({ length: count }, (_, i) =>
      this.create({ id: String(i + 1) })
    )
  }
}
```

### Mock Utilities

```typescript
// test/mocks/user.service.mock.ts
export const mockUserService = {
  findById: vi.fn(),
  findAll: vi.fn(),
  create: vi.fn(),
}

// Reset between tests
beforeEach(() => {
  vi.clearAllMocks()
})
```

## Best Practices

**Test isolation**: Reset mocks between tests with `vi.clearAllMocks()`.

**Descriptive names**: Use clear test names that describe the expected behavior.

**Test edge cases**: Test not just happy paths but error cases too.

**Keep tests focused**: Each test should verify one behavior.

```typescript
// Good - focused test
it('should throw NotFoundException when user does not exist', async () => {
  mockDatabase.users.findUnique.mockResolvedValue(null)
  await expect(userService.findById('1')).rejects.toThrow(NotFoundException)
})

// Avoid - testing multiple things
it('should create user and send email and log event', async () => {
  // Too many responsibilities in one test
})
```

For advanced testing topics related to dependency injection, see the [DI documentation](/docs/di/guides/testing).
