# Factory Decorator

The `@Factory` decorator is used to create factory classes that produce instances rather than being instances themselves. Factories are useful for complex object creation, configuration-based instantiation, and scenarios where you need to create multiple instances with different parameters.

## Basic Usage

### Simple Factory

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

### Factory with Configuration

```typescript
import type { FactoryContext } from '@navios/di'

import { Factory, InjectionToken } from '@navios/di'

import { z } from 'zod'

const configSchema = z.object({
  host: z.string(),
  port: z.number(),
  database: z.string(),
})

const DB_CONFIG_TOKEN = InjectionToken.create<DatabaseConfig, typeof configSchema>(
  'DB_CONFIG',
  configSchema,
)

@Factory({ token: DB_CONFIG_TOKEN })
class DatabaseConnectionFactory {
  create(ctx: FactoryContext, config: z.infer<typeof configSchema>) {
    return {
      host: config.host,
      port: config.port,
      database: config.database,
      connected: false,
      connect: () => {
        console.log(`Connecting to ${config.host}:${config.port}/${config.database}`)
        return Promise.resolve()
      },
    }
  }
}

// Usage
const connection = await container.get(DB_CONFIG_TOKEN, {
  host: 'localhost',
  port: 5432,
  database: 'myapp',
})
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

## Advanced Patterns

### Factory with Dependencies

```typescript
import { Factory, inject, Injectable } from '@navios/di'

@Injectable()
class LoggerService {
  log(message: string) {
    console.log(`[LOG] ${message}`)
  }
}

@Injectable()
class ConfigService {
  getDatabaseUrl() {
    return 'postgresql://localhost:5432/myapp'
  }
}

@Factory()
class DatabaseConnectionFactory {
  private readonly logger = inject(LoggerService)
  private readonly config = inject(ConfigService)

  create() {
    const url = this.config.getDatabaseUrl()
    this.logger.log(`Creating database connection to ${url}`)

    return {
      url,
      connected: false,
      connect: async () => {
        this.logger.log('Connecting to database...')
        // Simulate connection
        await new Promise((resolve) => setTimeout(resolve, 100))
        this.logger.log('Database connected successfully')
        return { connected: true }
      },
    }
  }
}
```

### Factory with Multiple Configurations

```typescript
import { Factory, InjectionToken } from '@navios/di'

import { z } from 'zod'

const emailConfigSchema = z.object({
  provider: z.enum(['smtp', 'sendgrid', 'ses']),
  apiKey: z.string(),
  fromEmail: z.string().email(),
})

const EMAIL_CONFIG_TOKEN = InjectionToken.create<EmailConfig, typeof emailConfigSchema>(
  'EMAIL_CONFIG',
  emailConfigSchema,
)

@Factory({ token: EMAIL_CONFIG_TOKEN })
class EmailServiceFactory {
  create(config: z.infer<typeof emailConfigSchema>) {
    switch (config.provider) {
      case 'smtp':
        return new SmtpEmailService(config)
      case 'sendgrid':
        return new SendGridEmailService(config)
      case 'ses':
        return new SesEmailService(config)
      default:
        throw new Error(`Unsupported email provider: ${config.provider}`)
    }
  }
}

class SmtpEmailService {
  constructor(private config: EmailConfig) {}

  async sendEmail(to: string, subject: string) {
    return `SMTP email sent to ${to}: ${subject}`
  }
}

class SendGridEmailService {
  constructor(private config: EmailConfig) {}

  async sendEmail(to: string, subject: string) {
    return `SendGrid email sent to ${to}: ${subject}`
  }
}

class SesEmailService {
  constructor(private config: EmailConfig) {}

  async sendEmail(to: string, subject: string) {
    return `SES email sent to ${to}: ${subject}`
  }
}
```

### Factory with Transient Scope

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

## Factory Context

Factories have access to a `FactoryContext` that provides additional functionality:

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
    // Access the service locator
    const locator = ctx.locator

    // Inject dependencies within the factory
    const dbService = await locator.getInstance(DatabaseService)

    return {
      async getUser(id: string) {
        const db = await dbService
        return db.query(`SELECT * FROM users WHERE id = ${id}`)
      },

      async createUser(userData: any) {
        const db = await dbService
        return db.query(`INSERT INTO users VALUES (${JSON.stringify(userData)})`)
      },
    }
  }
}
```

## Real-World Examples

### HTTP Client Factory

```typescript
import type { FactoryContext } from '@navios/di'

import { Factory, InjectionToken } from '@navios/di'

import { z } from 'zod'

const httpConfigSchema = z.object({
  baseUrl: z.string().url(),
  timeout: z.number().default(5000),
  retries: z.number().default(3),
  headers: z.record(z.string()).optional(),
})

const HTTP_CONFIG_TOKEN = InjectionToken.create<HttpClientFactory, typeof httpConfigSchema>(
  'HTTP_CONFIG',
  httpConfigSchema,
)

@Factory({ token: HTTP_CONFIG_TOKEN })
class HttpClientFactory {
  create(ctx: FactoryContext, config: z.infer<typeof httpConfigSchema>) {
    return {
      baseUrl: config.baseUrl,
      timeout: config.timeout,
      retries: config.retries,
      headers: config.headers || {},

      async get(path: string) {
        console.log(`GET ${config.baseUrl}${path}`)
        return { data: `Response from ${path}` }
      },

      async post(path: string, data: any) {
        console.log(`POST ${config.baseUrl}${path}`, data)
        return { data: `Created at ${path}` }
      },
    }
  }
}

// Usage
const apiClient = await container.get(HTTP_CONFIG_TOKEN, {
  baseUrl: 'https://api.example.com',
  timeout: 10000,
  retries: 5,
  headers: {
    Authorization: 'Bearer token123',
    'Content-Type': 'application/json',
  },
})
```

