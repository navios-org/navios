---
sidebar_position: 5
title: Configuration
---

# Configuration

Navios provides a type-safe configuration system for managing application settings.

## ConfigService

The `ConfigService` provides access to configuration values with support for nested paths using dot notation.

### Creating ConfigService

```typescript
import { ConfigService } from '@navios/core'

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

const config = new ConfigService<AppConfig>({
  port: parseInt(process.env.PORT || '3000', 10),
  database: {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    name: process.env.DATABASE_NAME || 'myapp',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
  },
})
```

### API Methods

| Method | Description |
|--------|-------------|
| `get(key)` | Get value by key, returns `null` if not found |
| `getOrDefault(key, default)` | Get value or return default |
| `getOrThrow(key, message?)` | Get value or throw exception |
| `getConfig()` | Get entire config object |

### Using in Services

```typescript
import { inject, Injectable } from '@navios/di'
import { ConfigService } from '@navios/core'

@Injectable()
export class DatabaseService {
  private config = inject(ConfigService)

  connect() {
    // Returns null if not found
    const host = this.config.get('database.host')

    // Returns default if not found
    const port = this.config.getOrDefault('database.port', 5432)

    // Throws if not found
    const secret = this.config.getOrThrow('jwt.secret', 'JWT secret is required')
  }
}
```

### Nested Path Access

Access deeply nested values using dot notation:

```typescript
interface AppConfig {
  database: {
    connection: {
      host: string
      pool: { min: number; max: number }
    }
  }
}

@Injectable()
export class DatabaseService {
  private config = inject(ConfigService<AppConfig>)

  setup() {
    const host = this.config.getOrThrow('database.connection.host')
    const minPool = this.config.getOrDefault('database.connection.pool.min', 2)
  }
}
```

## provideConfig

For more control, use `provideConfig` with a `load` function:

```typescript
import { provideConfig } from '@navios/core'

interface AppConfig {
  port: number
  database: { host: string; port: number }
}

const AppConfigToken = provideConfig<AppConfig>({
  load: () => ({
    port: parseInt(process.env.PORT || '3000'),
    database: {
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5432'),
    },
  }),
})

// Inject using the token
@Injectable()
class DatabaseService {
  private config = inject(AppConfigToken)

  connect() {
    const dbConfig = this.config.get('database')
  }
}
```

### Async Configuration

The `load` function can be async for loading from external sources:

```typescript
const AppConfigToken = provideConfig<AppConfig>({
  load: async () => {
    const secrets = await loadSecretsFromVault()
    return {
      port: 3000,
      database: {
        host: secrets.DB_HOST,
        port: secrets.DB_PORT,
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
    database: { host: 'localhost', port: 5432 },
  },
  production: {
    debug: false,
    database: {
      host: process.env.DB_HOST!,
      port: parseInt(process.env.DB_PORT || '5432'),
    },
  },
}

const config = new ConfigService(configs[environment])
```

## EnvConfigProvider

For simple environment variable access without a typed config:

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

## Registering ConfigService

Register your ConfigService in the application bootstrap:

```typescript
import { NaviosFactory } from '@navios/core'
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { Container } from '@navios/di'

async function bootstrap() {
  const config = new ConfigService<AppConfig>({
    port: parseInt(process.env.PORT || '3000', 10),
    database: {
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    },
  })

  const container = new Container()
  container.bind(ConfigService).toValue(config)

  const app = await NaviosFactory.create(AppModule, {
    adapter: defineFastifyEnvironment(),
    container,
  })

  const port = config.getOrThrow('port')
  await app.listen({ port })
}
```

## Best Practices

**Define configuration types** - Always use TypeScript interfaces for type safety:

```typescript
// Good
interface AppConfig { port: number; database: { host: string } }
const config = new ConfigService<AppConfig>({ /* ... */ })

// Avoid - no type safety
const config = new ConfigService({ port: 3000 })
```

**Use getOrThrow for required values** - Fail fast if configuration is missing:

```typescript
// Good - fails immediately if missing
const secret = config.getOrThrow('jwt.secret', 'JWT secret is required')

// Avoid - silent failures
const secret = config.get('jwt.secret') || 'default'
```

**Centralize configuration** - Create a single configuration module:

```typescript
// config/app.config.ts
export interface AppConfig { /* ... */ }

export function createAppConfig(): ConfigService<AppConfig> {
  return new ConfigService<AppConfig>({ /* ... */ })
}
```
