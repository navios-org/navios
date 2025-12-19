---
sidebar_position: 1
---

# Getting Started

Get up and running with Navios DI in minutes. This guide will walk you through installation, basic setup, and your first dependency injection example.

## Installation

Install Navios DI using your preferred package manager:

```bash
# npm
npm install @navios/di zod

# yarn
yarn add @navios/di zod

# pnpm
pnpm add @navios/di zod
```

:::info
`zod` is a peer dependency required for schema validation with injection tokens. If you're not using injection tokens with schemas, you can skip it, but it's recommended for type-safe configuration.
:::

## Prerequisites

- **Node.js**: 18 or higher
- **TypeScript**: 4.5 or higher
- **Modern TypeScript project**: ES2022+ target recommended

## TypeScript Configuration

Make sure your `tsconfig.json` has the correct settings for decorators:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node16",
    "experimentalDecorators": false
  }
}
```

:::important
Navios DI uses native ES decorators, not legacy decorators. Ensure `experimentalDecorators` is set to `false` (or omitted).
:::

## Your First Example

Let's create a simple example with a user service that depends on an email service:

```typescript
import { Container, inject, Injectable } from '@navios/di'

// 1. Create an email service
@Injectable()
class EmailService {
  async sendEmail(to: string, subject: string, body: string) {
    console.log(`Sending email to ${to}`)
    console.log(`Subject: ${subject}`)
    console.log(`Body: ${body}`)
    return { success: true, messageId: Math.random().toString(36) }
  }
}

// 2. Create a user service that depends on the email service
@Injectable()
class UserService {
  private readonly emailService = inject(EmailService)

  async createUser(name: string, email: string) {
    console.log(`Creating user: ${name}`)

    // Use the injected email service
    await this.emailService.sendEmail(
      email,
      'Welcome!',
      `Hello ${name}, welcome to our platform!`,
    )

    return { id: Math.random().toString(36), name, email }
  }
}

// 3. Use the services
async function main() {
  const container = new Container()

  // Get the user service (email service will be automatically injected)
  const userService = await container.get(UserService)

  // Create a user
  const user = await userService.createUser('Alice', 'alice@example.com')
  console.log('Created user:', user)
}

// Run the example
main().catch(console.error)
```

## Understanding the Example

### Service Registration

The `@Injectable()` decorator tells Navios DI that this class can be injected into other services:

```typescript
@Injectable()
class EmailService {
  // Service implementation
}
```

### Dependency Injection

The `inject()` function injects a dependency synchronously:

```typescript
@Injectable()
class UserService {
  private readonly emailService = inject(EmailService)
  //                                    ^^^^^^^^^^^^
  //                                    Dependency injection
}
```

### Container Usage

The `Container` class manages all your services:

```typescript
const container = new Container()
const userService = await container.get(UserService)
//                                    ^^^^^^^^^^^^
//                                    Get service instance
```

## Alternative Injection Methods

### Asynchronous Injection

Use `asyncInject()` for asynchronous dependency resolution, especially useful for breaking circular dependencies:

```typescript
import { asyncInject, Injectable } from '@navios/di'

@Injectable()
class UserService {
  private readonly emailService = asyncInject(EmailService)

  async createUser(name: string, email: string) {
    const emailService = await this.emailService
    //                   ^^^^^^^^^^^^^^^^^^^^^^^
    //                   Await the dependency
    await emailService.sendEmail(email, 'Welcome!', `Hello ${name}!`)
  }
}
```

### Optional Injection

Use `optional()` to inject a dependency only if it's available:

```typescript
import { optional, Injectable } from '@navios/di'

@Injectable()
class NotificationService {
  private readonly emailService = optional(EmailService)

  notify(message: string) {
    // Only calls email service if available
    this.emailService?.sendEmail('user@example.com', 'Notification', message)
  }
}
```

## Service Scopes

Services can have different lifetimes:

### Singleton (Default)

One instance shared across the entire application:

```typescript
@Injectable() // Same as @Injectable({ scope: InjectableScope.Singleton })
class SingletonService {
  private readonly id = Math.random()

  getId() {
    return this.id
  }
}

// Both instances will have the same ID
const service1 = await container.get(SingletonService)
const service2 = await container.get(SingletonService)
console.log(service1.getId() === service2.getId()) // true
```

### Transient

New instance created for each injection:

```typescript
import { InjectableScope } from '@navios/di'