### Cache Factory

```typescript
import { Factory, InjectableScope } from '@navios/di'

@Factory({ scope: InjectableScope.Transient })
class CacheFactory {
  create() {
    const cache = new Map()

    return {
      set(key: string, value: any, ttl?: number) {
        cache.set(key, {
          value,
          expires: ttl ? Date.now() + ttl : null,
        })
      },

      get(key: string) {
        const item = cache.get(key)
        if (!item) return null

        if (item.expires && Date.now() > item.expires) {
          cache.delete(key)
          return null
        }

        return item.value
      },

      delete(key: string) {
        return cache.delete(key)
      },

      clear() {
        cache.clear()
      },

      size() {
        return cache.size
      },
    }
  }
}
```

### Database Connection Pool Factory

```typescript
import { Factory, inject, Injectable } from '@navios/di'

@Injectable()
class DatabaseConfigService {
  getConfig() {
    return {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'myapp',
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
      maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '10'),
    }
  }
}

@Factory()
class DatabasePoolFactory {
  private readonly config = inject(DatabaseConfigService)

  create() {
    const config = this.config.getConfig()

    return {
      config,
      connections: new Map(),
      connectionCount: 0,

      async getConnection() {
        if (this.connectionCount >= config.maxConnections) {
          throw new Error('Connection pool exhausted')
        }

        const connectionId = `conn_${Date.now()}_${Math.random()}`
        const connection = {
          id: connectionId,
          host: config.host,
          port: config.port,
          database: config.database,
          connected: true,
          createdAt: new Date(),
        }

        this.connections.set(connectionId, connection)
        this.connectionCount++

        return connection
      },

      async releaseConnection(connectionId: string) {
        if (this.connections.has(connectionId)) {
          this.connections.delete(connectionId)
          this.connectionCount--
        }
      },

      getStats() {
        return {
          totalConnections: this.connectionCount,
          maxConnections: config.maxConnections,
          availableConnections: config.maxConnections - this.connectionCount,
        }
      },
    }
  }
}
```

## Best Practices

### 1. Use Factories for Complex Object Creation

```typescript
// ✅ Good: Use factory for complex configuration
@Factory()
class EmailServiceFactory {
  create() {
    return {
      sendEmail: async (to: string, subject: string, body: string) => {
        // Complex email sending logic
        const template = await this.loadTemplate(subject)
        const html = await this.renderTemplate(template, body)
        return await this.sendViaProvider(to, html)
      },
    }
  }
}
```

### 2. Use Transient Scope for Stateful Objects

```typescript
// ✅ Good: Transient factory for stateful objects
@Factory({ scope: InjectableScope.Transient })
class UserSessionFactory {
  create() {
    return {
      userId: null,
      sessionId: Math.random().toString(36),
      loginTime: new Date(),

      login(userId: string) {
        this.userId = userId
        this.loginTime = new Date()
      },

      logout() {
        this.userId = null
      },
    }
  }
}
```

### 3. Use Injection Tokens for Interface-Based Factories

```typescript
// ✅ Good: Interface-based factory
interface PaymentProcessor {
  processPayment(amount: number): Promise<string>
}

const PAYMENT_PROCESSOR_TOKEN = InjectionToken.create<PaymentProcessor>('PaymentProcessor')

@Factory({ token: PAYMENT_PROCESSOR_TOKEN })
class StripePaymentProcessorFactory {
  create(): PaymentProcessor {
    return {
      async processPayment(amount: number) {
        return `Processed $${amount} via Stripe`
      },
    }
  }
}
```

### 4. Handle Errors in Factory Creation

```typescript
// ✅ Good: Error handling in factory
@Factory()
class DatabaseConnectionFactory {
  create() {
    try {
      return {
        connect: async () => {
          // Connection logic
          return { connected: true }
        },
      }
    } catch (error) {
      throw new Error(`Failed to create database connection: ${error.message}`)
    }
  }
}
```

## API Reference

### Factory Options

```typescript
interface FactoryOptions {
  scope?: InjectableScope
  token?: InjectionToken<any, any>
  registry?: Registry
}
```

### Factory Context

```typescript
interface FactoryContext {
  inject: typeof asyncInject // Inject dependencies asynchronously
  locator: ServiceLocator // Access to the service locator
  addDestroyListener: (listener: () => void | Promise<void>) => void // Register cleanup callback
}
```

### Factory Method Signature

```typescript
interface Factorable<T> {
  create(): T
}

interface FactorableWithArgs<T, S> {
  create(ctx: FactoryContext, args: z.input<S>): T
}
```
