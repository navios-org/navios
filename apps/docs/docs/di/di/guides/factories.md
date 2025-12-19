---
sidebar_position: 2
---

# Factories

Factories provide a way to create instances using factory classes rather than direct instantiation. This is useful for complex object creation, configuration-based instantiation, and scenarios where you need to create multiple instances with different parameters.

## What is a Factory?

A factory is a class decorated with `@Factory()` that implements a `create()` method. When you request a factory from the container, you get the result of the `create()` method, not the factory instance itself.

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

// Usage
const container = new Container()
const connection = await container.get(DatabaseConnectionFactory)
console.log(connection) // { host: 'localhost', port: 5432, connected: true, connect: [Function] }
```

## Factory vs Injectable

### Injectable Service

```typescript
import { Injectable } from '@navios/di'

@Injectable()
class EmailService {
  sendEmail(to: string, subject: string) {
    return `Email sent to ${to}: ${subject}`
  }
}

// Usage - returns the service instance
const emailService = await container.get(EmailService)
await emailService.sendEmail('user@example.com', 'Hello')
```

### Factory Service

```typescript
import { Factory } from '@navios/di'

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

// Usage - returns the result of create() method
const emailService = await container.get(EmailServiceFactory)
await emailService.sendEmail('user@example.com', 'Hello')
```

## Configuration-Based Service Selection

One of the most common use cases for factories is selecting and returning different service implementations based on configuration. This pattern is ideal for scenarios like choosing between different AI providers, email service providers, payment processors, or storage backends.

### AI Provider Example

```typescript
import type { FactoryContext } from '@navios/di'

import { Factory, InjectionToken } from '@navios/di'

import { z } from 'zod'

// Define the configuration schema
const aiConfigSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'google']),
  apiKey: z.string(),
  model: z.string().optional(),
})

type AIConfig = z.infer<typeof aiConfigSchema>

// Define the service interface
interface AIService {
  generateText(prompt: string): Promise<string>
  getProvider(): string
}

// Create the injection token
const AI_SERVICE_TOKEN = InjectionToken.create<
  AIService,
  typeof aiConfigSchema
>('AI_SERVICE', aiConfigSchema)

// Factory that selects the provider based on configuration
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

// Provider implementations
class OpenAIService implements AIService {
  constructor(private config: AIConfig) {}

  async generateText(prompt: string): Promise<string> {
    // OpenAI API call
    return `OpenAI response to: ${prompt}`
  }

  getProvider(): string {
    return 'openai'
  }
}

class AnthropicService implements AIService {
  constructor(private config: AIConfig) {}

  async generateText(prompt: string): Promise<string> {
    // Anthropic API call
    return `Anthropic response to: ${prompt}`
  }

  getProvider(): string {
    return 'anthropic'
  }
}

class GoogleAIService implements AIService {
  constructor(private config: AIConfig) {}

  async generateText(prompt: string): Promise<string> {
    // Google AI API call
    return `Google AI response to: ${prompt}`
  }

  getProvider(): string {
    return 'google'
  }
}

// Usage - select provider at runtime
const openAIService = await container.get(AI_SERVICE_TOKEN, {
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'gpt-4',
})

const anthropicService = await container.get(AI_SERVICE_TOKEN, {
  provider: 'anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY!,
  model: 'claude-3',
})

await openAIService.generateText('Hello, world!')
await anthropicService.generateText('Hello, world!')
```

### Email Service Provider Example

```typescript
import type { FactoryContext } from '@navios/di'

import { Factory, InjectionToken } from '@navios/di'

import { z } from 'zod'

const emailConfigSchema = z.object({
  provider: z.enum(['smtp', 'sendgrid', 'ses', 'mailgun']),
  apiKey: z.string(),
  fromEmail: z.string().email(),
  region: z.string().optional(),
})

type EmailConfig = z.infer<typeof emailConfigSchema>

interface EmailService {
  sendEmail(
    to: string,
    subject: string,
    body: string,
  ): Promise<{ success: boolean; provider: string }>
}

const EMAIL_SERVICE_TOKEN = InjectionToken.create<
  EmailService,
  typeof emailConfigSchema
>('EMAIL_SERVICE', emailConfigSchema)

@Factory({ token: EMAIL_SERVICE_TOKEN })
class EmailServiceFactory {
  create(ctx: FactoryContext, config: EmailConfig): EmailService {
    switch (config.provider) {
      case 'smtp':
        return new SmtpEmailService(config)
      case 'sendgrid':
        return new SendGridEmailService(config)
      case 'ses':
        return new SesEmailService(config)
      case 'mailgun':
        return new MailgunEmailService(config)
      default:
        throw new Error(`Unsupported email provider: ${config.provider}`)
    }
  }
}

// Provider implementations
class SmtpEmailService implements EmailService {
  constructor(private config: EmailConfig) {}

  async sendEmail(to: string, subject: string, body: string) {
    // SMTP implementation
    return { success: true, provider: 'smtp' }
  }
}

class SendGridEmailService implements EmailService {
  constructor(private config: EmailConfig) {}

  async sendEmail(to: string, subject: string, body: string) {
    // SendGrid API implementation
    return { success: true, provider: 'sendgrid' }
  }
}

class SesEmailService implements EmailService {
  constructor(private config: EmailConfig) {}

