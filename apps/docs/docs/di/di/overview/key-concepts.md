---
sidebar_position: 2
---

# Key Concepts

Understanding these core concepts will help you effectively use Navios DI in your applications.

## Dependency Injection Pattern

Dependency Injection (DI) is a design pattern where dependencies are provided to a class rather than created by it. This promotes:

- **Loose Coupling**: Classes don't depend on concrete implementations
- **Testability**: Dependencies can be easily mocked
- **Flexibility**: Dependencies can be swapped without changing code
- **Maintainability**: Changes to dependencies don't require changes to dependents

### Without DI

```typescript
class UserService {
  private emailService: EmailService

  constructor() {
    // Tightly coupled - hard to test or swap
    this.emailService = new EmailService()
  }
}
```

### With DI

```typescript
@Injectable()
class UserService {
  private readonly emailService = inject(EmailService)
  // Dependencies are injected, not created
}
```

## Service Registration

Services must be registered with the DI container before they can be used. Registration happens automatically when you use decorators:

### @Injectable Decorator

The `@Injectable()` decorator registers a class as a service:

```typescript
@Injectable()
class EmailService {
  sendEmail(to: string, message: string) {
    // Implementation
  }
}
```

### @Factory Decorator

The `@Factory()` decorator registers a factory class:

```typescript
@Factory()
class ConnectionFactory {
  create() {
    return new DatabaseConnection()
  }
}
```

## Service Resolution

Service resolution is the process of getting an instance of a service from the container:

### Direct Resolution

```typescript
const container = new Container()
const service = await container.get(EmailService)
```

### Automatic Resolution

When a service depends on another service, the dependency is automatically resolved:

```typescript
@Injectable()
class UserService {
  private readonly emailService = inject(EmailService)
  // EmailService is automatically resolved when UserService is created
}
```

## Service Scopes

Service scopes determine the lifetime and sharing behavior of service instances:

### Singleton

One instance shared across the entire application:

```typescript
@Injectable({ scope: InjectableScope.Singleton })
class ConfigService {
  // Same instance everywhere
}
```

**Use when:**
- Service is stateless
- Service is expensive to create
- Service manages shared resources

### Transient

New instance created for each injection:

```typescript
@Injectable({ scope: InjectableScope.Transient })
class RequestHandler {
  // New instance each time
}
```

**Use when:**
- Service holds request-specific state
- Service is lightweight
- You need isolated instances

### Request

One instance per request context:

```typescript
@Injectable({ scope: InjectableScope.Request })
class RequestContext {
  // One instance per request
}
```

**Use when:**
- Service holds request-specific data
- You need isolation between concurrent requests
- Service should be cleaned up after request

Learn more about [scopes](/docs/di/di/guides/scopes).

## Injection Methods

Navios DI provides three ways to inject dependencies:

### inject()

Synchronous injection for immediate access:

```typescript
@Injectable()
class UserService {
  private readonly emailService = inject(EmailService)
  
  sendWelcomeEmail(user: User) {
    // Direct access - no await needed
    this.emailService.sendEmail(user.email, 'Welcome!')
  }
}
```

**Use when:**
- Dependency is a singleton
- You need immediate access
- Dependency is already initialized

### asyncInject()

Asynchronous injection for explicit async control:

```typescript
@Injectable()
class UserService {
  private readonly emailService = asyncInject(EmailService)
  
  async sendWelcomeEmail(user: User) {
    const service = await this.emailService
    await service.sendEmail(user.email, 'Welcome!')
  }
}
```

**Use when:**
- Breaking circular dependencies
- Dependency might not be ready
- You need explicit async control

### optional()

Optional injection that returns `null` if unavailable:

```typescript
@Injectable()
class NotificationService {
  private readonly emailService = optional(EmailService)
  
  notify(message: string) {
    // Only calls if available
    this.emailService?.sendEmail('user@example.com', message)
  }
}
```

**Use when:**
- Dependency might not be registered
- Feature flags
- Optional plugins

## Injection Tokens

Injection tokens provide flexible dependency resolution:

### Basic Token

```typescript
const EMAIL_SERVICE_TOKEN = InjectionToken.create<EmailService>('EmailService')

@Injectable({ token: EMAIL_SERVICE_TOKEN })
class EmailService {}
```

