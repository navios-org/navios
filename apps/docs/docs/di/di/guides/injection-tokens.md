---
sidebar_position: 3
---

# Injection Tokens

Injection tokens provide a flexible way to identify and resolve dependencies in Navios DI. They allow you to decouple service implementations from their consumers, making your code more modular and testable.

## What are Injection Tokens?

Injection tokens are unique identifiers for services that enable:

- **Interface-based injection**: Inject services by interface rather than concrete class
- **Multiple implementations**: Register different implementations for the same token
- **Configuration-based services**: Define services that require configuration data
- **Dynamic resolution**: Resolve services based on runtime configuration

**Key benefits:**
- **Decoupling**: Consumers don't depend on concrete implementations
- **Flexibility**: Swap implementations without changing dependent code
- **Testability**: Easy to mock services for testing
- **Type safety**: Full TypeScript support with schema validation

## Basic Usage

### Creating Injection Tokens

Injection tokens can be simple (without schema) or schema-based (with Zod validation):

```typescript
import { InjectionToken } from '@navios/di'
import { z } from 'zod'

// Simple token without schema
const USER_SERVICE_TOKEN = InjectionToken.create<UserService>('UserService')

// Token with schema for configuration
const configSchema = z.object({
  apiUrl: z.string(),
  timeout: z.number(),
})

const CONFIG_TOKEN = InjectionToken.create<Config, typeof configSchema>(
  'APP_CONFIG',
  configSchema,
)
```

### Using Injection Tokens

Register services with tokens and inject them:

```typescript
import { Injectable } from '@navios/di'

@Injectable({ token: USER_SERVICE_TOKEN })
class UserService {
  getUsers() {
    return ['Alice', 'Bob', 'Charlie']
  }
}

// Inject using the token
const userService = await container.get(USER_SERVICE_TOKEN)
console.log(userService.getUsers())
```

## Token Types

### Basic Injection Token

Use basic tokens for interface-based injection:

```typescript
interface EmailService {
  sendEmail(to: string, subject: string): Promise<void>
}

const EMAIL_SERVICE_TOKEN = InjectionToken.create<EmailService>('EmailService')

@Injectable({ token: EMAIL_SERVICE_TOKEN })
class SmtpEmailService implements EmailService {
  async sendEmail(to: string, subject: string) {
    console.log(`SMTP email sent to ${to}: ${subject}`)
  }
}

// Usage
const emailService = await container.get(EMAIL_SERVICE_TOKEN)
await emailService.sendEmail('user@example.com', 'Hello')
```

### Token with Schema

Schema-based tokens validate configuration data:

```typescript
import { Injectable, InjectionToken } from '@navios/di'
import { z } from 'zod'

const databaseConfigSchema = z.object({
  host: z.string(),
  port: z.number(),
  database: z.string(),
  username: z.string(),
  password: z.string(),
})

const DB_CONFIG_TOKEN = InjectionToken.create<
  DatabaseConfig,
  typeof databaseConfigSchema
>('DB_CONFIG', databaseConfigSchema)

@Injectable({ token: DB_CONFIG_TOKEN })
class DatabaseConfigService {
  constructor(private config: z.infer<typeof databaseConfigSchema>) {}

  getConnectionString() {
    return `postgresql://${this.config.username}:${this.config.password}@${this.config.host}:${this.config.port}/${this.config.database}`
  }
}

// Usage with configuration
const dbConfig = await container.get(DB_CONFIG_TOKEN, {
  host: 'localhost',
  port: 5432,
  database: 'myapp',
  username: 'postgres',
  password: 'password',
})
```

### Bound Injection Token

Bound tokens pre-configure a token with specific values. Use them for environment-specific configuration:

```typescript
const CONFIG_TOKEN = InjectionToken.create<Config, typeof configSchema>(
  'APP_CONFIG',
  configSchema,
)

// Create bound tokens with specific values
const PRODUCTION_CONFIG = InjectionToken.bound(CONFIG_TOKEN, {
  apiUrl: 'https://api.production.com',
  timeout: 10000,
})

