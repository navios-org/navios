---
sidebar_position: 8
---

# Testing

Navios DI provides a `TestContainer` class specifically designed for testing. It extends the base `Container` with additional methods that make it easy to mock dependencies and set up test scenarios.

## TestContainer

The `TestContainer` is a specialized container for testing that provides:

- **Fluent binding API**: `container.bind(token).toValue()` / `.toClass()` / `.toFactory()`, plus `mockInject()` for field-granular overrides
- **Assertion helpers**: Verify service resolution, scopes, and lifecycle states
- **Method call tracking**: Track and assert on method calls
- **Dependency graph inspection**: Analyze service dependencies
- **Clear method**: Reset the container between tests

## Installation

```typescript
import { TestContainer } from '@navios/di/testing'
```

## Basic Usage

### Creating a Test Container

```typescript
import { TestContainer } from '@navios/di/testing'

describe('UserService', () => {
  let container: TestContainer

  beforeEach(() => {
    container = new TestContainer()
  })

  afterEach(async () => {
    await container.dispose()
  })
})
```

> The `TestContainer` constructor takes an options bag: `{ parentRegistry?, logger?, plugins? }`. `parentRegistry` defaults to the `globalRegistry`; pass `null` for a fully isolated container.

### Binding Values

Bind tokens to specific values for testing:

```typescript
import { Token } from '@navios/di'
import { TestContainer } from '@navios/di/testing'

const API_URL_TOKEN = Token.create<string>('api-url')

const container = new TestContainer()

// Bind a value with the fluent API
container.bind(API_URL_TOKEN).toValue('https://test-api.com')

// Or bind a factory
container.bind(ConfigToken).toFactory(() => ({ apiKey: 'test' }))

// Retrieve the value
const apiUrl = await container.get(API_URL_TOKEN)
console.log(apiUrl) // 'https://test-api.com'
```

### Binding Classes

Bind tokens to class constructors:

```typescript
import { Token } from '@navios/di'
import { TestContainer } from '@navios/di/testing'

interface HttpClient {
  get(url: string): Promise<any>
}

const HTTP_CLIENT_TOKEN = Token.create<HttpClient>('http-client')

// Mock implementation
class MockHttpClient implements HttpClient {
  async get(url: string) {
    return { data: 'mocked response' }
  }
}

const container = new TestContainer()

// Bind the mock class with the fluent API
container.bind(HTTP_CLIENT_TOKEN).toClass(MockHttpClient)

// Retrieve the instance
const httpClient = await container.get(HTTP_CLIENT_TOKEN)
const response = await httpClient.get('https://api.example.com')
console.log(response) // { data: 'mocked response' }

// Assertion helpers
container.expectResolved(HTTP_CLIENT_TOKEN)
container.expectSingleton(HTTP_CLIENT_TOKEN)
container.expectInitialized(HTTP_CLIENT_TOKEN)
```

## Testing Services

### Testing a Service with Dependencies

```typescript
import { Inject, Injectable, Token } from '@navios/di'
import { TestContainer } from '@navios/di/testing'

const HTTP_CLIENT_TOKEN = Token.create<HttpClient>('http-client')

interface HttpClient {
  get(url: string): Promise<{ data: any }>
}

@Injectable()
class UserService {
  @Inject(HTTP_CLIENT_TOKEN)
  private accessor httpClient!: HttpClient

  async getUser(id: string) {
    const response = await this.httpClient.get(`/users/${id}`)
    return response.data
  }
}

// Mock HTTP client
class MockHttpClient implements HttpClient {
  async get(url: string) {
    return { data: { id: '1', name: 'Test User' } }
  }
}

describe('UserService', () => {
  let container: TestContainer

  beforeEach(() => {
    container = new TestContainer()
    // Bind the mock
    container.bind(HTTP_CLIENT_TOKEN).toClass(MockHttpClient)
  })

  afterEach(async () => {
    await container.dispose()
  })

  it('should get user', async () => {
    const userService = await container.get(UserService)
    const user = await userService.getUser('1')

    expect(user).toEqual({ id: '1', name: 'Test User' })
  })
})
```

