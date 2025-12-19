---
sidebar_position: 8
title: ConfigService
---

# ConfigService

The `ConfigService` provides type-safe access to configuration values with support for nested paths using dot notation. It's the recommended way to manage application configuration in Navios.

## Overview

`ConfigService` is a built-in service that provides:

- **Type-safe configuration access** - Full TypeScript type inference
- **Nested path support** - Access nested values using dot notation (e.g., `database.host`)
- **Default values** - Provide fallback values for optional configuration
- **Error handling** - Throw errors for missing required configuration

## Basic Usage

### Creating a ConfigService

```typescript
import { ConfigService } from '@navios/core'
import { inject, Injectable } from '@navios/di'

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

// Create ConfigService with your configuration
const config = new ConfigService<AppConfig>({
  port: 3000,
  database: {
    host: 'localhost',
    port: 5432,
    name: 'myapp',
  },
  jwt: {
    secret: 'my-secret-key',
    expiresIn: '1h',
  },
})

// Use in services
@Injectable()
export class DatabaseService {
  private config = inject(ConfigService)

  connect() {
    const host = this.config.getOrThrow('database.host')
    const port = this.config.getOrDefault('database.port', 5432)
    // host is typed as string, port is typed as number
  }
}
```

## API Methods

### `get(key)`

Gets a configuration value by key path. Returns `null` if not found.

```typescript
@Injectable()
export class DatabaseService {
  private config = inject(ConfigService)

  connect() {
    const host = this.config.get('database.host') // string | null
    const port = this.config.get('database.port') // number | null

    if (host) {
      // Use host
    }
  }
}
```

### `getOrDefault(key, defaultValue)`

Gets a configuration value or returns a default value if not found.

```typescript
@Injectable()
export class DatabaseService {
  private config = inject(ConfigService)

  connect() {
    // Returns default if 'database.port' is not found
    const port = this.config.getOrDefault('database.port', 5432) // number
    const timeout = this.config.getOrDefault('database.timeout', 5000) // number
  }
}
```

### `getOrThrow(key, errorMessage?)`

Gets a configuration value or throws an error if not found.

```typescript
@Injectable()
export class DatabaseService {
  private config = inject(ConfigService)

  connect() {
    // Throws if 'database.host' is not found
    const host = this.config.getOrThrow('database.host') // string

    // Custom error message
    const secret = this.config.getOrThrow(
      'jwt.secret',
      'JWT secret is required',
    ) // string
  }
}
```

### `getConfig()`

Gets the entire configuration object.

```typescript
@Injectable()
export class AppService {
  private config = inject(ConfigService)

  getFullConfig() {
    const fullConfig = this.config.getConfig() // AppConfig
    return fullConfig
  }
}
```

## Type-Safe Configuration

### Defining Configuration Types

```typescript
interface AppConfig {
  port: number
  environment: 'development' | 'production' | 'test'
  database: {
    host: string
    port: number
    name: string
    ssl: boolean
  }
  jwt: {
    secret: string
    expiresIn: string
    issuer: string
  }
  api: {
    timeout: number
    retries: number
  }
}

// Create typed ConfigService
const config = new ConfigService<AppConfig>({
  port: 3000,
  environment: 'development',
  database: {
    host: 'localhost',
    port: 5432,
    name: 'myapp',
    ssl: false,
  },
  jwt: {
    secret: 'secret',
    expiresIn: '1h',
    issuer: 'myapp',
  },
  api: {
    timeout: 5000,
    retries: 3,
  },
})
```

### Type Inference

TypeScript automatically infers types from your configuration:

```typescript
@Injectable()
export class DatabaseService {
  private config = inject(ConfigService<AppConfig>)

  connect() {
    // TypeScript knows these are the correct types
    const host = this.config.getOrThrow('database.host') // string
    const port = this.config.getOrDefault('database.port', 5432) // number
    const ssl = this.config.get('database.ssl') // boolean | null
  }
}
```

## Environment Variable Integration

### Loading from Environment Variables

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

// Load configuration from environment variables
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

### Using in Application Bootstrap

```typescript
import { NaviosFactory } from '@navios/core'
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { Container } from '@navios/di'

import { AppModule } from './app.module'

async function bootstrap() {
  // Create configuration
  interface AppConfig {
    port: number
    database: { host: string; port: number; name: string }
  }

  const config = new ConfigService<AppConfig>({
    port: parseInt(process.env.PORT || '3000', 10),
    database: {
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5432', 10),
      name: process.env.DATABASE_NAME || 'myapp',
    },
  })

  // Register ConfigService in container
  const container = new Container()
  container.bind(ConfigService).toValue(config)

  // Create application with custom container
  const app = await NaviosFactory.create(AppModule, {
    adapter: defineFastifyEnvironment(),
    container,
  })

  const port = config.getOrThrow('port')
  await app.listen({ port })
}
```

## Using in Services

### Database Service Example

```typescript
import { inject, Injectable } from '@navios/di'
import { ConfigService } from '@navios/core'

interface DatabaseConfig {
  host: string
  port: number
  name: string
  user: string
  password: string
}

@Injectable()
export class DatabaseService {
  private config = inject(ConfigService<{ database: DatabaseConfig }>)

  async connect() {
    const dbConfig = this.config.getOrThrow('database')
    const connectionString = `postgresql://${dbConfig.user}:${dbConfig.password}@${dbConfig.host}:${dbConfig.port}/${dbConfig.name}`

    // Connect to database
    console.log(`Connecting to ${dbConfig.host}:${dbConfig.port}`)
  }
}
```

### JWT Service Example

```typescript
import { inject, Injectable } from '@navios/di'
import { ConfigService } from '@navios/core'

