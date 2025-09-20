# Testing Infrastructure

The `@navios/di/testing` package provides a `TestContainer` class that extends the base `Container` with additional methods useful for testing.

## Features

- **TestContainer**: A specialized container for testing with simplified binding methods
- **bind().toValue()**: Bind tokens to specific values (useful for mocks)
- **bind().toClass()**: Bind tokens to class constructors
- **clear()**: Clear all instances and bindings from the container
- **Convenience methods**: `bindValue()`, `bindClass()`, `createChild()`

## Usage

```typescript
import { Injectable, InjectionToken } from '@navios/di'
import { TestContainer } from '@navios/di/testing'

// Create a test container
const container = new TestContainer()

// Create injection tokens
const API_URL_TOKEN = InjectionToken.create<string>('api-url')
const HTTP_CLIENT_TOKEN = InjectionToken.create<HttpClient>('http-client')

// Mock implementations
class MockHttpClient implements HttpClient {
  async get(url: string) {
    return { data: 'mocked response' }
  }
}

// Bind values for testing
container.bindValue(API_URL_TOKEN, 'https://test-api.com')
container.bindClass(HTTP_CLIENT_TOKEN, MockHttpClient)

// Or use the fluent API
container.bind(API_URL_TOKEN).toValue('https://test-api.com')

container.bind(HTTP_CLIENT_TOKEN).toClass(MockHttpClient)

// Bind a class to itself
@Injectable()
class UserService {
  constructor(
    @Inject(API_URL_TOKEN) private apiUrl: string,
    @Inject(HTTP_CLIENT_TOKEN) private httpClient: HttpClient,
  ) {}
}

container.bindSelf(UserService)

// Clear the container between tests
container.clear()

// Create isolated child containers
const childContainer = container.createChild()
```

## API Reference

### TestContainer

#### Methods

- `bind<T>(token: InjectionToken<T, any>): TestBindingBuilder<T>` - Creates a binding builder
- `bind<T>(token: ClassType): TestBindingBuilder<T>` - Creates a binding builder
- `bindValue<T>(token: InjectionToken<T, any>, value: T): TestContainer` - Binds a value to a token
- `bindValue<T>(token: ClassType, value: T): TestContainer` - Binds a value to a token
- `bindClass<T>(token: InjectionToken<T, any>, target: ClassType): TestContainer` - Binds a class to a token
- `bindClass<T>(token: ClassType, target: ClassType): TestContainer` - Binds a class to a token
- `createChild(): TestContainer` - Creates a new isolated test container
- `clear(): void` - Clears all instances and bindings

### TestBindingBuilder

#### Methods

- `toValue(value: T): TestContainer` - Binds the token to a specific value
- `toClass(target: ClassType): TestContainer` - Binds the token to a class constructor
