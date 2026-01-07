---
sidebar_position: 3
---

# Injection Tokens

This guide covers advanced injection token patterns. For basic token creation and usage, see the [Getting Started guide](/docs/di/di/getting-started/injection-tokens).

## Foundation: Every Service Has a Token

**Injection Tokens are the foundation of Navios DI.** Every `@Injectable` service and `@Factory` has an Injection Token:

- **Auto-created**: When you use `@Injectable()` without a `token` option, the DI system automatically creates a token from the class
- **Explicit**: You can provide your own token using the `token` option in `@Injectable()` or `@Factory()`

The token is what identifies the service in the Registry and what the Container uses to resolve services. Services are resolved by token, not by class directly.

## Multiple Implementations

You can register multiple implementations for the same token. The one with the highest priority wins:

```typescript
interface PaymentProcessor {
  processPayment(amount: number): Promise<string>
}

const PAYMENT_PROCESSOR_TOKEN =
  InjectionToken.create<PaymentProcessor>('PaymentProcessor')

// Stripe implementation
@Injectable({ token: PAYMENT_PROCESSOR_TOKEN, priority: 100 })
class StripePaymentProcessor implements PaymentProcessor {
  async processPayment(amount: number) {
    return `Processed $${amount} via Stripe`
  }
}

// PayPal implementation (higher priority - wins)
@Injectable({ token: PAYMENT_PROCESSOR_TOKEN, priority: 200 })
class PayPalPaymentProcessor implements PaymentProcessor {
  async processPayment(amount: number) {
    return `Processed $${amount} via PayPal`
  }
}

// Usage - PayPalPaymentProcessor will be resolved
const paymentProcessor = await container.get(PAYMENT_PROCESSOR_TOKEN)
await paymentProcessor.processPayment(100)
```

This pattern is useful for:
- **Environment-specific implementations**: Different implementations for different environments
- **Feature flags**: Enable/disable features by overriding services
- **Plugin systems**: Allow plugins to register implementations

## Complex Schemas

Injection Tokens can use complex Zod schemas for type-safe configuration:

```typescript
import { Injectable, InjectionToken } from '@navios/di'
import { z } from 'zod'

// Complex nested schema
const appConfigSchema = z.object({
  database: z.object({
    host: z.string(),
    port: z.number().min(1).max(65535),
    credentials: z.object({
      username: z.string(),
      password: z.string(),
    }),
  }),
  api: z.object({
    baseUrl: z.string().url(),
    timeout: z.number().min(1000),
    retries: z.number().min(0).max(10),
  }),
  features: z.object({
    enableAnalytics: z.boolean(),
    enableCache: z.boolean(),
  }),
})

const APP_CONFIG_TOKEN = InjectionToken.create<
  AppConfig,
  typeof appConfigSchema
>('APP_CONFIG', appConfigSchema)

@Injectable({ token: APP_CONFIG_TOKEN })
class AppConfigService {
  constructor(private config: z.infer<typeof appConfigSchema>) {}

  getDatabaseHost() {
    return this.config.database.host
  }
}
```

## Token Composition

You can compose tokens from other tokens:

```typescript
// Base configuration token
const baseConfigSchema = z.object({
  environment: z.enum(['development', 'production']),
  debug: z.boolean(),
})

const BASE_CONFIG_TOKEN = InjectionToken.create<
  BaseConfig,
  typeof baseConfigSchema
>('BASE_CONFIG', baseConfigSchema)

// Extended configuration token
const extendedConfigSchema = baseConfigSchema.extend({
  apiKey: z.string(),
  apiSecret: z.string(),
})

const EXTENDED_CONFIG_TOKEN = InjectionToken.create<
  ExtendedConfig,
  typeof extendedConfigSchema
>('EXTENDED_CONFIG', extendedConfigSchema)
```

## Injecting Schema-based Services

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

## Token Groups

Organize related tokens together:

```typescript
export const DATABASE_TOKENS = {
  CONFIG: InjectionToken.create<DatabaseConfig>('DatabaseConfig'),
  CONNECTION: InjectionToken.create<DatabaseConnection>('DatabaseConnection'),
  REPOSITORY: InjectionToken.create<UserRepository>('UserRepository'),
} as const

// Usage
@Injectable({ token: DATABASE_TOKENS.CONNECTION })
class DatabaseConnection {}

@Injectable({ token: DATABASE_TOKENS.REPOSITORY })
class UserRepository {}
```

This improves maintainability and makes token relationships clear.

## Advanced Bound Token Patterns

### Environment-Specific Bound Tokens

```typescript
const CONFIG_TOKEN = InjectionToken.create<Config, typeof configSchema>(
  'APP_CONFIG',
  configSchema,
)

// Create environment-specific bound tokens
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

// Use the appropriate token based on environment
const configToken = process.env.NODE_ENV === 'production'
  ? PRODUCTION_CONFIG
  : DEVELOPMENT_CONFIG

const config = await container.get(configToken)
```

## Advanced Factory Token Patterns

### Dynamic Configuration Based on Dependencies

```typescript
const DYNAMIC_CONFIG = InjectionToken.factory(CONFIG_TOKEN, async (ctx) => {
  // Access other services from the container
  const envService = await ctx.container.get(EnvironmentService)
  const featureFlags = await ctx.container.get(FeatureFlagsService)

  return {
    apiUrl: envService.getApiUrl(),
    timeout: featureFlags.isEnabled('fast-timeout') ? 1000 : 5000,
    retries: envService.isProduction() ? 5 : 3,
  }
})
```

### Conditional Factory Tokens

```typescript
const CONDITIONAL_CONFIG = InjectionToken.factory(CONFIG_TOKEN, async (ctx) => {
  const env = process.env.NODE_ENV || 'development'

  if (env === 'production') {
    return {
      apiUrl: 'https://api.production.com',
      timeout: 10000,
    }
  } else if (env === 'staging') {
    return {
      apiUrl: 'https://api.staging.com',
      timeout: 5000,
    }
  } else {
    return {
      apiUrl: 'http://localhost:3000',
      timeout: 2000,
    }
  }
})
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

### 3. Group Related Tokens

Organize related tokens together for better maintainability:

```typescript
export const DATABASE_TOKENS = {
  CONFIG: InjectionToken.create<DatabaseConfig>('DatabaseConfig'),
  CONNECTION: InjectionToken.create<DatabaseConnection>('DatabaseConnection'),
  REPOSITORY: InjectionToken.create<UserRepository>('UserRepository'),
} as const
```

### 4. Use Bound Tokens for Environment-Specific Configuration

Bound tokens are perfect for environment-specific static configuration:

```typescript
const PRODUCTION_CONFIG = InjectionToken.bound(CONFIG_TOKEN, {
  apiUrl: 'https://api.production.com',
  timeout: 10000,
  retries: 5,
})
```

### 5. Use Factory Tokens for Dynamic Default Values

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

## Next Steps

- Learn about [services](/docs/di/di/guides/services) for class-based services
- Explore [factories](/docs/di/di/guides/factories) for complex object creation
- Understand [scopes](/docs/di/di/guides/scopes) for service lifetime management