interface JwtConfig {
  secret: string
  expiresIn: string
  issuer: string
}

@Injectable()
export class JwtService {
  private config = inject(ConfigService<{ jwt: JwtConfig }>)

  getSecret(): string {
    return this.config.getOrThrow('jwt.secret', 'JWT secret is required')
  }

  getExpiresIn(): string {
    return this.config.getOrDefault('jwt.expiresIn', '1h')
  }

  getIssuer(): string {
    return this.config.getOrDefault('jwt.issuer', 'myapp')
  }
}
```

## Using in Controllers

```typescript
import { Controller, Endpoint, EndpointParams } from '@navios/core'
import { inject } from '@navios/di'
import { ConfigService } from '@navios/core'

import { getHealth } from '../api/health.endpoints'

@Controller()
export class HealthController {
  private config = inject(ConfigService)

  @Endpoint(getHealth)
  async getHealth(params: EndpointParams<typeof getHealth>) {
    return {
      status: 'ok',
      environment: this.config.get('environment') || 'development',
      version: this.config.getOrDefault('version', '1.0.0'),
      port: this.config.get('port'),
    }
  }
}
```

## Nested Path Access

Access nested configuration values using dot notation:

```typescript
interface AppConfig {
  database: {
    connection: {
      host: string
      port: number
      pool: {
        min: number
        max: number
      }
    }
  }
}

@Injectable()
export class DatabaseService {
  private config = inject(ConfigService<AppConfig>)

  setup() {
    // Access deeply nested values
    const host = this.config.getOrThrow('database.connection.host')
    const port = this.config.getOrDefault('database.connection.port', 5432)
    const minPool = this.config.getOrDefault('database.connection.pool.min', 2)
    const maxPool = this.config.getOrDefault('database.connection.pool.max', 10)
  }
}
```

## Error Handling

### Required Configuration

Use `getOrThrow` to ensure required configuration exists:

```typescript
@Injectable()
export class PaymentService {
  private config = inject(ConfigService)

  constructor() {
    // Throws if STRIPE_KEY is not configured
    const stripeKey = this.config.getOrThrow(
      'stripe.apiKey',
      'Stripe API key is required',
    )
  }
}
```

### Optional Configuration

Use `getOrDefault` for optional configuration:

```typescript
@Injectable()
export class EmailService {
  private config = inject(ConfigService)

  sendEmail(to: string, subject: string) {
    // Use default if not configured
    const from = this.config.getOrDefault('email.from', 'noreply@example.com')
    const replyTo = this.config.getOrDefault('email.replyTo', from)

    // Send email
  }
}
```

## Environment-Specific Configuration

### Loading Different Configurations

```typescript
const environment = process.env.NODE_ENV || 'development'

const configs = {
  development: {
    debug: true,
    database: { host: 'localhost', port: 5432, name: 'dev' },
    logLevel: 'debug',
  },
  production: {
    debug: false,
    database: {
      host: process.env.DB_HOST!,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      name: process.env.DB_NAME!,
    },
    logLevel: 'error',
  },
  test: {
    debug: true,
    database: { host: 'localhost', port: 5432, name: 'test' },
    logLevel: 'silent',
  },
}

const config = new ConfigService(configs[environment])
```

## Validation

You can validate configuration at startup:

```typescript
interface AppConfig {
  port: number
  database: {
    host: string
    port: number
  }
}

function validateConfig(config: AppConfig): void {
  if (config.port < 1 || config.port > 65535) {
    throw new Error('Port must be between 1 and 65535')
  }

  if (!config.database.host) {
    throw new Error('Database host is required')
  }

  if (config.database.port < 1 || config.database.port > 65535) {
    throw new Error('Database port must be between 1 and 65535')
  }
}

const config = new ConfigService<AppConfig>({
  port: parseInt(process.env.PORT || '3000', 10),
  database: {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  },
})

validateConfig(config.getConfig())
```

## Best Practices

### 1. Define Configuration Types

Always define TypeScript interfaces for your configuration:

```typescript
// ✅ Good - Type-safe configuration
interface AppConfig {
  port: number
  database: { host: string; port: number }
}

const config = new ConfigService<AppConfig>({ /* ... */ })

// ❌ Avoid - No type safety
const config = new ConfigService({ port: 3000 })
```

### 2. Use getOrThrow for Required Values

Use `getOrThrow` for configuration that must exist:

```typescript
// ✅ Good - Fails fast if missing
const secret = config.getOrThrow('jwt.secret', 'JWT secret is required')

// ❌ Avoid - Silent failures
const secret = config.get('jwt.secret') || 'default'
```

### 3. Use getOrDefault for Optional Values

Use `getOrDefault` for optional configuration with sensible defaults:

```typescript
// ✅ Good - Clear default value
const timeout = config.getOrDefault('api.timeout', 5000)

// ❌ Avoid - Unclear if null or default
const timeout = config.get('api.timeout') || 5000
```

### 4. Centralize Configuration

Create a single configuration module:

```typescript
// config/app.config.ts
import { ConfigService } from '@navios/core'

export interface AppConfig {
  port: number
  database: { host: string; port: number; name: string }
  jwt: { secret: string; expiresIn: string }
}

export function createAppConfig(): ConfigService<AppConfig> {
  return new ConfigService<AppConfig>({
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
}
```

## Related Documentation

- [Configuration Guide](/docs/server/guides/configuration) - General configuration patterns
- [Services & DI](/docs/server/guides/services) - Using services with dependency injection
- [DI: Injection Tokens](/docs/di/guides/injection-tokens) - Advanced dependency injection patterns

