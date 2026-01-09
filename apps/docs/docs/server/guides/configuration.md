---
sidebar_position: 5
title: Configuration
---

# Configuration

Navios provides a type-safe configuration system for managing application settings through dependency injection. This guide explains how to set up and use configuration in your application.

## Overview

The configuration system in Navios is built around the `ConfigService` class, which provides type-safe access to configuration values using dot notation for nested paths.

To provide configuration to your services, you create an **injection token** using either `provideConfig()` or `InjectionToken.bound()`, which provides a configured `ConfigService` injection token. This token is then injected into your services where you need configuration access.

## Creating a Configuration Token

There are two ways to create a configuration token:

### Using `provideConfig()`

The `provideConfig()` function is a convenient shortcut for `InjectionToken.factory()` that creates a factory injection token. Use this when you need to load configuration dynamically or asynchronously.

```typescript
import { provideConfig } from '@navios/core'

interface AppConfig {
  port: number
  database: {
    host: string
    port: number
  }
  jwt: {
    secret: string
    expiresIn: string
  }
}

// Create the injection token
export const AppConfigService = provideConfig<AppConfig>({
  load: () => ({
    port: parseInt(process.env.PORT || '3000', 10),
    database: {
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    },
    jwt: {
      secret: process.env.JWT_SECRET || 'dev-secret',
      expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    },
  }),
})
```

:::info
The `load` function can be async if you need to load configuration from external sources like files, databases, or secret vaults.
:::

### Using `InjectionToken.bound()`

```typescript
interface AppConfig {
  port: number
  database: { host: string; port: number }
}

export const AppConfigService = InjectionToken.bound<ConfigService<AppConfig>>(
  ConfigServiceToken,
  {
    port: parseInt(process.env.PORT || '3000', 10),
    database: {
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    },
  },
)
```

**Note:** `provideConfig()` is generally preferred as it's more concise and supports async loading out of the box.

## Using Configuration in Services

Once you've created a configuration token, inject it into your services using the `inject()` function. **Important:** You must inject the token you created (e.g., `AppConfigService`), not `ConfigService` directly. Injecting `ConfigService` directly will result in an empty configuration.

```typescript
import { inject, Injectable } from '@navios/di'

import { AppConfigService } from './config/app.config'

@Injectable()
export class DatabaseService {
  private config = inject(AppConfigService)

  connect() {
    // Access configuration values using dot notation
    const host = this.config.get('database.host')
    const port = this.config.getOrDefault('database.port', 5432)
    const secret = this.config.getOrThrow(
      'jwt.secret',
      'JWT secret is required',
    )
  }
}
```

## Configuration API

The `ConfigService` provides four methods for accessing configuration values:

### `get(key)`

Returns the configuration value at the given path, or `null` if not found. Use this when a value might be optional.

```typescript
const host = this.config.get('database.host') // string | null
```

### `getOrDefault(key, defaultValue)`

Returns the configuration value, or the provided default if not found. Use this when you have a sensible fallback value.

```typescript
const port = this.config.getOrDefault('database.port', 5432) // number
```

### `getOrThrow(key, errorMessage?)`

Returns the configuration value, or throws an error if not found. Use this for required configuration values to fail fast.

```typescript
const secret = this.config.getOrThrow('jwt.secret', 'JWT secret is required') // string
```

### `getConfig()`

Returns the entire configuration object. Use this when you need access to the full configuration structure.

```typescript
const fullConfig = this.config.getConfig() // AppConfig
```

## Nested Path Access

You can access deeply nested configuration values using dot notation. The TypeScript types are automatically inferred based on your configuration interface:

```typescript
interface AppConfig {
  database: {
    connection: {
      host: string
      pool: {
        min: number
        max: number
      }
    }
  }
}

// In your service
const host = this.config.getOrThrow('database.connection.host') // string
const minPool = this.config.getOrDefault('database.connection.pool.min', 2) // number
```

## Environment-Specific Configuration

You can load different configuration based on the environment by using conditional logic in your `load` function:

```typescript
export const AppConfigService = provideConfig<AppConfig>({
  load: () => {
    const environment = process.env.NODE_ENV || 'development'

    const configs = {
      development: {
        debug: true,
        database: { host: 'localhost', port: 5432 },
      },
      production: {
        debug: false,
        database: {
          host: process.env.DB_HOST!,
          port: parseInt(process.env.DB_PORT || '5432', 10),
        },
      },
    }

    return configs[environment]
  },
})
```

## Using Configuration in Bootstrap

In your bootstrap function, retrieve the configuration service using `app.get()` with the token you created. Make sure to call `app.init()` first:

```typescript
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { NaviosFactory, provideConfig } from '@navios/core'

import { AppModule } from './app.module'
import { AppConfigService } from './config/app.config'

async function bootstrap() {
  const app = await NaviosFactory.create(AppModule, {
    adapter: defineFastifyEnvironment(),
  })

  await app.init()

  // Get the config service using the token
  const config = await app.get(AppConfigService)
  const port = config.getOrThrow('port')
  await app.listen({ port })
}

bootstrap()
```

## EnvConfigProvider

For simple cases where you only need to access environment variables without a typed configuration structure, you can use the pre-configured `EnvConfigProvider`:

```typescript
import { EnvConfigProvider } from '@navios/core'
import { inject, Injectable } from '@navios/di'

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

`EnvConfigProvider` is a `ConfigService<Record<string, string>>` that's pre-bound to `process.env`, so you can use it directly without creating your own token.

## Best Practices

### Define Configuration Types

Always use TypeScript interfaces for type safety. This enables autocomplete and compile-time type checking:

```typescript
// ✅ Good - full type safety
interface AppConfig {
  port: number
  database: { host: string; port: number }
}
export const AppConfigService = provideConfig<AppConfig>({
  load: () => ({ port: 3000, database: { host: 'localhost', port: 5432 } }),
})

// ❌ Avoid - no type safety
export const AppConfigService = provideConfig({
  load: () => ({ port: 3000 }),
})
```

### Use `getOrThrow` for Required Values

Fail fast if required configuration is missing. This makes configuration errors obvious at startup rather than causing runtime failures later:

```typescript
// ✅ Good - fails immediately if missing
const secret = config.getOrThrow('jwt.secret', 'JWT secret is required')

// ❌ Avoid - silent failures that cause issues later
const secret = config.get('jwt.secret') || 'default'
```

### Centralize Configuration

Create a single configuration module that exports both your configuration interface and token. This makes it easy to find and maintain all configuration:

```typescript
// config/app.config.ts
export interface AppConfig {
  port: number
  database: {
    host: string
    port: number
  }
  jwt: {
    secret: string
    expiresIn: string
  }
}

export const AppConfigService = provideConfig<AppConfig>({
  load: () => ({
    port: parseInt(process.env.PORT || '3000', 10),
    database: {
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    },
    jwt: {
      secret: process.env.JWT_SECRET || 'dev-secret',
      expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    },
  }),
})
```