### Testing with Multiple Mocks

```typescript
import { Inject, Injectable, Token } from '@navios/di'
import { TestContainer } from '@navios/di/testing'

const DB_TOKEN = Token.create<Database>('database')
const CACHE_TOKEN = Token.create<Cache>('cache')

interface Database {
  query(sql: string): Promise<any>
}

interface Cache {
  get(key: string): any
  set(key: string, value: any): void
}

@Injectable()
class UserService {
  @Inject(DB_TOKEN)
  private accessor db!: Database
  @Inject(CACHE_TOKEN)
  private accessor cache!: Cache

  async getUser(id: string) {
    // Check cache first
    const cached = this.cache.get(`user:${id}`)
    if (cached) return cached

    // Query database
    const user = await this.db.query(`SELECT * FROM users WHERE id = ${id}`)
    this.cache.set(`user:${id}`, user)
    return user
  }
}

describe('UserService', () => {
  let container: TestContainer
  let mockDb: Database
  let mockCache: Cache

  beforeEach(() => {
    container = new TestContainer()

    // Create mocks
    mockDb = {
      query: vi.fn().mockResolvedValue({ id: '1', name: 'Test User' }),
    }

    mockCache = {
      get: vi.fn(),
      set: vi.fn(),
    }

    // Bind mocks
    container.bind(DB_TOKEN).toValue(mockDb)
    container.bind(CACHE_TOKEN).toValue(mockCache)
  })

  afterEach(async () => {
    await container.dispose()
  })

  it('should get user from database when not cached', async () => {
    mockCache.get.mockReturnValue(null)

    const userService = await container.get(UserService)
    const user = await userService.getUser('1')

    expect(user).toEqual({ id: '1', name: 'Test User' })
    expect(mockDb.query).toHaveBeenCalledWith("SELECT * FROM users WHERE id = 1")
    expect(mockCache.set).toHaveBeenCalledWith('user:1', user)
  })

  it('should get user from cache when available', async () => {
    const cachedUser = { id: '1', name: 'Cached User' }
    mockCache.get.mockReturnValue(cachedUser)

    const userService = await container.get(UserService)
    const user = await userService.getUser('1')

    expect(user).toEqual(cachedUser)
    expect(mockDb.query).not.toHaveBeenCalled()
  })
})
```

## Assertion Helpers

TestContainer provides comprehensive assertion helpers:

```typescript
describe('UserService', () => {
  let container: TestContainer

  beforeEach(() => {
    container = new TestContainer()
  })

  it('should verify service resolution', async () => {
    const service = await container.get(UserService)
    
    // Verify service was resolved
    container.expectResolved(UserService)
    container.expectNotResolved(NonExistentService)
    
    // Verify scope
    container.expectSingleton(UserService)
    container.expectTransient(TransientService)
    
    // Verify lifecycle
    container.expectInitialized(UserService)
    container.expectNotDestroyed(UserService)
  })
})
```

## Method Call Tracking

Track and assert on method calls:

```typescript
it('should track method calls', async () => {
  const service = await container.get(UserService)
  await service.createUser({ name: 'John' })
  
  // Record method call
  container.recordMethodCall(UserService, 'createUser', [{ name: 'John' }], { id: '1' })
  
  // Assert on calls
  container.expectCalled(UserService, 'createUser')
  container.expectCalledWith(UserService, 'createUser', [{ name: 'John' }])
  container.expectCallCount(UserService, 'createUser', 1)
  
  // Get call history
  const calls = container.getMethodCalls(UserService)
  const stats = container.getServiceStats(UserService)
})
```

## Dependency Graph Inspection

Analyze service dependencies:

```typescript
it('should inspect dependency graph', async () => {
  await container.get(UserService)
  
  const graph = container.getDependencyGraph()             // DependencyGraph
  const simplified = container.getSimplifiedDependencyGraph() // Record<string, string[]>

  console.log(graph) // Full dependency graph
  console.log(simplified) // Simplified token -> deps map
})
```

