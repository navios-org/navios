---
sidebar_position: 1
---

# Services

This guide covers advanced service patterns and scenarios. For basic service creation, see the [Getting Started guide](/docs/di/di/getting-started/first-service).

## Injection Token Relationship

Every service has an Injection Token that identifies it in the DI system. When you use `@Injectable()`:

- **Without a token**: The DI system automatically creates a token from the class
- **With a token**: You provide your own token via the `token` option

The token is what the Registry uses to store service metadata and what the Container uses to resolve services. This token-based system enables service overrides, interface-based injection, and dynamic resolution.

```typescript
// Auto-created token
@Injectable()
class UserService {
  // Token is automatically created from UserService class
}

// Explicit token
const USER_SERVICE_TOKEN = InjectionToken.create<UserService>('UserService')

@Injectable({ token: USER_SERVICE_TOKEN })
class UserService {
  // Service registered with explicit token
}
```

## Custom Registries

Services can be registered in custom registries for isolation and modular organization:

```typescript
import { Injectable, Registry, Container } from '@navios/di'

// Create separate registries for different modules
const userRegistry = new Registry()
const paymentRegistry = new Registry()

@Injectable({ registry: userRegistry })
class UserService {}

@Injectable({ registry: paymentRegistry })
class PaymentService {}

// Containers can use specific registries
const userContainer = new Container(userRegistry)
const paymentContainer = new Container(paymentRegistry)
```

This is useful for:
- **Module isolation**: Separate services by feature or module
- **Testing**: Use isolated registries for testing
- **Plugin systems**: Allow plugins to have their own registries

## Service Override with Priority

Multiple services can register for the same Injection Token. The service with the highest priority is resolved:

```typescript
import { Injectable, InjectionToken } from '@navios/di'

const USER_SERVICE_TOKEN = InjectionToken.create<UserService>('UserService')

// Default service (priority: 100)
@Injectable({ token: USER_SERVICE_TOKEN, priority: 100 })
class DefaultUserService {
  getUsers() {
    return ['Alice', 'Bob']
  }
}

// Override service (priority: 200 - wins)
@Injectable({ token: USER_SERVICE_TOKEN, priority: 200 })
class OverrideUserService {
  getUsers() {
    return ['Charlie', 'David']
  }
}

// When resolving, OverrideUserService will be returned
const container = new Container()
const service = await container.get(USER_SERVICE_TOKEN) // Returns OverrideUserService
```

### Retrieving All Registrations

You can retrieve all registrations for a token, sorted by priority:

```typescript
const registry = container.getRegistry()
const allRegistrations = registry.getAll(USER_SERVICE_TOKEN)
// Returns both services, sorted by priority (highest first)
// allRegistrations[0] = OverrideUserService (priority: 200)
// allRegistrations[1] = DefaultUserService (priority: 100)
```

This is useful for:
- **Debugging**: See which services are registered for a token
- **Custom resolution**: Implement custom resolution logic
- **Plugin systems**: Allow plugins to register multiple implementations

## Complex Dependency Scenarios

### Circular Dependencies

When services depend on each other, use `asyncInject()` to break the cycle:

```typescript
@Injectable()
class ServiceA {
  private serviceB = asyncInject(ServiceB)

  async doSomething() {
    const b = await this.serviceB
    return b.getValue()
  }
}

@Injectable()
class ServiceB {
  private serviceA = inject(ServiceA) // This side can use inject()
  
  getValue() {
    return 'value from B'
  }
}
```

See the [Circular Dependencies guide](/docs/di/di/guides/circular-dependencies) for more details.

### Optional Dependencies

Use `optional()` for dependencies that might not be available:

```typescript
@Injectable()
class NotificationService {
  private readonly emailService = optional(EmailService)
  private readonly smsService = optional(SmsService)

  async notify(message: string) {
    // Only calls if available
    this.emailService?.sendEmail('user@example.com', message)
    this.smsService?.sendSms('+1234567890', message)
  }
}
```

### Conditional Dependencies

Inject different services based on configuration:

```typescript
@Injectable()
class PaymentService {
  private readonly processor = inject(PAYMENT_PROCESSOR_TOKEN)

  async processPayment(amount: number) {
    // Processor is resolved based on priority/override
    return this.processor.processPayment(amount)
  }
}
```

## Service with Schema

Services can accept constructor arguments validated by Zod schemas:

```typescript
import { Injectable } from '@navios/di'
import { z } from 'zod'

const databaseConfigSchema = z.object({
  host: z.string(),
  port: z.number(),
  username: z.string(),
  password: z.string(),
})

@Injectable({ schema: databaseConfigSchema })
class DatabaseConfig {
  constructor(public readonly config: z.output<typeof databaseConfigSchema>) {}

  getConnectionString() {
    return `${this.config.host}:${this.config.port}`
  }
}

// Usage with validated arguments
const container = new Container()
const config = await container.get(DatabaseConfig, {
  host: 'localhost',
  port: 5432,
  username: 'admin',
  password: 'secret',
})
```

The schema validates arguments at resolution time, ensuring type safety.

## Advanced Lifecycle Patterns

### Conditional Initialization

```typescript
@Injectable()
class ConditionalService implements OnServiceInit {
  private initialized = false
  private resources: any[] = []

  async onServiceInit() {
    if (await this.shouldInitialize()) {
      await this.performInitialization()
      this.initialized = true
    }
  }

  private async shouldInitialize(): Promise<boolean> {
    return process.env.NODE_ENV !== 'test'
  }

  private async performInitialization() {
    this.resources.push(await this.createResource('Resource1'))
  }
}
```

### Resource Cleanup

```typescript
@Injectable()
class ResourceManager implements OnServiceInit, OnServiceDestroy {
  private resources: Array<{ name: string; cleanup: () => Promise<void> }> = []

  async onServiceInit() {
    await this.initializeDatabase()
    await this.initializeCache()
  }

  async onServiceDestroy() {
    // Clean up in reverse order
    for (let i = this.resources.length - 1; i >= 0; i--) {
      const resource = this.resources[i]
      try {
        await resource.cleanup()
      } catch (error) {
        console.error(`Error cleaning up ${resource.name}:`, error)
      }
    }
    this.resources = []
  }
}
```

## Best Practices

### 1. Use Injection Tokens for Interfaces

When working with interfaces or abstract types, use injection tokens to decouple implementations:

```typescript
interface PaymentProcessor {
  processPayment(amount: number): Promise<string>
}

const PAYMENT_PROCESSOR_TOKEN = InjectionToken.create<PaymentProcessor>('PaymentProcessor')

@Injectable({ token: PAYMENT_PROCESSOR_TOKEN })
class StripePaymentProcessor implements PaymentProcessor {
  async processPayment(amount: number) {
    return `Processed $${amount} via Stripe`
  }
}
```

### 2. Use Custom Registries for Modular Organization

Group related services into custom registries for better organization and isolation.

### 3. Implement Lifecycle Hooks for Resource Management

Services that manage resources should implement `OnServiceInit` and `OnServiceDestroy` to properly initialize and clean up resources.

### 4. Never Access Services in Constructors

Always use `onServiceInit()` for initialization logic that depends on other services. Constructors should only handle simple property initialization.

## Next Steps

- Learn about [factories](/docs/di/di/guides/factories) for complex object creation
- Explore [injection tokens](/docs/di/di/guides/injection-tokens) for advanced patterns
- Understand [scopes](/docs/di/di/guides/scopes) for service lifetime management
- Implement [lifecycle hooks](/docs/di/di/guides/lifecycle) for resource management