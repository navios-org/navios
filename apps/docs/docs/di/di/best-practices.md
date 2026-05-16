---
sidebar_position: 5
---

# Best Practices

This guide covers best practices for using Navios DI effectively in your applications.

## Service Design

### 1. Use Singleton for Stateless Services

```typescript
// ✅ Good: Stateless service as singleton
@Injectable({ scope: InjectableScope.Singleton })
class EmailService {
  async sendEmail(to: string, subject: string) {
    // No state, safe to share
  }
}

// ❌ Avoid: Stateful service as singleton
@Injectable({ scope: InjectableScope.Singleton })
class UserSessionService {
  private currentUser: User | null = null // State!

  setCurrentUser(user: User) {
    this.currentUser = user // Shared state can cause issues
  }
}
```

### 2. Use Transient for Stateful Services

```typescript
// ✅ Good: Stateful service as transient
@Injectable({ scope: InjectableScope.Transient })
class UserSession {
  private readonly userId: string
  private readonly sessionId: string

  constructor(userId: string) {
    this.userId = userId
    this.sessionId = Math.random().toString(36)
  }
}
```

### 3. Use Request Scope for Request-Specific Data

```typescript
// ✅ Good: Request-specific data as request scope
@Injectable({ scope: InjectableScope.Request })
class RequestContext {
  private readonly requestId: string
  private readonly startTime: number

  constructor() {
    this.requestId = Math.random().toString(36)
    this.startTime = Date.now()
  }
}
```

## Field Injection

Injection in v2 is done exclusively with the field decorators on `accessor` fields. The `accessor` keyword and the `!` are required.

### 1. Use `@Inject` for Simple Dependencies

```typescript
// ✅ Good: Use @Inject for singleton dependencies
@Injectable()
class UserService {
  @Inject(LoggerService)
  private accessor logger!: LoggerService

  getUser(id: string) {
    this.logger.log(`Getting user ${id}`)
    // ...
  }
}
```

### 2. Use `@InjectLazy` for Circular Dependencies

```typescript
// ✅ Good: Use @InjectLazy to break circular dependencies
@Injectable()
class ServiceA {
  @InjectLazy(ServiceB)
  private accessor serviceB!: Promise<ServiceB>

  async doSomething() {
    const b = await this.serviceB
    return b.process()
  }
}
```

### 3. Use `@InjectOptional` for Feature Flags

```typescript
// ✅ Good: Use @InjectOptional for conditionally available services
@Injectable()
class NotificationService {
  @InjectOptional(AnalyticsService)
  private accessor analytics!: AnalyticsService | null

  notify(message: string) {
    this.analytics?.track('notification_sent')
    // Send notification
  }
}
```

### 4. Use `@InjectDerived` for Args Derived from the Host

```typescript
// ✅ Good: derive the dependency's args from THIS host's validated args
@Injectable({ token: QueuePublisherToken })
class QueuePublisher {
  @InjectDerived(
    QueueClientToken,
    (hostArgs: z.infer<typeof queuePublisherOptionsSchema>) => ({ name: hostArgs.name }),
  )
  private accessor queueClient!: QueueClient
}
```

## Service Organization

### 1. Group Related Services

```typescript
// ✅ Good: Group related services
export const DATABASE_TOKENS = {
  CONFIG: Token.create<DatabaseConfig>('DatabaseConfig'),
  CONNECTION: Token.create<DatabaseConnection>('DatabaseConnection'),
  REPOSITORY: Token.create<UserRepository>('UserRepository'),
} as const
```

### 2. Use Tokens for Interfaces

```typescript
// ✅ Good: Use tokens for interfaces
interface PaymentProcessor {
  processPayment(amount: number): Promise<string>
}

const PAYMENT_PROCESSOR_TOKEN = Token.create<PaymentProcessor>('PaymentProcessor')

@Injectable({ token: PAYMENT_PROCESSOR_TOKEN })
class StripePaymentProcessor implements PaymentProcessor {
  async processPayment(amount: number) {
    return `Processed $${amount} via Stripe`
  }
}
```

## Lifecycle Management

### 1. Implement Lifecycle Hooks for Resource Management

