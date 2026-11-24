---
sidebar_position: 4
---

# Bound and Factory Tokens

Bound and Factory Injection Tokens provide default configuration values to services or factories. They don't create services by themselves - the service must still be defined with `@Injectable` or `@Factory` decorators.

## Bound Injection Tokens

Bound tokens pre-configure a token with specific static values. Use them for environment-specific configuration:

```typescript
import { InjectionToken } from '@navios/di'
import { z } from 'zod'

// Define the base token with schema
const configSchema = z.object({
  apiUrl: z.string(),
  timeout: z.number(),
})

const CONFIG_TOKEN = InjectionToken.create<Config, typeof configSchema>(
  'APP_CONFIG',
  configSchema
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

// Register the service
@Injectable({ token: CONFIG_TOKEN })
class ConfigService {
  constructor(private config: z.infer<typeof configSchema>) {}

  getApiUrl() {
    return this.config.apiUrl
  }
}

// Usage - no need to provide arguments
const container = new Container()
const prodConfig = await container.get(PRODUCTION_CONFIG)
const devConfig = await container.get(DEVELOPMENT_CONFIG)
```

Bound tokens provide **static** configuration values that don't change. They're perfect for environment-specific static configuration.

## Factory Injection Tokens

Factory tokens provide **default configuration values** dynamically. They compute configuration values at runtime:

```typescript
import { InjectionToken } from '@navios/di'
import { z } from 'zod'

const configSchema = z.object({
  apiUrl: z.string(),
  timeout: z.number(),
})

const CONFIG_TOKEN = InjectionToken.create<Config, typeof configSchema>(
  'APP_CONFIG',
  configSchema
)

// Register the service
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
const container = new Container()
const config = await container.get(DYNAMIC_CONFIG)
console.log(config.getApiUrl()) // Dynamically resolved based on environment
```

**Important**: The factory token only provides configuration values. The service (`ConfigService` in this example) must still be registered with the container using `@Injectable` or `@Factory` decorators.

## Bound vs Factory Tokens

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

## When to Use

- **Bound Tokens**: Environment-specific static configuration, feature flags, constant values
- **Factory Tokens**: Configuration that depends on runtime values, async operations, or other services

## Next Steps

- **[Factories](/docs/di/di/getting-started/factories)** - Learn how to create factories