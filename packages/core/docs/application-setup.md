# Application Setup and Configuration

This guide covers how to set up and configure a Navios application, including application creation, module loading, and server configuration.

## Creating a Navios Application

### Basic Application Setup

```typescript
import { FastifyAdapter } from '@navios/adapter-fastify'
import { NaviosFactory } from '@navios/core'

import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NaviosFactory.create(AppModule, {
    adapter: new FastifyAdapter(),
  })

  await app.listen(3000)
  console.log('Application is running on http://localhost:3000')
}

bootstrap()
```

### Application with Multiple Adapters

```typescript
import { BunAdapter } from '@navios/adapter-bun'
import { FastifyAdapter } from '@navios/adapter-fastify'
import { NaviosFactory } from '@navios/core'

async function bootstrap() {
  const adapters =
    process.env.NODE_ENV === 'production'
      ? [new FastifyAdapter()]
      : [new BunAdapter(), new FastifyAdapter()]

  const app = await NaviosFactory.create(AppModule, {
    adapter: adapters,
  })

  await app.listen(3000)
}

bootstrap()
```

## Application Factory

The `NaviosFactory` provides methods to create and configure applications:

### `NaviosFactory.create()`

```typescript
import { NaviosFactory } from '@navios/core'

const app = await NaviosFactory.create(AppModule, {
  adapter: new FastifyAdapter(),
  logger: ['error', 'warn', 'log'], // Log levels
  // Additional options
})
```

### Factory Options

```typescript
interface NaviosApplicationOptions {
  adapter: NaviosEnvironmentOptions | NaviosEnvironmentOptions[]
  logger?: LoggerService | LogLevel[] | false
}
```

## Application Module

The root application module serves as the entry point:

```typescript
import { Module } from '@navios/core'

import { AuthModule } from './auth/auth.module'
import { DatabaseModule } from './database/database.module'
import { UserModule } from './user/user.module'

@Module({
  imports: [DatabaseModule, AuthModule, UserModule],
})
export class AppModule {}
```

## Application Lifecycle

### Application Initialization

```typescript
async function bootstrap() {
  // 1. Create application
  const app = await NaviosFactory.create(AppModule, {
    adapter: new FastifyAdapter(),
  })

  // 2. Configure middleware, CORS, etc.
  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  })

  app.enableMultipart({
    limits: {
      fileSize: 10_000_000, // 10MB
    },
  })

  // 3. Start listening
  await app.listen(3000)
}
```

### Graceful Shutdown

```typescript
async function bootstrap() {
  const app = await NaviosFactory.create(AppModule, {
    adapter: new FastifyAdapter(),
  })

  await app.listen(3000)

  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...')
    await app.close()
    process.exit(0)
  })

  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully...')
    await app.close()
    process.exit(0)
  })
}
```

## Environment Configuration

### Environment Variables

```typescript
// config/environment.ts
export const environment = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  database: {
    url: process.env.DATABASE_URL || 'postgresql://localhost:5432/navios',
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '10', 10),
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'super-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
  },
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
  },
}
```

### Configuration Service

```typescript
import { Injectable } from '@navios/core'

@Injectable()
export class ConfigService {
  private config = new Map()

  constructor() {
    this.loadEnvironmentVariables()
  }

  get<T>(key: string): T {
    return this.config.get(key)
  }

  private loadEnvironmentVariables() {
    this.config.set('PORT', parseInt(process.env.PORT || '3000', 10))
    this.config.set('NODE_ENV', process.env.NODE_ENV || 'development')
    this.config.set('DATABASE_URL', process.env.DATABASE_URL)
    this.config.set('JWT_SECRET', process.env.JWT_SECRET)
    // ... more configuration
  }
}

// Usage in bootstrap
async function bootstrap() {
  const app = await NaviosFactory.create(AppModule, {
    adapter: new FastifyAdapter(),
  })

  const configService = app.getContainer().get(ConfigService)
  const port = configService.get<number>('PORT')

  await app.listen(port)
}
```

## CORS Configuration

Enable Cross-Origin Resource Sharing:

```typescript
async function bootstrap() {
  const app = await NaviosFactory.create(AppModule, {
    adapter: new FastifyAdapter(),
  })

  // Basic CORS
  app.enableCors()

  // Advanced CORS configuration
  app.enableCors({
    origin: ['http://localhost:3000', 'https://yourdomain.com'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })

  await app.listen(3000)
}
```

## Multipart/File Upload Configuration

Enable file upload support:

```typescript
async function bootstrap() {
  const app = await NaviosFactory.create(AppModule, {
    adapter: new FastifyAdapter(),
  })

  app.enableMultipart({
    limits: {
      fieldNameSize: 100, // Max field name size in bytes
      fieldSize: 100, // Max field value size in bytes
      fields: 10, // Max number of non-file fields
      fileSize: 10_000_000, // Max file size in bytes (10MB)
      files: 5, // Max number of file fields
      headerPairs: 2000, // Max number of header key=>value pairs
    },
  })

  await app.listen(3000)
}
```