const DEVELOPMENT_CONFIG = InjectionToken.bound(CONFIG_TOKEN, {
  apiUrl: 'https://api.dev.com',
  timeout: 5000,
})

// Usage - no need to provide arguments
const prodConfig = await container.get(PRODUCTION_CONFIG)
const devConfig = await container.get(DEVELOPMENT_CONFIG)
```

### Factory Injection Token

Factory tokens provide **default configuration values** dynamically. They don't create services by themselves - the service must still be defined with `@Injectable` or `@Factory` decorators.

```typescript
// Define the service that will receive the configuration
@Injectable({ token: CONFIG_TOKEN })
class ConfigService {
  constructor(private config: z.infer<typeof configSchema>) {}

  getApiUrl() {
    return this.config.apiUrl
  }
}

// Create factory token that provides default configuration values
const DYNAMIC_CONFIG = InjectionToken.factory(CONFIG_TOKEN, async (ctx) => {
  const env = process.env.NODE_ENV || 'development'

  // Return configuration values that will be passed to ConfigService
  return {
    apiUrl:
      env === 'production'
        ? 'https://api.production.com'
        : 'https://api.dev.com',
    timeout: env === 'production' ? 10000 : 5000,
  }
})

// Usage - the factory token provides default config values to ConfigService
const config = await container.get(DYNAMIC_CONFIG)
console.log(config.getApiUrl()) // Dynamically resolved based on environment
```

**Important**: The factory token only provides configuration values. The service (`ConfigService` in this example) must still be registered with the container using `@Injectable` or `@Factory` decorators.

### Bound vs Factory Tokens

Both `InjectionToken.bound()` and `InjectionToken.factory()` provide **default configuration values** to services or factories. They don't create services by themselves.

- **Bound Tokens**: Use when you have **static** configuration values that don't change
- **Factory Tokens**: Use when you need to **dynamically compute** configuration values (e.g., based on environment variables, async operations, or other dependencies)

```typescript
// Bound: Static values
const PROD_CONFIG = InjectionToken.bound(CONFIG_TOKEN, {
  apiUrl: 'https://api.prod.com',
  timeout: 10000,
})

// Factory: Dynamic values
const DYNAMIC_CONFIG = InjectionToken.factory(CONFIG_TOKEN, async (ctx) => {
  const env = process.env.NODE_ENV || 'development'
  return {
    apiUrl:
      env === 'production' ? 'https://api.prod.com' : 'https://api.dev.com',
    timeout: env === 'production' ? 10000 : 5000,
  }
})
```

## Advanced Patterns

### Multiple Implementations

You can register multiple implementations for the same token. The last registered implementation will be used:

```typescript
interface PaymentProcessor {
  processPayment(amount: number): Promise<string>
}

const PAYMENT_PROCESSOR_TOKEN =
  InjectionToken.create<PaymentProcessor>('PaymentProcessor')

// Stripe implementation
@Injectable({ token: PAYMENT_PROCESSOR_TOKEN })
class StripePaymentProcessor implements PaymentProcessor {
  async processPayment(amount: number) {
    return `Processed $${amount} via Stripe`
  }
}

// PayPal implementation (will replace Stripe if registered after)
@Injectable({ token: PAYMENT_PROCESSOR_TOKEN })
class PayPalPaymentProcessor implements PaymentProcessor {
  async processPayment(amount: number) {
    return `Processed $${amount} via PayPal`
  }
}

// Usage - the last registered implementation will be used
const paymentProcessor = await container.get(PAYMENT_PROCESSOR_TOKEN)
await paymentProcessor.processPayment(100)
```

### Injecting Schema-based Services

You can inject schema-based services with bound arguments:

```typescript
import { inject, Injectable } from '@navios/di'
import { z } from 'zod'

const dbConfigSchema = z.object({
  connectionString: z.string(),
})

@Injectable({ schema: dbConfigSchema })
class DatabaseConfig {
  constructor(public readonly config: z.output<typeof dbConfigSchema>) {}
}