  async sendEmail(to: string, subject: string, body: string) {
    // AWS SES implementation
    return { success: true, provider: 'ses' }
  }
}

class MailgunEmailService implements EmailService {
  constructor(private config: EmailConfig) {}

  async sendEmail(to: string, subject: string, body: string) {
    // Mailgun API implementation
    return { success: true, provider: 'mailgun' }
  }
}

// Usage - select provider based on environment or user preference
const emailService = await container.get(EMAIL_SERVICE_TOKEN, {
  provider: process.env.EMAIL_PROVIDER as
    | 'sendgrid'
    | 'ses'
    | 'smtp'
    | 'mailgun',
  apiKey: process.env.EMAIL_API_KEY!,
  fromEmail: 'noreply@example.com',
})

await emailService.sendEmail(
  'user@example.com',
  'Welcome',
  'Welcome to our service!',
)
```

## Factory with Dependencies

Factories can inject other services using the `inject` function:

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
        await new Promise((resolve) => setTimeout(resolve, 100))
        this.logger.log('Database connected successfully')
        return { connected: true }
      },
    }
  }
}
```

## Factory Context

Factories receive a `FactoryContext` that provides additional functionality:

```typescript
import { Factory, Injectable } from '@navios/di'

@Injectable()
class DatabaseService {
  async query(sql: string) {
    return `Query result: ${sql}`
  }
}

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

      async createUser(userData: any) {
        const db = await dbService
        return db.query(
          `INSERT INTO users VALUES (${JSON.stringify(userData)})`,
        )
      },
    }
  }
}
```

### Factory Context API

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

## Factory with Cleanup

Use `addDestroyListener` to register cleanup callbacks:

```typescript
import { Factory } from '@navios/di'

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

console.log(id1.id) // Different random ID
console.log(id2.id) // Different random ID
```

## Additional Examples

### Payment Processor Factory

Another common use case for configuration-based selection:

```typescript
import type { FactoryContext } from '@navios/di'

import { Factory, InjectionToken } from '@navios/di'

import { z } from 'zod'

const paymentConfigSchema = z.object({
  provider: z.enum(['stripe', 'paypal', 'square']),
  apiKey: z.string(),
  environment: z.enum(['sandbox', 'production']).default('sandbox'),
})

type PaymentConfig = z.infer<typeof paymentConfigSchema>

interface PaymentProcessor {
  processPayment(
    amount: number,
    currency: string,
  ): Promise<{ transactionId: string }>
  refund(transactionId: string): Promise<{ success: boolean }>
}

const PAYMENT_PROCESSOR_TOKEN = InjectionToken.create<
  PaymentProcessor,
  typeof paymentConfigSchema
>('PAYMENT_PROCESSOR', paymentConfigSchema)

@Factory({ token: PAYMENT_PROCESSOR_TOKEN })
class PaymentProcessorFactory {
  create(ctx: FactoryContext, config: PaymentConfig): PaymentProcessor {
    switch (config.provider) {
      case 'stripe':
        return new StripePaymentProcessor(config)
      case 'paypal':
        return new PayPalPaymentProcessor(config)
      case 'square':
        return new SquarePaymentProcessor(config)
      default:
        throw new Error(`Unsupported payment provider: ${config.provider}`)
    }
  }
}

// Provider implementations would go here...

// Usage
const paymentProcessor = await container.get(PAYMENT_PROCESSOR_TOKEN, {
  provider: 'stripe',
  apiKey: process.env.STRIPE_API_KEY!,
  environment: 'production',
})
```

## Best Practices

### 1. Use Factories for Configuration-Based Service Selection

The most common use case for factories is selecting service implementations based on configuration. This pattern is ideal for:

- **AI Providers**: OpenAI, Anthropic, Google AI
- **Email Services**: SendGrid, SES, Mailgun, SMTP
- **Payment Processors**: Stripe, PayPal, Square
- **Storage Backends**: S3, Azure Blob, Google Cloud Storage
- **Database Drivers**: PostgreSQL, MySQL, MongoDB

```typescript
// ✅ Good: Factory selects implementation based on configuration
const AI_SERVICE_TOKEN = InjectionToken.create<
  AIService,
  typeof aiConfigSchema
>('AI_SERVICE', aiConfigSchema)

@Factory({ token: AI_SERVICE_TOKEN })
class AIServiceFactory {
  create(ctx: FactoryContext, config: AIConfig): AIService {
    switch (config.provider) {
      case 'openai':
        return new OpenAIService(config)
      case 'anthropic':
        return new AnthropicService(config)
      default:
        throw new Error(`Unsupported provider: ${config.provider}`)
    }
  }
}
```

### 2. Define Clear Service Interfaces

Always define interfaces for the services your factory returns to ensure type safety and consistency:

```typescript
// ✅ Good: Clear interface definition
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
// ✅ Good: Transient factory for stateful objects
@Factory({ scope: InjectableScope.Transient })
class UserSessionFactory {
  create() {
    return {
      userId: null,
      sessionId: Math.random().toString(36),
      loginTime: new Date(),
      // ... stateful methods
    }
  }
}
```

### 4. Validate Configuration with Zod Schemas

Always use Zod schemas to validate factory configuration:

```typescript
// ✅ Good: Validated configuration
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
// ✅ Good: Clear error handling
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
  - Different AI providers, email services, payment processors, etc.
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
