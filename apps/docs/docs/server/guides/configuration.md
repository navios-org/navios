---
sidebar_position: 5
title: Configuration
---

# Configuration

Navios provides a configuration system for managing application settings with type-safe access.

:::tip
For comprehensive documentation on ConfigService, see the [ConfigService guide](/docs/server/guides/config-service).
:::

## ConfigService

The `ConfigService` provides access to configuration values with support for nested paths using dot notation.

### Methods

| Method | Description |
|--------|-------------|
| `get(key)` | Get value by key, returns `null` if not found |
| `getOrDefault(key, default)` | Get value or return default |
| `getOrThrow(key, message?)` | Get value or throw exception |
| `getConfig()` | Get entire config object |

For detailed usage examples and best practices, see the [ConfigService guide](/docs/server/guides/config-service).

## Using provideConfig

Create a custom configuration provider with the `load` function:

```typescript
import { provideConfig, ConfigServiceToken } from '@navios/core'
import { inject } from '@navios/di'

// Define your configuration type
interface AppConfig {
  port: number
  database: {
    host: string
    port: number
    name: string
  }
  jwt: {
    secret: string
    expiresIn: string
  }
}

// Provide configuration
const AppConfigToken = provideConfig<AppConfig>({
  load: () => ({
    port: parseInt(process.env.PORT || '3000'),
    database: {
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5432'),
      name: process.env.DATABASE_NAME || 'myapp',
    },
    jwt: {
      secret: process.env.JWT_SECRET || 'dev-secret',
      expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    },
  }),
})
```

## Using Configuration

Inject the configuration token into services:

```typescript
import { Injectable, inject } from '@navios/di'

@Injectable()
class DatabaseService {
  private config = inject(AppConfigToken)

  async connect() {
    const dbConfig = this.config.get('database')
    console.log(`Connecting to ${dbConfig.host}:${dbConfig.port}`)
  }
}
```

## EnvConfigProvider

Use the predefined `EnvConfigProvider` for simple environment variable access:

```typescript
import { EnvConfigProvider } from '@navios/core'
import { inject } from '@navios/di'

@Injectable()
class AppService {
  private env = inject(EnvConfigProvider)

  getPort(): string | null {
    return this.env.get('PORT')
  }

  getDatabaseUrl(): string {
    return this.env.getOrThrow('DATABASE_URL')
  }
}
```

## Nested Path Access

Access nested configuration using dot notation:

```typescript
@Injectable()
class JwtService {
  private config = inject(AppConfigToken)

  getSecret(): string {
    return this.config.getOrThrow('jwt.secret')
  }

  getExpiresIn(): string {
    return this.config.getOrDefault('jwt.expiresIn', '1h')
  }
}
```

## Error Handling

Use `getOrThrow` to ensure required configuration exists:

```typescript
@Injectable()
class PaymentService {
  private config = inject(AppConfigToken)

  constructor() {
    // Throws if STRIPE_KEY is not configured
    this.config.getOrThrow('stripe.apiKey', 'Stripe API key is required')
  }
}
```

## Async Configuration Loading

The `load` function can be async for loading from external sources:

```typescript
const AppConfigToken = provideConfig<AppConfig>({
  load: async () => {
    // Load from secrets manager, remote config, etc.
    const secrets = await loadSecretsFromVault()

    return {
      port: 3000,
      database: {
        host: secrets.DB_HOST,
        port: secrets.DB_PORT,
        name: secrets.DB_NAME,
      },
      jwt: {
        secret: secrets.JWT_SECRET,
        expiresIn: '1h',
      },
    }
  },
})
```

## Environment-Specific Configuration

Load different configuration based on environment:

```typescript
const environment = process.env.NODE_ENV || 'development'

const configs = {
  development: {
    debug: true,
    database: { host: 'localhost', port: 5432, name: 'dev' },
  },
  production: {
    debug: false,
    database: {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432'),
      name: process.env.DB_NAME,
    },
  },
}

const AppConfigToken = provideConfig({
  load: () => configs[environment],
})
```

## Using in Controllers

```typescript
@Controller()
class HealthController {
  private config = inject(AppConfigToken)

  @Endpoint(getHealth)
  async getHealth() {
    return {
      status: 'ok',
      environment: this.config.get('environment'),
      version: this.config.getOrDefault('version', '1.0.0'),
    }
  }
}
```

## Logger Configuration

Navios provides a comprehensive logging system. For detailed information about configuring and using the logger, see the [Logging guide](/docs/server/guides/logging).

### Basic Logger Setup

```typescript
import { NaviosFactory } from '@navios/core'
import { defineFastifyEnvironment } from '@navios/adapter-fastify'

const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
  logger: ['log', 'error', 'warn'], // Enable specific log levels
})
```

### Custom Logger

```typescript
import { LoggerService } from '@navios/core'

class CustomLogger implements LoggerService {
  log(message: string) { /* ... */ }
  error(message: string, stack?: string) { /* ... */ }
  warn(message: string) { /* ... */ }
}

const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
  logger: new CustomLogger(),
})
```

For more details, see the [Logging guide](/docs/server/guides/logging).

## Related Documentation

- [ConfigService Guide](/docs/server/guides/config-service) - Comprehensive ConfigService documentation
- [Logging Guide](/docs/server/guides/logging) - Logger system documentation
- [Services & DI](/docs/server/guides/services) - Using services with dependency injection
- [DI: Injection Tokens](/docs/di/guides/injection-tokens) - Advanced dependency injection patterns
