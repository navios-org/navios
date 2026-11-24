---
sidebar_position: 5
---

# Factories

Factories provide a way to create instances using factory classes rather than direct instantiation. Like services, factories have Injection Tokens that identify them in the DI system.

## What is a Factory?

A factory is a class decorated with `@Factory()` that implements a `create()` method. When you request a factory from the container, you get the result of the `create()` method, not the factory instance itself.

**Key characteristics:**
- **Returns created objects**: The factory's `create()` method is called, and its return value is what you get
- **Has an Injection Token**: Like services, factories have tokens (auto-created or provided)
- **Configuration-based**: Factories can accept configuration via injection tokens with schemas
- **Dependency injection**: Factories can inject other services using `inject()` or `ctx.container`

## Basic Factory

```typescript
import { Factory } from '@navios/di'

@Factory()
class DatabaseConnectionFactory {
  create() {
    return {
      host: 'localhost',
      port: 5432,
      connected: true,
      connect: () => console.log('Connected to database'),
    }
  }
}

// Usage - returns the result of create(), not the factory
const container = new Container()
const connection = await container.get(DatabaseConnectionFactory)
console.log(connection) // { host: 'localhost', port: 5432, connected: true, connect: [Function] }
```

When you use `@Factory()`, the DI system automatically creates an Injection Token for the factory, just like with `@Injectable()`.

## Factory vs Service

**Services** (`@Injectable`) return the service instance itself. **Factories** (`@Factory`) return the result of the `create()` method.

```typescript
// Injectable: Returns the service instance
@Injectable()
class EmailService {
  sendEmail(to: string, subject: string) {
    return `Email sent to ${to}: ${subject}`
  }
}
const emailService = await container.get(EmailService)
await emailService.sendEmail('user@example.com', 'Hello')

// Factory: Returns the result of create()
@Factory()
class EmailServiceFactory {
  create() {
    return {
      sendEmail: (to: string, subject: string) => {
        return `Email sent to ${to}: ${subject}`
      },
    }
  }
}
const emailService = await container.get(EmailServiceFactory)
await emailService.sendEmail('user@example.com', 'Hello')
```

## Factory with Dependencies

Factories can inject other services using the `inject()` function:

```typescript
import { Factory, inject, Injectable } from '@navios/di'

@Injectable()
class LoggerService {
  log(message: string) {
    console.log(`[LOG] ${message}`)
  }
}

@Factory()
class DatabaseConnectionFactory {
  private readonly logger = inject(LoggerService)

  create() {
    this.logger.log('Creating database connection...')
    return {
      host: 'localhost',
      port: 5432,
      connected: false,
      connect: async () => {
        this.logger.log('Connecting to database...')
        // Connection logic
      },
    }
  }
}
```

## Factory with Arguments (Schema-based)

Factories can accept configuration via Injection Tokens with schemas:

```typescript
import { Factory, InjectionToken } from '@navios/di'
import { z } from 'zod'

// Define configuration schema
const aiConfigSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'google']),
  apiKey: z.string(),
  model: z.string().optional(),
})

type AIConfig = z.infer<typeof aiConfigSchema>

// Create injection token
const AI_SERVICE_TOKEN = InjectionToken.create<
  AIService,
  typeof aiConfigSchema
>('AI_SERVICE', aiConfigSchema)

// Define service interface
interface AIService {
  generateText(prompt: string): Promise<string>
  getProvider(): string
}

// Create factory that selects provider
@Factory({ token: AI_SERVICE_TOKEN })
class AIServiceFactory {
  create(ctx: FactoryContext, config: AIConfig): AIService {
    switch (config.provider) {
      case 'openai':
        return new OpenAIService(config)
      case 'anthropic':
        return new AnthropicService(config)
      case 'google':
        return new GoogleAIService(config)
      default:
        throw new Error(`Unsupported AI provider: ${config.provider}`)
    }
  }
}

// Usage - select provider at runtime
const openAIService = await container.get(AI_SERVICE_TOKEN, {
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'gpt-4',
})
```

## Factory Context

Factories receive a `FactoryContext` that provides additional functionality:

```typescript
interface FactoryContext {
  // Inject dependencies asynchronously
  inject: typeof asyncInject

  // Access to the container from which the factory is being created
  container: Container | ScopedContainer

  // Register cleanup callback
  addDestroyListener: (listener: () => void | Promise<void>) => void
}
```

Use the context to access the container or register cleanup callbacks:

```typescript
@Factory()
class UserRepositoryFactory {
  create(ctx: FactoryContext) {
    // Access the service container
    const container = ctx.container

    // Register cleanup callback
    ctx.addDestroyListener(() => {
      console.log('Cleaning up repository...')
    })

    return {
      async getUser(id: string) {
        const dbService = await container.get(DatabaseService)
        return dbService.query(`SELECT * FROM users WHERE id = ${id}`)
      },
    }
  }
}
```

## When to Use Factories

Use factories when:
- **Selecting service implementations based on configuration** (most common use case)
- You need to create multiple instances with different configurations
- You want to return plain objects or functions instead of class instances
- You need complex object creation logic that depends on runtime configuration

Use services when:
- You need a class-based service with methods
- You want lifecycle hooks (`OnServiceInit`, `OnServiceDestroy`)
- You need dependency injection in the service itself
- You want singleton or request-scoped behavior
- The service implementation is fixed and doesn't vary based on configuration

## Next Steps

- **[Service Override](/docs/di/di/getting-started/service-override)** - Learn how to override services using priority