### Field-Granular Overrides with `mockInject`

`mockInject(target, fieldName, value)` sets ONE `@Inject*` accessor field on `target` to `value` when it is later resolved — without going through token resolution for that field (no constructor side-effects, and the dependency need not even be registered). It is the field-granular sibling of `bind()` and works for `@Inject`, `@InjectLazy`, `@InjectOptional`, and `@InjectDerived` fields alike. It is fluent (returns `this`):

```typescript
container.mockInject(UserService, 'repo', { findUser: () => fakeUser })
const svc = await container.get(UserService)
// svc.repo is the stub; UserRepo's token was never resolved.
```

## UnitTestContainer

For isolated unit testing with automatic method-call tracking (Proxy). Only services in `providers` are constructed for real. The constructor takes a **required** options object:

```typescript
import { UnitTestContainer } from '@navios/di/testing'

describe('UserService Unit Tests', () => {
  let container: UnitTestContainer

  beforeEach(() => {
    container = new UnitTestContainer({
      providers: [
        { token: UserService, useClass: MockUserService },
        { token: ConfigToken, useValue: { apiUrl: 'test' } },
        { token: ApiClient, useFactory: () => new MockApiClient() },
      ],
      // v2 default is auto-mock (strict: false). Pass strict: true to
      // throw on unregistered dependencies instead.
      // strict: true,
    })
  })

  afterEach(async () => {
    await container.clear()
  })

  it('should track method calls automatically', async () => {
    const service = await container.get(UserService)
    await service.findUser('123')

    // Auto-tracked assertions (no manual recording needed)
    container.expectCalled(UserService, 'findUser')
    container.expectCalledWith(UserService, 'findUser', ['123'])
    container.expectNotCalled(UserService, 'deleteUser')
  })

  it('auto-mocks unregistered dependencies by default', async () => {
    // v2 default: unregistered deps are auto-mocked (no throw)
    const mock = await container.get(UnregisteredService)
    container.expectAutoMocked(UnregisteredService)
  })

  it('throws on unregistered deps with strict: true', async () => {
    const strict = new UnitTestContainer({
      providers: [{ token: UserService, useClass: MockUserService }],
      strict: true,
    })
    await expect(strict.get(UnregisteredService)).rejects.toThrow()
    await strict.clear()
  })
})
```

> **v2 behavior change:** auto-mocking unregistered dependencies is now the **default** (`strict: false`). Pass `{ strict: true }` to restore the v1 throw-on-unregistered behavior. `enableAutoMocking()` / `disableAutoMocking()` toggle this at runtime and return `this`. (`allowUnregistered` is the deprecated inverse alias; `strict` wins if both are set.)

## Clearing the Container

Use `clear()` to reset the container between tests:

```typescript
describe('UserService', () => {
  let container: TestContainer

  beforeEach(() => {
    container = new TestContainer()
  })

  afterEach(async () => {
    // Clear all instances and bindings
    await container.clear()
  })
})
```

## Best Practices

### 1. Use TestContainer for All Tests

```typescript
// ✅ Good: Use TestContainer
const container = new TestContainer()

// ❌ Avoid: Using regular Container in tests
const container = new Container()
```

### 2. Clear Between Tests

```typescript
// ✅ Good: Clear between tests
afterEach(() => {
  container.clear()
})

// ❌ Avoid: Reusing state between tests
```

### 3. Use Mocks for External Dependencies

```typescript
// ✅ Good: Mock external dependencies
class MockHttpClient implements HttpClient {
  async get(url: string) {
    return { data: 'mocked' }
  }
}

container.bind(HTTP_CLIENT_TOKEN).toClass(MockHttpClient)

// ❌ Avoid: Using real HTTP client in tests
```

### 4. Test Service Behavior, Not Implementation

