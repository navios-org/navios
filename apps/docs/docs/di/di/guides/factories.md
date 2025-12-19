---
sidebar_position: 2
---

# Factories

Factories provide a way to create instances using factory classes rather than direct instantiation. This is useful for complex object creation, configuration-based instantiation, and scenarios where you need to create multiple instances with different parameters.

## What is a Factory?

A factory is a class decorated with `@Factory()` that implements a `create()` method. When you request a factory from the container, you get the result of the `create()` method, not the factory instance itself.

**Key characteristics:**
- **Returns created objects**: The factory's `create()` method is called, and its return value is what you get
- **Configuration-based**: Factories can accept configuration via injection tokens with schemas
- **Dependency injection**: Factories can inject other services using `inject()` or `ctx.container`
- **Lifecycle management**: Factories can register cleanup callbacks via `ctx.addDestroyListener`

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

## Factory vs Injectable

**Injectable services** return the service instance itself. **Factories** return the result of the `create()` method.

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

## Configuration-Based Service Selection

The most common use case for factories is selecting and returning different service implementations based on configuration. This pattern is ideal for scenarios like choosing between different AI providers, email service providers, payment processors, or storage backends.

**How it works:**
1. Define a configuration schema with Zod
2. Create an injection token with the schema
3. Define an interface for the service
4. Create a factory that selects the implementation based on configuration
5. Register provider implementations

```typescript
import type { FactoryContext } from '@navios/di'
import { Factory, InjectionToken } from '@navios/di'
import { z } from 'zod'

// 1. Define configuration schema
const aiConfigSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'google']),
  apiKey: z.string(),
  model: z.string().optional(),
})

type AIConfig = z.infer<typeof aiConfigSchema>

// 2. Define service interface
interface AIService {
  generateText(prompt: string): Promise<string>
  getProvider(): string
}

// 3. Create injection token
const AI_SERVICE_TOKEN = InjectionToken.create<
  AIService,
  typeof aiConfigSchema
>('AI_SERVICE', aiConfigSchema)

// 4. Create factory that selects provider
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

// 5. Provider implementations
class OpenAIService implements AIService {
  constructor(private config: AIConfig) {}
  async generateText(prompt: string): Promise<string> {
    return `OpenAI response to: ${prompt}`
  }
  getProvider(): string {
    return 'openai'
  }
}

// Usage - select provider at runtime
const openAIService = await container.get(AI_SERVICE_TOKEN, {
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'gpt-4',
})
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

    // Inject dependencies within the factory
    const dbService = await container.get(DatabaseService)

    return {
      async getUser(id: string) {
        const db = await dbService
        return db.query(`SELECT * FROM users WHERE id = ${id}`)
      },
    }
  }
}
```

## Factory with Cleanup

Use `addDestroyListener` to register cleanup callbacks for resources:

```typescript
@Factory()
class DatabaseConnectionFactory {
  create(ctx: FactoryContext) {
    const connection = {
      host: 'localhost',
      port: 5432,
      connected: true,
    }

    // Register cleanup callback
    ctx.addDestroyListener(() => {
      connection.connected = false
      console.log('Connection closed')
    })

    return connection
  }
}
```

## Factory with Transient Scope

Factories can be transient, creating a new instance each time:

```typescript
import { Factory, InjectableScope } from '@navios/di'

@Factory({ scope: InjectableScope.Transient })
class RandomIdFactory {
  create() {
    return {
      id: Math.random().toString(36).substr(2, 9),
      createdAt: new Date(),
    }
  }
}

// Each call creates a new instance
const id1 = await container.get(RandomIdFactory)
const id2 = await container.get(RandomIdFactory)
console.log(id1.id !== id2.id) // true
```

## Best Practices

### 1. Use Factories for Configuration-Based Service Selection

The most common use case for factories is selecting service implementations based on configuration. This pattern is ideal for:

- **AI Providers**: OpenAI, Anthropic, Google AI
- **Email Services**: SendGrid, SES, Mailgun, SMTP
- **Payment Processors**: Stripe, PayPal, Square
- **Storage Backends**: S3, Azure Blob, Google Cloud Storage
- **Database Drivers**: PostgreSQL, MySQL, MongoDB

### 2. Define Clear Service Interfaces

Always define interfaces for the services your factory returns to ensure type safety and consistency:

```typescript
interface EmailService {
  sendEmail(
    to: string,
    subject: string,
    body: string,
  ): Promise<{ success: boolean }>
}

const EMAIL_SERVICE_TOKEN = InjectionToken.create<
  EmailService,
  typeof emailConfigSchema
>('EMAIL_SERVICE', emailConfigSchema)
```

### 3. Use Transient Scope for Stateful Objects

Use transient scope when each factory call should create a new instance:

```typescript
@Factory({ scope: InjectableScope.Transient })
class UserSessionFactory {
  create() {
    return {
      userId: null,
      sessionId: Math.random().toString(36),
      loginTime: new Date(),
    }
  }
}
```

### 4. Validate Configuration with Zod Schemas

Always use Zod schemas to validate factory configuration:

```typescript
const configSchema = z.object({
  provider: z.enum(['openai', 'anthropic']),
  apiKey: z.string().min(1),
  model: z.string().optional(),
})

const TOKEN = InjectionToken.create<Service, typeof configSchema>(
  'SERVICE',
  configSchema,
)
```

### 5. Handle Errors Gracefully

Provide clear error messages when configuration is invalid:

```typescript
@Factory({ token: SERVICE_TOKEN })
class ServiceFactory {
  create(ctx: FactoryContext, config: Config): Service {
    switch (config.provider) {
      case 'provider1':
        return new Provider1Service(config)
      case 'provider2':
        return new Provider2Service(config)
      default:
        throw new Error(
          `Unsupported provider: ${config.provider}. Supported: provider1, provider2`,
        )
    }
  }
}
```

## When to Use Factories vs Services

### Use Factories When:

- **Selecting service implementations based on configuration** (most common use case)
- You need to create multiple instances with different configurations
- You want to return plain objects or functions instead of class instances
- You need complex object creation logic that depends on runtime configuration

### Use Services When:

- You need a class-based service with methods
- You want lifecycle hooks (`OnServiceInit`, `OnServiceDestroy`)
- You need dependency injection in the service itself
- You want singleton or request-scoped behavior
- The service implementation is fixed and doesn't vary based on configuration

## Next Steps

- Learn about [injection tokens](/docs/di/di/guides/injection-tokens) for flexible resolution
- Explore [services](/docs/di/di/guides/services) for class-based services
- Understand [scopes](/docs/di/di/guides/scopes) for factory lifetime management