```typescript
// ✅ Good: Proper resource management
@Injectable()
class DatabaseService implements OnServiceInit, OnServiceDestroy {
  private connection: any = null

  async onServiceInit() {
    this.connection = await this.connect()
  }

  async onServiceDestroy() {
    if (this.connection) {
      await this.connection.close()
    }
  }
}
```

### 2. Handle Errors Gracefully

```typescript
// ✅ Good: Handle errors without throwing
async onServiceDestroy() {
  try {
    if (this.connection) {
      await this.connection.close()
    }
  } catch (error) {
    console.error('Error during cleanup:', error)
    // Don't throw - cleanup should be best effort
  }
}
```

## Error Handling

### 1. Use DIError for Error Handling

```typescript
// ✅ Good: Handle DI errors appropriately
try {
  const service = await container.get(MyService)
} catch (error) {
  if (error instanceof DIError) {
    switch (error.code) {
      case DIErrorCode.FactoryNotFound:
        console.error('Service not registered')
        break
      case DIErrorCode.CircularDependency:
        console.error('Circular dependency detected')
        break
    }
  }
}
```

## Performance Considerations

### 1. Use Singleton for Expensive Resources

```typescript
// ✅ Good: Expensive resource as singleton
@Injectable({ scope: InjectableScope.Singleton })
class DatabaseConnection {
  private connection: any = null

  async getConnection() {
    if (!this.connection) {
      // Expensive operation - only do once
      this.connection = await this.createConnection()
    }
    return this.connection
  }
}
```

### 2. Avoid Heavy Transient Services

```typescript
// ✅ Good: Lightweight transient service
@Injectable({ scope: InjectableScope.Transient })
class RequestIdGenerator {
  generate() {
    return Math.random().toString(36)
  }
}

// ❌ Avoid: Heavy transient service
@Injectable({ scope: InjectableScope.Transient })
class HeavyService {
  constructor() {
    // Heavy initialization for each instance
    this.initializeExpensiveResources()
  }
}
```

## Testing

### 1. Use TestContainer for All Tests

```typescript
// ✅ Good: Use TestContainer
const container = new TestContainer()

// ❌ Avoid: Using regular Container in tests
const container = new Container()
```

### 2. Mock External Dependencies

```typescript
// ✅ Good: Mock external dependencies
class MockHttpClient implements HttpClient {
  async get(url: string) {
    return { data: 'mocked' }
  }
}

container.bind(HTTP_CLIENT_TOKEN).toClass(MockHttpClient)
```

## Common Pitfalls to Avoid

### 1. State Leakage in Singletons

```typescript
// ❌ Problem: State leakage
@Injectable({ scope: InjectableScope.Singleton })
class CacheService {
  private cache = new Map()
  // Problem: Cache persists across requests
}

// ✅ Solution: Use transient for request-scoped cache
@Injectable({ scope: InjectableScope.Transient })
class RequestCache {
  private cache = new Map()
}
```

### 2. Accessing Injected Fields in the Constructor

```typescript
// ❌ Problem: @Inject* fields are NOT populated yet in the constructor.
// The container assigns them AFTER the constructor runs.
@Injectable()
class ConsumerService {
  @Inject(SomeService)
  private accessor service!: SomeService

  constructor() {
    // Error: field not assigned yet during construction!
    console.log(this.service.getData())
  }
}

// ✅ Solution: read injected fields in onServiceInit or in methods
@Injectable()
class ConsumerService implements OnServiceInit {
  @Inject(SomeService)
  private accessor service!: SomeService

  async onServiceInit() {
    // Eager @Inject fields are assigned before onServiceInit runs
    console.log(this.service.getData())
  }

  async doSomething() {
    console.log(this.service.getData())
  }
}
```

> Note: an eager `@Inject` of a `Transient`- or `Request`-scoped dependency from a `Singleton` host throws a scope-mismatch `DIError`. Use `@InjectLazy` (a `Promise<T>` field) for narrower-scoped dependencies.

## Next Steps

- Review the [guides](/docs/di/di/guides/services) for detailed usage
- Check out [recipes](/docs/di/di/recipes/configuration-services) for common patterns
- See the [FAQ](/docs/di/di/faq) for answers to common questions