### Token with Schema

```typescript
const configSchema = z.object({
  apiUrl: z.string(),
  timeout: z.number(),
})

const CONFIG_TOKEN = InjectionToken.create<Config, typeof configSchema>(
  'APP_CONFIG',
  configSchema
)
```

### Bound Token

Pre-configured token with values:

```typescript
const PROD_CONFIG = InjectionToken.bound(CONFIG_TOKEN, {
  apiUrl: 'https://api.prod.com',
  timeout: 10000,
})
```

### Factory Token

Dynamically resolved token:

```typescript
const DYNAMIC_CONFIG = InjectionToken.factory(CONFIG_TOKEN, async () => {
  return {
    apiUrl: process.env.API_URL,
    timeout: 5000,
  }
})
```

Learn more about [injection tokens](/docs/di/di/guides/injection-tokens).

## Lifecycle Management

Services can implement lifecycle hooks for initialization and cleanup:

### OnServiceInit

Called after service creation and dependency injection:

```typescript
@Injectable()
class DatabaseService implements OnServiceInit {
  private connection: any = null

  async onServiceInit() {
    this.connection = await this.connect()
  }
}
```

### OnServiceDestroy

Called when service is being destroyed:

```typescript
@Injectable()
class DatabaseService implements OnServiceDestroy {
  async onServiceDestroy() {
    if (this.connection) {
      await this.connection.close()
    }
  }
}
```

Learn more about [lifecycle](/docs/di/di/guides/lifecycle).

## Request Contexts

Request contexts provide isolated service resolution for web applications:

### Creating Request Contexts

```typescript
const scoped = container.beginRequest('req-123', {
  userId: 'user-456',
  traceId: 'trace-789',
})
```

### Using Request-Scoped Services

```typescript
@Injectable({ scope: InjectableScope.Request })
class RequestLogger {
  log(message: string) {
    console.log(`[${this.requestId}] ${message}`)
  }
}

const scoped = container.beginRequest('req-123')
const logger = await scoped.get(RequestLogger)
```

### Cleanup

```typescript
await scoped.endRequest() // Cleans up all request-scoped services
```

Learn more about [request contexts](/docs/di/di/guides/request-contexts).

## Circular Dependencies

Circular dependencies occur when services depend on each other:

```typescript
@Injectable()
class ServiceA {
  private serviceB = inject(ServiceB)
}

@Injectable()
class ServiceB {
  private serviceA = inject(ServiceA) // Circular!
}
```

### Resolution

Use `asyncInject()` on at least one side:

```typescript
@Injectable()
class ServiceA {
  private serviceB = asyncInject(ServiceB) // Break cycle
}
```

Learn more about [circular dependencies](/docs/di/di/guides/circular-dependencies).

## Service Invalidation

Services can be invalidated to force recreation:

```typescript
const service = await container.get(MyService)
await container.invalidate(service)
// Next access creates a new instance
```

Invalidation also propagates to dependent services automatically.

## Container Hierarchy

Navios DI supports container hierarchies:

### Root Container

```typescript
const rootContainer = new Container()
```

### Scoped Containers

```typescript
const scoped = rootContainer.beginRequest('req-123')
// Scoped container delegates to root for singletons
```

### Custom Registries

```typescript
const registry = new Registry()
const container = new Container(registry)
```

## Type Safety

Navios DI provides full TypeScript type safety:

### Type Inference

```typescript
// Type is automatically inferred
const service = await container.get(EmailService)
// service: EmailService
```

### Generic Types

```typescript
const token = InjectionToken.create<MyType>('MyToken')
const instance = await container.get(token)
// instance: MyType
```

### Schema Validation

```typescript
const schema = z.object({ apiUrl: z.string() })
const token = InjectionToken.create<Config, typeof schema>('Config', schema)

// Type-safe arguments
const config = await container.get(token, {
  apiUrl: 'https://api.example.com', // Validated by Zod
})
```

## Next Steps

Now that you understand the key concepts:

- Learn about [services](/docs/di/di/guides/services)
- Explore [factories](/docs/di/di/guides/factories)
- Understand [injection tokens](/docs/di/di/guides/injection-tokens)
- Master [scopes](/docs/di/di/guides/scopes)
- Implement [lifecycle hooks](/docs/di/di/guides/lifecycle)