@Injectable({ scope: InjectableScope.Transient })
class TransientService {
  private readonly id = Math.random()

  getId() {
    return this.id
  }
}

// Each instance will have a different ID
const service1 = await container.get(TransientService)
const service2 = await container.get(TransientService)
console.log(service1.getId() === service2.getId()) // false
```

### Request

One instance per request context (requires `ScopedContainer`):

```typescript
import { InjectableScope } from '@navios/di'

@Injectable({ scope: InjectableScope.Request })
class RequestService {
  private readonly requestId = Math.random().toString(36)
}

// Requires ScopedContainer
const scoped = container.beginRequest('req-123')
const service = await scoped.get(RequestService)
```

Learn more about [scopes](/docs/di/di/guides/scopes).

## Next Steps

Now that you have the basics down, explore these topics:

- **[Services](/docs/di/di/guides/services)** - Learn how to create and use services
- **[Container](/docs/di/di/guides/request-contexts)** - Deep dive into container management
- **[Factories](/docs/di/di/guides/factories)** - Create services using the factory pattern
- **[Injection Tokens](/docs/di/di/guides/injection-tokens)** - Flexible dependency resolution
- **[Service Lifecycle](/docs/di/di/guides/lifecycle)** - Initialization and cleanup hooks
- **[Request Contexts](/docs/di/di/guides/request-contexts)** - Isolated request-scoped services

## Common Patterns

### Configuration Service

```typescript
import { Injectable, InjectionToken } from '@navios/di'
import { z } from 'zod'

const configSchema = z.object({
  apiUrl: z.string(),
  timeout: z.number(),
})

const CONFIG_TOKEN = InjectionToken.create<
  ConfigService,
  typeof configSchema
>('APP_CONFIG', configSchema)

@Injectable({ token: CONFIG_TOKEN })
class ConfigService {
  constructor(private config: z.infer<typeof configSchema>) {}

  getApiUrl() {
    return this.config.apiUrl
  }

  getTimeout() {
    return this.config.timeout
  }
}

// Usage
const config = await container.get(CONFIG_TOKEN, {
  apiUrl: 'https://api.example.com',
  timeout: 5000,
})
```

### Service with Lifecycle

```typescript
import { Injectable, OnServiceDestroy, OnServiceInit } from '@navios/di'

@Injectable()
class DatabaseService implements OnServiceInit, OnServiceDestroy {
  private connection: any = null

  async onServiceInit() {
    console.log('Connecting to database...')
    this.connection = await this.connect()
    console.log('Database connected')
  }

  async onServiceDestroy() {
    console.log('Disconnecting from database...')
    if (this.connection) {
      await this.connection.close()
    }
  }

  private async connect() {
    // Database connection logic
    return { connected: true }
  }
}
```

## Troubleshooting

### Decorators Not Working

**Problem**: Decorators are not being recognized.

**Solution**:
- Ensure `experimentalDecorators: false` in `tsconfig.json`
- Make sure you're using TypeScript 5+
- Check that your build tool supports ES decorators

### Circular Dependencies

**Problem**: Services depend on each other, causing circular dependency errors.

**Solution**: Use `asyncInject()` on at least one side of the circular dependency:

```typescript
@Injectable()
class ServiceA {
  // Use asyncInject to break circular dependency
  private serviceB = asyncInject(ServiceB)

  async doSomething() {
    const b = await this.serviceB
    return b.getValue()
  }
}

@Injectable()
class ServiceB {
  private serviceA = inject(ServiceA)

  getValue() {
    return 'value from B'
  }
}
```

### Services Not Found

**Problem**: Getting errors that services are not registered.

**Solution**:
- Make sure services are decorated with `@Injectable()`
- Check that services are imported before use
- Verify the service is in the same registry as the container

### Type Errors

**Problem**: TypeScript type errors with injected services.

**Solution**:
- Ensure proper TypeScript configuration
- Use proper type annotations for injected services
- Check that all dependencies are properly typed

## Getting Help

- Check the [API Reference](/docs/di/di/api-reference) for complete method signatures
- Review the [Examples](/docs/di/di/recipes) for common patterns
- See the [FAQ](/docs/di/di/faq) for answers to common questions
- Visit the [GitHub repository](https://github.com/Arilas/navios) for issues and discussions

