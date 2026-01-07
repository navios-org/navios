---
sidebar_position: 2
---

# Factories

This guide covers advanced factory patterns and scenarios. For basic factory creation, see the [Getting Started guide](/docs/di/di/getting-started/factories).

## Injection Token Relationship

Like services, factories have Injection Tokens that identify them in the DI system. When you use `@Factory()`:

- **Without a token**: The DI system automatically creates a token from the factory class
- **With a token**: You provide your own token via the `token` option

The token is what the Registry uses to store factory metadata and what the Container uses to resolve factories. This token-based system enables factory overrides, interface-based injection, and dynamic resolution.

## Configuration-Based Service Selection

The most common use case for factories is selecting and returning different service implementations based on configuration. This pattern is ideal for scenarios like choosing between different AI providers, email service providers, payment processors, or storage backends.

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

This pattern is ideal for:
- **AI Providers**: OpenAI, Anthropic, Google AI
- **Email Services**: SendGrid, SES, Mailgun, SMTP
- **Payment Processors**: Stripe, PayPal, Square
- **Storage Backends**: S3, Azure Blob, Google Cloud Storage
- **Database Drivers**: PostgreSQL, MySQL, MongoDB

## Advanced Factory Context Usage

The `FactoryContext` provides additional capabilities beyond basic dependency injection:

### Accessing the Container

```typescript
@Factory()
class UserRepositoryFactory {
  create(ctx: FactoryContext) {
    // Access the service container
    const container = ctx.container

    // Resolve dependencies dynamically
    return {
      async getUser(id: string) {
        const dbService = await container.get(DatabaseService)
        return dbService.query(`SELECT * FROM users WHERE id = ${id}`)
      },
    }
  }
}
```

### Registering Cleanup Callbacks

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

### Async Dependency Resolution

```typescript
@Factory()
class ComplexServiceFactory {
  create(ctx: FactoryContext) {
    return {
      async initialize() {
        // Resolve dependencies asynchronously
        const service1 = await ctx.inject(Service1)
        const service2 = await ctx.inject(Service2)
        
        // Use resolved services
        await service1.setup()
        await service2.configure()
      },
    }
  }
}
```

## Factory with Multiple Dependencies

Factories can inject multiple services:

```typescript
import { Factory, inject, Injectable } from '@navios/di'

@Injectable()
class LoggerService {
  log(message: string) {
    console.log(`[LOG] ${message}`)
  }
}

@Injectable()
class ConfigService {
  getConfig() {
    return { debug: true }
  }
}

@Factory()
class DatabaseConnectionFactory {
  private readonly logger = inject(LoggerService)
  private readonly config = inject(ConfigService)

  create() {
    const config = this.config.getConfig()
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

## Factory Override with Priority

Like services, factories can use priority for overrides:

```typescript
import { Factory, InjectionToken } from '@navios/di'

const SERVICE_TOKEN = InjectionToken.create<Service>('Service')

// Default factory
@Factory({ token: SERVICE_TOKEN, priority: 100 })
class DefaultFactory {
  create() {
    return new DefaultService()
  }
}

// Override factory (higher priority)
@Factory({ token: SERVICE_TOKEN, priority: 200 })
class OverrideFactory {
  create() {
    return new OverrideService()
  }
}
```

## Complex Factory Scenarios

### Factory with Conditional Logic

```typescript
import type { FactoryContext } from '@navios/di'

@Factory({ token: SERVICE_TOKEN })
class ConditionalFactory {
  create(ctx: FactoryContext, config: Config): Service {
    if (config.environment === 'production') {
      return new ProductionService(config)
    } else if (config.environment === 'staging') {
      return new StagingService(config)
    } else {
      return new DevelopmentService(config)
    }
  }
}
```

### Factory with Resource Management

```typescript
@Factory()
class ResourceFactory {
  create(ctx: FactoryContext) {
    const resources: Array<{ cleanup: () => Promise<void> }> = []

    // Create resources
    const resource1 = this.createResource1()
    resources.push(resource1)

    const resource2 = this.createResource2()
    resources.push(resource2)

    // Register cleanup
    ctx.addDestroyListener(async () => {
      for (const resource of resources.reverse()) {
        await resource.cleanup()
      }
    })

    return {
      resource1,
      resource2,
    }
  }
}
```

## Best Practices

### 1. Define Clear Service Interfaces

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

### 2. Use Factories for Configuration-Based Selection

The most common use case for factories is selecting service implementations based on configuration. This pattern is ideal for provider selection, environment-specific implementations, and feature flags.

### 3. Validate Configuration with Zod Schemas

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

### 4. Handle Errors Gracefully

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

### 5. Use Factory Context for Advanced Scenarios

Leverage `FactoryContext` for:
- Dynamic dependency resolution
- Resource cleanup
- Container access
- Async operations

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