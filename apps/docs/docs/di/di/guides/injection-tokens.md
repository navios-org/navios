---
sidebar_position: 3
---

# Injection Tokens

Injection tokens provide a flexible way to identify and resolve dependencies in Navios DI. They allow you to decouple service implementations from their consumers, making your code more modular and testable.

## Overview

Injection tokens serve as unique identifiers for services and can be used with:

- **Schemas**: Define the shape of configuration data
- **Bound Values**: Pre-configure tokens with specific values
- **Factories**: Provide default configuration values dynamically (doesn't create services by itself)

## Basic Usage

### Creating Injection Tokens

```typescript
import { InjectionToken } from '@navios/di'

// Token with schema
import { z } from 'zod'

// Simple token without schema
const USER_SERVICE_TOKEN = InjectionToken.create<UserService>('UserService')

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

```typescript
import { Injectable, InjectionToken } from '@navios/di'

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

console.log(dbConfig.getConnectionString())
```

### Bound Injection Token

Bound tokens allow you to pre-configure a token with specific values:

```typescript
import { InjectionToken } from '@navios/di'

import { z } from 'zod'

const configSchema = z.object({
  apiUrl: z.string(),
  timeout: z.number(),
})

const CONFIG_TOKEN = InjectionToken.create<Config, typeof configSchema>(
  'APP_CONFIG',
  configSchema,
)

// Create bound token with specific values
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

console.log(prodConfig.apiUrl) // 'https://api.production.com'
console.log(devConfig.apiUrl) // 'https://api.dev.com'
```

### Factory Injection Token

Factory tokens provide **default configuration values** to services or factories. They don't create services by themselves - the service must still be defined with `@Injectable` or `@Factory` decorators. The factory function is used to dynamically compute the configuration values that will be passed to the service or factory.

```typescript
import { Factory, Injectable, InjectionToken } from '@navios/di'

import { z } from 'zod'

// Define the configuration schema
const configSchema = z.object({
  apiUrl: z.string(),
  timeout: z.number(),
})

// Create the base token
const CONFIG_TOKEN = InjectionToken.create<ConfigService, typeof configSchema>(
  'APP_CONFIG',
  configSchema,
)

// Define the service that will receive the configuration
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

// Create factory token that provides default configuration values
// This doesn't create the service - it just provides the config values
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

**Remember**: Both bound and factory tokens only provide configuration values. The actual service must be defined with `@Injectable` or `@Factory` decorators.

## Advanced Patterns

### Multiple Implementations

```typescript
import { Injectable, InjectionToken } from '@navios/di'

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

// PayPal implementation
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

### Token with Optional Schema

```typescript
import { Injectable, InjectionToken } from '@navios/di'

import { z } from 'zod'

const optionalConfigSchema = z.object({
  apiUrl: z.string(),
  timeout: z.number().optional(),
  retries: z.number().optional(),
})

const OPTIONAL_CONFIG_TOKEN = InjectionToken.create<
  OptionalConfigService,
  typeof optionalConfigSchema
>('OPTIONAL_CONFIG', optionalConfigSchema)

@Injectable({ token: OPTIONAL_CONFIG_TOKEN })
class OptionalConfigService {
  constructor(private config: z.infer<typeof optionalConfigSchema>) {}

  getApiUrl() {
    return this.config.apiUrl
  }

  getTimeout() {
    return this.config.timeout ?? 5000
  }

  getRetries() {
    return this.config.retries ?? 3
  }
}

// Usage with partial configuration
const config = await container.get(OPTIONAL_CONFIG_TOKEN, {
  apiUrl: 'https://api.example.com',
  // timeout and retries are optional
})

console.log(config.getTimeout()) // 5000 (default)
console.log(config.getRetries()) // 3 (default)
```

## Using Schema-based Services as Dependencies

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

```typescript
// ✅ Good: Descriptive names
const USER_REPOSITORY_TOKEN =
  InjectionToken.create<UserRepository>('UserRepository')
const EMAIL_SERVICE_TOKEN = InjectionToken.create<EmailService>('EmailService')

// ❌ Avoid: Generic names
const SERVICE_TOKEN = InjectionToken.create<Service>('Service')
const TOKEN_1 = InjectionToken.create<Service>('Token1')
```

### 2. Define Schemas for Configuration Tokens

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

```typescript
// ✅ Good: Environment-specific bound tokens
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

Factory tokens are used to provide **default configuration values** to services or factories. They don't create services themselves - the service must be defined separately with `@Injectable` or `@Factory`.

```typescript
// ✅ Good: Factory provides default config values
// First, define the service that will receive the config
@Injectable({ token: CONFIG_TOKEN })
class ConfigService {
  constructor(private config: z.infer<typeof configSchema>) {}
  // ... service methods
}

// Then, create a factory token that provides default values
const DYNAMIC_CONFIG = InjectionToken.factory(CONFIG_TOKEN, async () => {
  const env = process.env.NODE_ENV || 'development'

  // Return default configuration values
  return {
    apiUrl:
      env === 'production' ? 'https://api.prod.com' : 'https://api.dev.com',
    timeout: env === 'production' ? 10000 : 5000,
    retries: env === 'production' ? 5 : 3,
  }
})

// Usage - factory token provides default values to ConfigService
const config = await container.get(DYNAMIC_CONFIG)
```

### 5. Group Related Tokens

```typescript
// ✅ Good: Group related tokens
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

Creates a factory token that provides **default configuration values** to a service or factory. The factory function dynamically computes the configuration values that will be passed to the service/factory. **Note**: This doesn't create the service itself - the service must be defined with `@Injectable` or `@Factory` decorators.

```typescript
static factory<T, S extends InjectionTokenSchemaType>(
  token: InjectionToken<T, S>,
  factory: (ctx: FactoryContext) => Promise<z.input<S>>
): FactoryInjectionToken<T, S>
```

**Usage**: The factory token provides default configuration values. When you request the factory token from the container, it resolves the configuration values and passes them to the service or factory registered with the base token.

## Next Steps

- Learn about [services](/docs/di/di/guides/services) for class-based services
- Explore [factories](/docs/di/di/guides/factories) for complex object creation
- Understand [scopes](/docs/di/di/guides/scopes) for service lifetime management
