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

## Injection Methods

### 1. Use inject for Simple Dependencies

```typescript
// ✅ Good: Use inject for singleton dependencies
@Injectable()
class UserService {
  private readonly logger = inject(LoggerService)

  getUser(id: string) {
    this.logger.log(`Getting user ${id}`)
    // ...
  }
}
```

### 2. Use asyncInject for Circular Dependencies

```typescript
// ✅ Good: Use asyncInject to break circular dependencies
@Injectable()
class ServiceA {
  private serviceB = asyncInject(ServiceB)

  async doSomething() {
    const b = await this.serviceB
    return b.process()
  }
}
```

### 3. Use optional for Feature Flags

```typescript
// ✅ Good: Use optional for conditionally available services
@Injectable()
class NotificationService {
  private readonly analytics = optional(AnalyticsService)

  notify(message: string) {
    this.analytics?.track('notification_sent')
    // Send notification
  }
}
```

## Service Organization

### 1. Group Related Services

```typescript
// ✅ Good: Group related services
export const DATABASE_TOKENS = {
  CONFIG: InjectionToken.create<DatabaseConfig>('DatabaseConfig'),
  CONNECTION: InjectionToken.create<DatabaseConnection>('DatabaseConnection'),
  REPOSITORY: InjectionToken.create<UserRepository>('UserRepository'),
} as const
```

### 2. Use Injection Tokens for Interfaces

```typescript
// ✅ Good: Use injection tokens for interfaces
interface PaymentProcessor {
  processPayment(amount: number): Promise<string>
}

const PAYMENT_PROCESSOR_TOKEN =
  InjectionToken.create<PaymentProcessor>('PaymentProcessor')

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

container.bindClass(HTTP_CLIENT_TOKEN, MockHttpClient)
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

### 2. Accessing Transient Services Too Early

```typescript
// ❌ Problem: Accessing transient service during construction
@Injectable()
class ConsumerService {
  private readonly service = inject(TransientService)

  constructor() {
    // Error: Service not initialized yet!
    console.log(this.service.getData())
  }
}

// ✅ Solution: Access in async methods after initialization
@Injectable()
class ConsumerService {
  private readonly service = inject(TransientService)

  async doSomething() {
    // Service is available in methods
    console.log(this.service.getData())
  }
}
```

## Next Steps

- Review the [guides](/docs/di/di/guides/services) for detailed usage
- Check out [recipes](/docs/di/di/recipes/configuration-services) for common patterns
- See the [FAQ](/docs/di/di/faq) for answers to common questions

