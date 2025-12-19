---
sidebar_position: 1
---

# Getting Started

Get up and running with Navios DI in minutes. This guide will walk you through installation, basic setup, and your first dependency injection example.

## Installation

Install Navios DI using your preferred package manager:

```bash
npm install @navios/di zod
# or
yarn add @navios/di zod
# or
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

## Understanding Dependency Injection

Dependency Injection (DI) is a design pattern that helps manage dependencies between components. Instead of creating dependencies directly, services declare what they need, and the DI container provides them automatically.

**Key Benefits:**
- **Loose coupling**: Services don't need to know how to create their dependencies
- **Testability**: Easy to mock dependencies for testing
- **Flexibility**: Swap implementations without changing dependent code
- **Lifecycle management**: Container manages service creation and cleanup

**How it works:**
1. **Registration**: Services are registered with the `@Injectable()` decorator
2. **Injection**: Dependencies are requested using `inject()`, `asyncInject()`, or `optional()`
3. **Resolution**: The container automatically resolves and provides dependencies
4. **Lifecycle**: Services can have different scopes (singleton, transient, request) and lifecycle hooks

## Your First Example

Here's a simple example showing how services depend on each other:

```typescript
import { Container, inject, Injectable } from '@navios/di'

@Injectable()
class EmailService {
  async sendEmail(to: string, subject: string, body: string) {
    console.log(`Sending email to ${to}: ${subject}`)
    return { success: true, messageId: Math.random().toString(36) }
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

// Use the services
async function main() {
  const container = new Container()
  const userService = await container.get(UserService)
  const user = await userService.createUser('Alice', 'alice@example.com')
  console.log('Created user:', user)
}

main().catch(console.error)
```

The `@Injectable()` decorator registers the service, `inject()` requests a dependency, and `container.get()` retrieves the service with all dependencies automatically resolved.

## Injection Methods

Navios DI provides three ways to inject dependencies:

- **`inject()`**: Synchronous injection for immediate access (supports all scopes including transient)
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

## Service Scopes

Services can have different lifetimes:

- **Singleton** (default): One instance shared across the entire application
- **Transient**: New instance created for each injection
- **Request**: One instance per request context (requires `ScopedContainer`)

```typescript
import { Injectable, InjectableScope } from '@navios/di'

@Injectable() // Singleton (default)
class ConfigService {}

@Injectable({ scope: InjectableScope.Transient })
class LogEntry {}

@Injectable({ scope: InjectableScope.Request })
class RequestContext {}
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

## Troubleshooting

### Decorators Not Working

**Problem**: Decorators are not being recognized.

**Solution**:
- Ensure `experimentalDecorators: false` in `tsconfig.json`
- Make sure you're using TypeScript 5+
- Check that your build tool supports ES decorators

### Circular Dependencies

**Problem**: Services depend on each other, causing circular dependency errors.

**Solution**: Use `asyncInject()` on at least one side of the circular dependency. See the [circular dependencies guide](/docs/di/di/guides/circular-dependencies) for details.

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
- Review the [Recipes](/docs/di/di/recipes) for common patterns
- See the [FAQ](/docs/di/di/faq) for answers to common questions
- Visit the [GitHub repository](https://github.com/Arilas/navios) for issues and discussions
