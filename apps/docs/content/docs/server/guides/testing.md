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

The `TestingModule.create()` method sets up test environments with mock dependencies. It provides a fluent API for overriding providers and comprehensive assertion helpers.

### Basic Usage

```typescript
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { TestingModule } from '@navios/core/testing'

describe('AppModule', () => {
  it('should create application with mocked dependencies', async () => {
    const mockDatabase = { query: vi.fn().mockResolvedValue([]) }

    const module = await TestingModule.create(AppModule, {
      adapter: defineFastifyEnvironment(),
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDatabase)
      .init()

    const userService = await module.get(UserService)
    expect(userService).toBeDefined()

    await module.close()
  })
})
```

### TestingModule API

| Method | Description |
|--------|-------------|
| `TestingModule.create(AppModule, options)` | Create a new testing module |
| `overrideProvider(token).useValue(mock)` | Replace a service with a mock value |
| `overrideProvider(token).useClass(MockClass)` | Replace with a mock class |
| `compile()` | Compile the module (returns `this` for chaining) |
| `init()` | Compile and initialize with request scope (returns `this` for chaining) |
| `getApp()` | Get the compiled NaviosApplication |
| `getContainer()` | Get the underlying TestContainer |
| `getScopedContainer()` | Get the request-scoped container (after `init()`) |
| `get(token)` | Get an instance from the container |
| `close()` | Clean up resources |

### Assertion Helpers

TestingModule delegates assertion helpers from TestContainer:

```typescript
const module = await TestingModule.create(AppModule).init()

// Service resolution assertions
module.expectResolved(UserService)
module.expectNotResolved(UnusedService)

// Scope assertions
module.expectSingleton(DatabaseService)
module.expectTransient(RequestLogger)
module.expectRequestScoped(SessionService)

// Method call assertions (requires recordMethodCall)
module.expectCalled(UserService, 'findById')
module.expectCalledWith(UserService, 'findById', ['123'])
module.expectCallCount(UserService, 'findById', 2)

// Dependency graph for debugging
const graph = module.getDependencyGraph()
const simplified = module.getSimplifiedDependencyGraph()
```

## Unit Testing

### Using UnitTestingModule

For isolated unit tests without full module loading, use `UnitTestingModule`. It automatically tracks all method calls via proxies:

```typescript
import { UnitTestingModule } from '@navios/core/testing'

describe('UserService', () => {
  it('should find user by id', async () => {
    const mockDatabase = {
      users: {
        findUnique: vi.fn().mockResolvedValue({ id: '1', name: 'John' }),
      },
    }

    const module = UnitTestingModule.create({
      providers: [
        { token: UserService, useClass: UserService },
        { token: DatabaseService, useValue: mockDatabase },
      ],
    })

    const userService = await module.get(UserService)
    const result = await userService.findById('1')

    expect(result).toEqual({ id: '1', name: 'John' })

    // Method calls are automatically tracked
    module.expectCalled(UserService, 'findById')
    module.expectCalledWith(UserService, 'findById', ['1'])

    await module.close()
  })
})
```

### UnitTestingModule API

| Method | Description |
|--------|-------------|
| `UnitTestingModule.create(options)` | Create with provider configuration |
| `get(token)` | Get an instance (wrapped in tracking proxy) |
| `close()` | Dispose and clean up |
| `enableAutoMocking()` | Auto-mock unregistered dependencies |
| `disableAutoMocking()` | Strict mode (default) |
| `expectCalled(token, method)` | Assert method was called |
| `expectCalledWith(token, method, args)` | Assert method called with args |
| `expectCallCount(token, method, count)` | Assert call count |
| `expectInitialized(token)` | Assert onServiceInit was called |
| `expectDestroyed(token)` | Assert onServiceDestroy was called |

### Testing Services with TestContainer

For more control, use `TestContainer` directly:

```typescript
import { TestContainer } from '@navios/core/testing'

describe('UserService', () => {
  let container: TestContainer
  let userService: UserService
  let mockDatabase: vi.Mocked<DatabaseService>

  beforeEach(async () => {
    container = new TestContainer()
    mockDatabase = {
      users: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
    } as any

    container.bind(DatabaseService).toValue(mockDatabase)
    userService = await container.get(UserService)
  })

  afterEach(async () => {
    await container.dispose()
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
  let container: TestContainer
  let controller: UserController
  let userService: vi.Mocked<UserService>

  beforeEach(async () => {
    container = new TestContainer()
    userService = {
      findById: vi.fn(),
      create: vi.fn(),
    } as any

    container.bind(UserService).toValue(userService)
    controller = await container.get(UserController)
  })

  afterEach(async () => {
    await container.dispose()
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
  let container: TestContainer
  let guard: AuthGuard
  let jwtService: vi.Mocked<JwtService>

  beforeEach(async () => {
    container = new TestContainer()
    jwtService = { verify: vi.fn() } as any
    container.bind(JwtService).toValue(jwtService)
    guard = await container.get(AuthGuard)
  })

  afterEach(async () => {
    await container.dispose()
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
import { TestingModule } from '@navios/core/testing'
import * as request from 'supertest'

describe('UserController (e2e)', () => {
  let module: TestingModule
  let httpServer: any

  beforeAll(async () => {
    module = await TestingModule.create(AppModule, {
      adapter: defineFastifyEnvironment(),
    }).init()

    httpServer = module.getApp().getServer()
  })

  afterAll(async () => {
    await module.close()
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
  let module: TestingModule
  let httpServer: any
  let authToken: string

  beforeAll(async () => {
    module = await TestingModule.create(AppModule, {
      adapter: defineFastifyEnvironment(),
    }).init()

    httpServer = module.getApp().getServer()

    const loginResponse = await request(httpServer)
      .post('/auth/login')
      .send({ email: 'test@example.com', password: 'password' })

    authToken = loginResponse.body.token
  })

  afterAll(async () => {
    await module.close()
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

**Always dispose containers**: Call `close()` or `dispose()` in `afterEach`/`afterAll` to prevent memory leaks.

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

**Use UnitTestingModule for isolated tests**: When testing a single service without the full application context, prefer `UnitTestingModule` for faster, more focused tests.

**Use TestingModule for integration tests**: When testing endpoints or multiple services together, use `TestingModule.create()` with the appropriate adapter.

For advanced testing topics related to dependency injection, see the [DI documentation](/docs/di/guides/testing).