## Logging Configuration

### Custom Logger

```typescript
import { LoggerService, LogLevel } from '@navios/core'

class CustomLogger implements LoggerService {
  log(message: string, context?: string) {
    console.log(`[${context}] ${message}`)
  }

  error(message: string, trace?: string, context?: string) {
    console.error(`[${context}] ERROR: ${message}`, trace)
  }

  warn(message: string, context?: string) {
    console.warn(`[${context}] WARN: ${message}`)
  }

  debug(message: string, context?: string) {
    if (process.env.DEBUG) {
      console.debug(`[${context}] DEBUG: ${message}`)
    }
  }

  verbose(message: string, context?: string) {
    if (process.env.VERBOSE) {
      console.log(`[${context}] VERBOSE: ${message}`)
    }
  }
}

// Use custom logger
const app = await NaviosFactory.create(AppModule, {
  adapter: new FastifyAdapter(),
  logger: new CustomLogger(),
})
```

### Log Levels

```typescript
const app = await NaviosFactory.create(AppModule, {
  adapter: new FastifyAdapter(),
  logger: ['error', 'warn', 'log'], // Only these levels will be logged
})

// Or disable logging
const app = await NaviosFactory.create(AppModule, {
  adapter: new FastifyAdapter(),
  logger: false,
})
```

## Database Integration

### Database Module

```typescript
import { Injectable, Module } from '@navios/core'

import { PrismaClient } from '@prisma/client'

@Injectable()
export class DatabaseService extends PrismaClient {
  constructor() {
    super({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    })
  }

  async onModuleInit() {
    await this.$connect()
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }
}

@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
```

## Health Checks

Add health check endpoints using `@navios/builder`:

```typescript
// api/health.ts
import { builder } from '@navios/builder'

import { z } from 'zod'

export const api = builder()

export const healthEndpoint = api.declareEndpoint({
  method: 'GET',
  url: '/health',
  responseSchema: z.object({
    status: z.string(),
    timestamp: z.string(),
    uptime: z.number(),
  }),
})

export const readinessEndpoint = api.declareEndpoint({
  method: 'GET',
  url: '/health/ready',
  responseSchema: z.object({
    ready: z.boolean(),
    checks: z.record(z.string(), z.boolean()),
  }),
})
```

```typescript
import type { EndpointParams } from '@navios/core'

import { Controller, Endpoint } from '@navios/core'

import { healthEndpoint, readinessEndpoint } from '../api/health.js'

// controllers/health.controller.ts

@Controller()
export class HealthController {
  @Endpoint(healthEndpoint)
  async getHealth(params: EndpointParams<typeof healthEndpoint>) {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    }
  }

  @Endpoint(readinessEndpoint)
  async getReadiness(params: EndpointParams<typeof readinessEndpoint>) {
    // Check database connectivity, external services, etc.
    try {
      await this.databaseService.isConnected()
      return { status: 'ready' }
    } catch (error) {
      throw new InternalServerErrorException('Service not ready')
    }
  }
}
```

## Production Configuration

### Production Bootstrap

```typescript
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { NaviosFactory } from '@navios/core'

import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NaviosFactory.create(AppModule, {
    adapter: defineFastifyEnvironment({
      logger: process.env.NODE_ENV === 'production',
      trustProxy: true,
    }),
    logger:
      process.env.NODE_ENV === 'production'
        ? ['error', 'warn', 'log']
        : ['error', 'warn', 'log', 'debug', 'verbose'],
  })

  // Production middleware
  if (process.env.NODE_ENV === 'production') {
    app.enableCors({
      origin: process.env.ALLOWED_ORIGINS?.split(','),
      credentials: true,
    })
  } else {
    app.enableCors() // Allow all origins in development
  }

  const port = process.env.PORT || 3000
  await app.listen({
    port: parseInt(port, 10),
    host: '0.0.0.0',
  })

  console.log(`🚀 Application is running on port ${port}`)
}

bootstrap().catch((error) => {
  console.error('Failed to start application:', error)
  process.exit(1)
})
```

### Docker Configuration

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000

USER node

CMD ["node", "dist/main.js"]
```

### Environment Variables for Production

```bash
# .env.production
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://user:password@db:5432/navios_prod
LOG_LEVEL=error,warn,log
```

## Testing Configuration

### Test Application Setup

```typescript
import { Test } from '@navios/testing'

import { AppModule } from '../src/app.module'

describe('Application', () => {
  let app: any

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDatabaseService)
      .compile()

    app = moduleRef.createNaviosApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('should be defined', () => {
    expect(app).toBeDefined()
  })
})
```
