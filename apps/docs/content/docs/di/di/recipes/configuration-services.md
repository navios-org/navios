---
sidebar_position: 1
---

# Configuration Services

A common pattern in applications is to manage configuration through dependency injection. This recipe shows how to create type-safe configuration services using injection tokens and Zod schemas.

## Basic Configuration Service

```typescript
import { Injectable, InjectionToken } from '@navios/di'
import { z } from 'zod'

const configSchema = z.object({
  apiUrl: z.string().url(),
  timeout: z.number().min(1000),
  retries: z.number().min(0).max(10),
})

const CONFIG_TOKEN = InjectionToken.create<ConfigService, typeof configSchema>(
  'APP_CONFIG',
  configSchema,
)

@Injectable({ token: CONFIG_TOKEN })
class ConfigService {
  constructor(private config: z.infer<typeof configSchema>) {}

  getApiUrl() {
    return this.config.apiUrl
  }

  getTimeout() {
    return this.config.timeout
  }

  getRetries() {
    return this.config.retries
  }
}

// Usage
const container = new Container()
const config = await container.get(CONFIG_TOKEN, {
  apiUrl: 'https://api.example.com',
  timeout: 5000,
  retries: 3,
})
```

## Environment-Specific Configuration

Use bound tokens for environment-specific configurations:

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

// Usage
const config = await container.get(
  process.env.NODE_ENV === 'production' ? PRODUCTION_CONFIG : DEVELOPMENT_CONFIG
)
```

## Dynamic Configuration with Factory

Use factory tokens for dynamic configuration resolution:

```typescript
const DYNAMIC_CONFIG = InjectionToken.factory(CONFIG_TOKEN, async (ctx) => {
  const env = process.env.NODE_ENV || 'development'

  return {
    apiUrl:
      env === 'production'
        ? 'https://api.prod.com'
        : 'https://api.dev.com',
    timeout: env === 'production' ? 10000 : 5000,
    retries: env === 'production' ? 5 : 3,
  }
})

// Usage
const config = await container.get(DYNAMIC_CONFIG)
```

## Multiple Configuration Services

Organize configurations by domain:

```typescript
const databaseConfigSchema = z.object({
  host: z.string(),
  port: z.number(),
  database: z.string(),
})

const DATABASE_CONFIG_TOKEN = InjectionToken.create<
  DatabaseConfig,
  typeof databaseConfigSchema
>('DATABASE_CONFIG', databaseConfigSchema)

const emailConfigSchema = z.object({
  smtpHost: z.string(),
  smtpPort: z.number(),
  fromEmail: z.string().email(),
})

const EMAIL_CONFIG_TOKEN = InjectionToken.create<
  EmailConfig,
  typeof emailConfigSchema
>('EMAIL_CONFIG', emailConfigSchema)

@Injectable({ token: DATABASE_CONFIG_TOKEN })
class DatabaseConfig {
  constructor(private config: z.infer<typeof databaseConfigSchema>) {}

  getConnectionString() {
    return `postgresql://${this.config.host}:${this.config.port}/${this.config.database}`
  }
}

@Injectable({ token: EMAIL_CONFIG_TOKEN })
class EmailConfig {
  constructor(private config: z.infer<typeof emailConfigSchema>) {}

  getSmtpConfig() {
    return {
      host: this.config.smtpHost,
      port: this.config.smtpPort,
      from: this.config.fromEmail,
    }
  }
}
```

## Using Configuration in Services

```typescript
@Injectable()
class ApiClient {
  private readonly config = inject(CONFIG_TOKEN, {
    apiUrl: 'https://api.example.com',
    timeout: 5000,
    retries: 3,
  })

  async request(path: string) {
    const url = `${this.config.getApiUrl()}${path}`
    // Use config for API requests
    return fetch(url, { timeout: this.config.getTimeout() })
  }
}
```

