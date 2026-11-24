---
sidebar_position: 2
---

# Your First Service

Learn how to create and use your first service with Navios DI.

## Understanding Dependency Injection

Dependency Injection (DI) is a design pattern that helps manage dependencies between components. Instead of creating dependencies directly, services declare what they need, and the DI container provides them automatically.

**Key Benefits:**
- **Loose coupling**: Services don't need to know how to create their dependencies
- **Testability**: Easy to mock dependencies for testing
- **Flexibility**: Swap implementations without changing dependent code
- **Lifecycle management**: Container manages service creation and cleanup

## Creating a Service

Services are classes decorated with `@Injectable()`. This decorator registers the service with the DI system and creates an Injection Token for it automatically.

```typescript
import { Injectable } from '@navios/di'

@Injectable()
class EmailService {
  async sendEmail(to: string, subject: string, body: string) {
    console.log(`Sending email to ${to}: ${subject}`)
    return { success: true, messageId: Math.random().toString(36) }
  }
}
```

When you use `@Injectable()`, the DI system automatically creates an Injection Token for this service. The token is used internally to identify and resolve the service.

## Injecting Dependencies

Services can depend on other services. Use `inject()` to request a dependency:

```typescript
import { Injectable, inject, Container } from '@navios/di'

@Injectable()
class EmailService {
  async sendEmail(to: string, subject: string, body: string) {
    console.log(`Sending email to ${to}: ${subject}`)
    return { success: true }
  }
}

@Injectable()
class UserService {
  private readonly emailService = inject(EmailService)

  async createUser(name: string, email: string) {
    console.log(`Creating user: ${name}`)
    await this.emailService.sendEmail(email, 'Welcome!', `Hello ${name}!`)
    return { id: Math.random().toString(36), name, email }
  }
}
```

The container automatically resolves `EmailService` when `UserService` is requested.

## Using the Container

Create a `Container` instance to resolve services:

```typescript
async function main() {
  const container = new Container()
  const userService = await container.get(UserService)
  const user = await userService.createUser('Alice', 'alice@example.com')
  console.log('Created user:', user)
}

main().catch(console.error)
```

The `container.get()` method resolves the service and all its dependencies automatically.

## Injection Methods

Navios DI provides three ways to inject dependencies:

- **`inject()`**: Synchronous injection for immediate access (supports all scopes)
- **`asyncInject()`**: Asynchronous injection, useful for breaking circular dependencies
- **`optional()`**: Optional injection that returns `null` if the service isn't available

```typescript
// Synchronous injection (most common)
private readonly emailService = inject(EmailService)

// Asynchronous injection (for circular dependencies)
private readonly serviceB = asyncInject(ServiceB)
// Later: const b = await this.serviceB

// Optional injection
private readonly analytics = optional(AnalyticsService)
// Later: this.analytics?.track(event)
```

## Important: Never Access Services in Constructors

**Critical**: Never access injected services in constructors. Services can be initialized multiple times during dependency resolution, and dependencies may not be fully ready. Use lifecycle methods like `onServiceInit()` for initialization logic instead.

```typescript
import { Injectable, OnServiceInit } from '@navios/di'

// ❌ Avoid: Accessing services in constructor
@Injectable()
class ProblematicService {
  private readonly logger = inject(LoggerService)

  constructor() {
    this.logger.log('Service created') // ❌ Service may not be ready
  }
}

// ✅ Good: Use lifecycle methods
@Injectable()
class CorrectService implements OnServiceInit {
  private readonly logger = inject(LoggerService)

  async onServiceInit() {
    // ✅ All dependencies are fully initialized here
    this.logger.log('Service initialized')
  }
}
```

## Next Steps

- **[Injection Tokens](/docs/di/di/getting-started/injection-tokens)** - Understand the foundation of the DI system