```typescript
// ✅ Good: Test behavior
it('should get user', async () => {
  const userService = await container.get(UserService)
  const user = await userService.getUser('1')
  expect(user).toBeDefined()
})

// ❌ Avoid: Testing implementation details
it('should call httpClient.get', async () => {
  // Don't test internal method calls
})
```

### 5. Use the Fluent Binding API

```typescript
// ✅ Good: Fluent API
container.bind(API_URL_TOKEN).toValue('https://test-api.com')
container.bind(HTTP_CLIENT_TOKEN).toClass(MockHttpClient)
container.bind(ConfigToken).toFactory(() => ({ apiKey: 'test' }))

// ✅ Field-granular override (no token resolution for that field)
container.mockInject(UserService, 'repo', mockRepo)
```

## API Reference

### TestContainer Methods

```typescript
class TestContainer extends Container {
  constructor(options?: {
    parentRegistry?: Registry | null // default: globalRegistry; null = isolated
    logger?: Console | null
    plugins?: Plugin[]
  })

  // Binding API
  bind<T>(
    token: Token<T, any> | BoundToken<T, any> | (new (...args: any[]) => T),
  ): BindingBuilder<T>

  // Field-granular override (sets one @Inject* field, no token resolution)
  mockInject<T>(
    target: new (...args: any[]) => T,
    fieldName: string | symbol,
    value: unknown,
  ): this

  // Assertion helpers
  expectResolved(token: AnyToken): void
  expectNotResolved(token: AnyToken): void
  expectSingleton(token: AnyToken): void
  expectTransient(token: AnyToken): void
  expectRequestScoped(token: AnyToken): void
  expectInitialized(token: AnyToken): void
  expectDestroyed(token: AnyToken): void
  expectNotDestroyed(token: AnyToken): void

  // Method call tracking
  recordMethodCall(token: AnyToken, method: string, args: unknown[], result?: unknown, error?: Error): void
  expectCalled(token: AnyToken, method: string): void
  expectCalledWith(token: AnyToken, method: string, args: unknown[]): void
  expectCallCount(token: AnyToken, method: string, count: number): void
  getMethodCalls(token: AnyToken): MethodCallRecord[]
  getServiceStats(token: AnyToken): MockServiceStats
  clearMethodCalls(): void

  // Dependency graph
  getDependencyGraph(): DependencyGraph
  getSimplifiedDependencyGraph(): Record<string, string[]>

  // Lifecycle
  clear(): Promise<void>
}

interface BindingBuilder<T> {
  toValue(value: T): void
  toClass<C extends new (...args: any[]) => T>(cls: C): void
  toFactory(factory: () => T | Promise<T>): void
}
```

### UnitTestContainer Methods

```typescript
class UnitTestContainer extends Container {
  // options is REQUIRED; `providers` is required
  constructor(options: {
    providers: ProviderConfig[]
    strict?: boolean // default false (auto-mock unregistered deps)
    allowUnregistered?: boolean // @deprecated inverse alias of strict
    logger?: Console | null
    plugins?: Plugin[]
  })

  // Auto-tracking assertions
  expectCalled(token: AnyToken, method: string): void
  expectCalledWith(token: AnyToken, method: string, args: unknown[]): void
  expectNotCalled(token: AnyToken, method: string): void
  expectAutoMocked(token: AnyToken): void

  // Auto-mocking (fluent, return `this`)
  enableAutoMocking(): this
  disableAutoMocking(): this

  // Lifecycle
  clear(): Promise<void>
}

interface ProviderConfig<T = any> {
  token: Token<T, any> | BoundToken<T, any> | (new (...args: any[]) => T)
  useValue?: T
  useClass?: new (...args: any[]) => T
  useFactory?: () => T | Promise<T>
}
```

## Next Steps

- Learn about [services](/docs/di/di/guides/services) for service creation
- Explore [injection tokens](/docs/di/di/guides/injection-tokens) for flexible resolution
- Understand [best practices](/docs/di/di/best-practices) for service design

