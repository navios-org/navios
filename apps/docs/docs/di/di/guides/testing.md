---
sidebar_position: 8
---

# Testing

Navios DI provides a `TestContainer` class specifically designed for testing. It extends the base `Container` with additional methods that make it easy to mock dependencies and set up test scenarios.

## TestContainer

The `TestContainer` is a specialized container for testing that provides:

- **Simplified binding methods**: Easy way to bind mocks and test values
- **Value binding**: Bind tokens to specific values (useful for mocks)
- **Class binding**: Bind tokens to class constructors
- **Clear method**: Reset the container between tests
- **Child containers**: Create isolated test containers

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

### Binding Values

Bind tokens to specific values for testing:

```typescript
import { InjectionToken } from '@navios/di'
import { TestContainer } from '@navios/di/testing'

const API_URL_TOKEN = InjectionToken.create<string>('api-url')

const container = new TestContainer()

// Bind a value
container.bindValue(API_URL_TOKEN, 'https://test-api.com')

// Or use the fluent API
container.bind(API_URL_TOKEN).toValue('https://test-api.com')

// Retrieve the value
const apiUrl = await container.get(API_URL_TOKEN)
console.log(apiUrl) // 'https://test-api.com'
```

### Binding Classes

Bind tokens to class constructors:

```typescript
import { Injectable, InjectionToken } from '@navios/di'
import { TestContainer } from '@navios/di/testing'

interface HttpClient {
  get(url: string): Promise<any>
}

const HTTP_CLIENT_TOKEN = InjectionToken.create<HttpClient>('http-client')

// Mock implementation
class MockHttpClient implements HttpClient {
  async get(url: string) {
    return { data: 'mocked response' }
  }
}

const container = new TestContainer()

// Bind the mock class
container.bindClass(HTTP_CLIENT_TOKEN, MockHttpClient)

// Or use the fluent API
container.bind(HTTP_CLIENT_TOKEN).toClass(MockHttpClient)

// Retrieve the instance
const httpClient = await container.get(HTTP_CLIENT_TOKEN)
const response = await httpClient.get('https://api.example.com')
console.log(response) // { data: 'mocked response' }
```

## Testing Services

### Testing a Service with Dependencies

```typescript
import { inject, Injectable } from '@navios/di'
import { InjectionToken } from '@navios/di'
import { TestContainer } from '@navios/di/testing'

const HTTP_CLIENT_TOKEN = InjectionToken.create<HttpClient>('http-client')

interface HttpClient {
  get(url: string): Promise<{ data: any }>
}

@Injectable()
class UserService {
  private readonly httpClient = inject(HTTP_CLIENT_TOKEN)

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
    container.bindClass(HTTP_CLIENT_TOKEN, MockHttpClient)
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
import { inject, Injectable } from '@navios/di'
import { InjectionToken } from '@navios/di'
import { TestContainer } from '@navios/di/testing'

const DB_TOKEN = InjectionToken.create<Database>('database')
const CACHE_TOKEN = InjectionToken.create<Cache>('cache')

interface Database {
  query(sql: string): Promise<any>
}

interface Cache {
  get(key: string): any
  set(key: string, value: any): void
}

@Injectable()
class UserService {
  private readonly db = inject(DB_TOKEN)
  private readonly cache = inject(CACHE_TOKEN)

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
    container.bindValue(DB_TOKEN, mockDb)
    container.bindValue(CACHE_TOKEN, mockCache)
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

## Clearing the Container

Use `clear()` to reset the container between tests:

```typescript
describe('UserService', () => {
  let container: TestContainer

  beforeEach(() => {
    container = new TestContainer()
  })

  afterEach(() => {
    // Clear all instances and bindings
    container.clear()
  })
})
```

## Child Containers

Create isolated child containers for parallel test execution:

```typescript
describe('UserService', () => {
  let parentContainer: TestContainer

  beforeEach(() => {
    parentContainer = new TestContainer()
  })

  it('should work in isolated container', async () => {
    const childContainer = parentContainer.createChild()
    
    // Set up child container
    childContainer.bindValue(API_URL_TOKEN, 'https://child-api.com')
    
    // Test in isolation
    const service = await childContainer.get(UserService)
    // ...
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

container.bindClass(HTTP_CLIENT_TOKEN, MockHttpClient)

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

### 5. Use Fluent API for Readability

```typescript
// ✅ Good: Fluent API
container
  .bind(API_URL_TOKEN)
  .toValue('https://test-api.com')

// ✅ Also good: Direct methods
container.bindValue(API_URL_TOKEN, 'https://test-api.com')
```

## API Reference

### TestContainer Methods

```typescript
class TestContainer extends Container {
  // Create a binding builder
  bind<T>(token: InjectionToken<T, any>): TestBindingBuilder<T>
  bind<T>(token: ClassType): TestBindingBuilder<T>

  // Bind a value directly
  bindValue<T>(token: InjectionToken<T, any>, value: T): TestContainer
  bindValue<T>(token: ClassType, value: T): TestContainer

  // Bind a class directly
  bindClass<T>(token: InjectionToken<T, any>, target: ClassType): TestContainer
  bindClass<T>(token: ClassType, target: ClassType): TestContainer

  // Create an isolated child container
  createChild(): TestContainer

  // Clear all instances and bindings
  clear(): Promise<void>
}
```

### TestBindingBuilder Methods

```typescript
class TestBindingBuilder<T> {
  // Bind to a specific value
  toValue(value: T): TestContainer

  // Bind to a class constructor
  toClass(target: ClassType): TestContainer
}
```

## Next Steps

- Learn about [services](/docs/di/di/guides/services) for service creation
- Explore [injection tokens](/docs/di/di/guides/injection-tokens) for flexible resolution
- Understand [best practices](/docs/di/di/best-practices) for service design