@Injectable()
class DatabaseService {
  // Inject with bound arguments
  private dbConfig = inject(DatabaseConfig, {
    connectionString: 'postgres://localhost:5432/myapp',
  })

  connect() {
    return `Connecting to ${this.dbConfig.config.connectionString}`
  }
}
```

## Best Practices

### 1. Use Descriptive Token Names

Choose clear, descriptive names that indicate the token's purpose:

```typescript
// ✅ Good: Descriptive names
const USER_REPOSITORY_TOKEN =
  InjectionToken.create<UserRepository>('UserRepository')
const EMAIL_SERVICE_TOKEN = InjectionToken.create<EmailService>('EmailService')

// ❌ Avoid: Generic names
const SERVICE_TOKEN = InjectionToken.create<Service>('Service')
```

### 2. Define Schemas for Configuration Tokens

Always use Zod schemas for configuration tokens to ensure type safety and validation:

```typescript
// ✅ Good: Define schema for configuration
const configSchema = z.object({
  apiUrl: z.string().url(),
  timeout: z.number().min(1000),
  retries: z.number().min(0).max(10),
})

const CONFIG_TOKEN = InjectionToken.create<Config, typeof configSchema>(
  'APP_CONFIG',
  configSchema,
)
```

### 3. Use Bound Tokens for Environment-Specific Configuration

Bound tokens are perfect for environment-specific static configuration:

```typescript
const PRODUCTION_CONFIG = InjectionToken.bound(CONFIG_TOKEN, {
  apiUrl: 'https://api.production.com',
  timeout: 10000,
  retries: 5,
})

const DEVELOPMENT_CONFIG = InjectionToken.bound(CONFIG_TOKEN, {
  apiUrl: 'https://api.dev.com',
  timeout: 5000,
  retries: 3,
})
```

### 4. Use Factory Tokens for Dynamic Default Values

Factory tokens are ideal when configuration depends on runtime values:

```typescript
const DYNAMIC_CONFIG = InjectionToken.factory(CONFIG_TOKEN, async () => {
  const env = process.env.NODE_ENV || 'development'

  return {
    apiUrl:
      env === 'production' ? 'https://api.prod.com' : 'https://api.dev.com',
    timeout: env === 'production' ? 10000 : 5000,
    retries: env === 'production' ? 5 : 3,
  }
})
```

### 5. Group Related Tokens

Organize related tokens together for better maintainability:

```typescript
export const DATABASE_TOKENS = {
  CONFIG: InjectionToken.create<DatabaseConfig>('DatabaseConfig'),
  CONNECTION: InjectionToken.create<DatabaseConnection>('DatabaseConnection'),
  REPOSITORY: InjectionToken.create<UserRepository>('UserRepository'),
} as const
```

## API Reference

### InjectionToken.create

```typescript
// Simple token
static create<T>(name: string | symbol): InjectionToken<T, undefined>

// Token with schema
static create<T, S extends InjectionTokenSchemaType>(
  name: string | symbol,
  schema: S
): InjectionToken<T, S>
```

### InjectionToken.bound

```typescript
static bound<T, S extends InjectionTokenSchemaType>(
  token: InjectionToken<T, S>,
  value: z.input<S>
): BoundInjectionToken<T, S>
```

### InjectionToken.factory

Creates a factory token that provides **default configuration values** to a service or factory. The factory function dynamically computes the configuration values that will be passed to the service/factory.

```typescript
static factory<T, S extends InjectionTokenSchemaType>(
  token: InjectionToken<T, S>,
  factory: (ctx: FactoryContext) => Promise<z.input<S>>
): FactoryInjectionToken<T, S>
```

**Note**: This doesn't create the service itself - the service must be defined with `@Injectable` or `@Factory` decorators.

## Next Steps

- Learn about [services](/docs/di/di/guides/services) for class-based services
- Explore [factories](/docs/di/di/guides/factories) for complex object creation
- Understand [scopes](/docs/di/di/guides/scopes) for service lifetime management
