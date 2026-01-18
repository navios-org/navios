# @navios/throttle Specification

## Overview

`@navios/throttle` is a rate limiting library for the Navios framework. It provides decorator-based throttling with multiple strategies and storage backends for protecting APIs from abuse.

**Package:** `@navios/throttle`
**Version:** 0.1.0
**License:** MIT
**Dependencies:** None (adapters are optional)
**Peer Dependencies:** `@navios/core`, `@navios/di`
**Optional Dependencies:** `ioredis` (^5.x)

---

## Core Concepts

### Architecture Overview

```
ThrottleModule
├── ThrottlerGuard (global rate limiting)
│   ├── Checks rate limits before request processing
│   ├── Returns 429 Too Many Requests when exceeded
│   └── Adds rate limit headers to responses
│
├── Storage Backends
│   ├── MemoryStorage (built-in, default)
│   ├── RedisStorage (distributed)
│   └── Custom storage via ThrottleStorage interface
│
├── Strategies
│   ├── Fixed Window
│   ├── Sliding Window
│   └── Token Bucket
│
└── Decorators
    ├── @Throttle() - Configure rate limits
    ├── @SkipThrottle() - Bypass rate limiting
    └── @ThrottleKey() - Custom key extraction
```

### Key Principles

- **Decorator-Based** - Clean API using TypeScript decorators
- **Guard Integration** - Works with Navios guard system
- **Multiple Strategies** - Fixed window, sliding window, token bucket
- **Distributed Support** - Redis storage for multi-instance deployments
- **Flexible Key Extraction** - IP, user ID, API key, or custom

---

## Setup

### Basic Configuration

```typescript
import { Module } from '@navios/core'
import { ThrottleModule } from '@navios/throttle'

@Module({
  imports: [
    ThrottleModule.register({
      throttlers: [
        {
          name: 'default',
          ttl: 60_000,    // Time window: 60 seconds
          limit: 100,     // Max requests per window
        },
      ],
    }),
  ],
})
class AppModule {}
```

### Multiple Rate Limits

```typescript
import { Module } from '@navios/core'
import { ThrottleModule } from '@navios/throttle'

@Module({
  imports: [
    ThrottleModule.register({
      throttlers: [
        // Short-term: 10 requests per second
        {
          name: 'short',
          ttl: 1_000,
          limit: 10,
        },
        // Medium-term: 100 requests per minute
        {
          name: 'medium',
          ttl: 60_000,
          limit: 100,
        },
        // Long-term: 1000 requests per hour
        {
          name: 'long',
          ttl: 3_600_000,
          limit: 1000,
        },
      ],
    }),
  ],
})
class AppModule {}
```

### Redis Storage (Distributed)

```typescript
import { Module } from '@navios/core'
import { ThrottleModule, RedisThrottleStorage } from '@navios/throttle'

@Module({
  imports: [
    ThrottleModule.register({
      storage: new RedisThrottleStorage({
        host: 'localhost',
        port: 6379,
        keyPrefix: 'throttle:',
      }),
      throttlers: [
        { name: 'default', ttl: 60_000, limit: 100 },
      ],
    }),
  ],
})
class AppModule {}
```

### Async Configuration

```typescript
import { Module } from '@navios/core'
import { ThrottleModule, RedisThrottleStorage } from '@navios/throttle'
import { inject } from '@navios/di'

@Module({
  imports: [
    ThrottleModule.registerAsync({
      useFactory: async () => {
        const config = await inject(ConfigService)
        return {
          storage: new RedisThrottleStorage({
            host: config.redis.host,
            port: config.redis.port,
          }),
          throttlers: [
            {
              name: 'default',
              ttl: config.rateLimit.ttl,
              limit: config.rateLimit.limit,
            },
          ],
        }
      },
    }),
  ],
})
class AppModule {}
```

---

## Decorators

### @Throttle(options)

Configures rate limiting for a controller or endpoint.

```typescript
import { Controller, Endpoint } from '@navios/core'
import { Throttle } from '@navios/throttle'

// Controller-level throttling
@Controller()
@Throttle({ limit: 50, ttl: 60_000 })
class ApiController {
  @Endpoint(listItems)
  async list() { }

  // Endpoint-level override
  @Endpoint(createItem)
  @Throttle({ limit: 10, ttl: 60_000 })
  async create() { }

  // Multiple throttlers
  @Endpoint(heavyOperation)
  @Throttle([
    { name: 'short', limit: 2, ttl: 1_000 },
    { name: 'long', limit: 20, ttl: 60_000 },
  ])
  async heavy() { }
}
```

**Options:**

| Property   | Type       | Description                         |
| ---------- | ---------- | ----------------------------------- |
| `name`     | `string`   | Throttler name (default: 'default') |
| `limit`    | `number`   | Max requests in time window         |
| `ttl`      | `number`   | Time window in milliseconds         |
| `strategy` | `Strategy` | Rate limiting strategy              |

### @SkipThrottle(throttlerName?)

Bypasses rate limiting for specific endpoints or controllers.

```typescript
import { Controller, Endpoint } from '@navios/core'
import { SkipThrottle, Throttle } from '@navios/throttle'

@Controller()
@Throttle({ limit: 100, ttl: 60_000 })
class ApiController {
  // This endpoint is not rate limited
  @Endpoint(healthCheck)
  @SkipThrottle()
  async health() {
    return { status: 'ok' }
  }

  // Skip only specific throttler
  @Endpoint(internalEndpoint)
  @SkipThrottle('long')
  async internal() { }
}

// Skip all throttling for entire controller
@Controller()
@SkipThrottle()
class InternalController {
  @Endpoint(metrics)
  async metrics() { }
}
```

### @ThrottleKey(extractor)

Custom key extraction for rate limiting.

```typescript
import { Controller, Endpoint } from '@navios/core'
import { Throttle, ThrottleKey } from '@navios/throttle'

@Controller()
class ApiController {
  // Rate limit by API key instead of IP
  @Endpoint(apiEndpoint)
  @Throttle({ limit: 1000, ttl: 60_000 })
  @ThrottleKey((context) => context.getRequest().headers['x-api-key'])
  async byApiKey() { }

  // Rate limit by user ID
  @Endpoint(userEndpoint)
  @Throttle({ limit: 100, ttl: 60_000 })
  @ThrottleKey((context) => context.getRequest().user?.id)
  async byUser() { }

  // Composite key
  @Endpoint(tenantEndpoint)
  @Throttle({ limit: 500, ttl: 60_000 })
  @ThrottleKey((context) => {
    const req = context.getRequest()
    return `${req.user?.tenantId}:${req.user?.id}`
  })
  async byTenantAndUser() { }
}
```

---

## Rate Limiting Strategies

### Fixed Window (Default)

Simple counter that resets after the time window.

```typescript
ThrottleModule.register({
  throttlers: [
    {
      name: 'default',
      strategy: 'fixed-window',
      ttl: 60_000,
      limit: 100,
    },
  ],
})
```

**Behavior:**
- Counter resets exactly at window boundary
- Simple and efficient
- Can allow burst at window boundaries

### Sliding Window

More accurate rate limiting using a sliding time window.

```typescript
ThrottleModule.register({
  throttlers: [
    {
      name: 'default',
      strategy: 'sliding-window',
      ttl: 60_000,
      limit: 100,
    },
  ],
})
```

**Behavior:**
- Smooths out burst traffic
- More memory usage than fixed window
- More accurate rate enforcement

### Token Bucket

Allows controlled bursting while maintaining average rate.

```typescript
ThrottleModule.register({
  throttlers: [
    {
      name: 'default',
      strategy: 'token-bucket',
      ttl: 60_000,        // Refill interval
      limit: 100,         // Bucket capacity
      refillRate: 10,     // Tokens added per interval
    },
  ],
})
```

**Behavior:**
- Allows short bursts up to bucket capacity
- Refills tokens at a steady rate
- Good for APIs with variable traffic patterns

---

## Storage Backends

### MemoryStorage (Default)

In-memory storage using LRU cache. Best for single-instance deployments.

```typescript
import { ThrottleModule, MemoryThrottleStorage } from '@navios/throttle'

ThrottleModule.register({
  storage: new MemoryThrottleStorage({
    max: 10_000, // Max tracked keys
  }),
  throttlers: [
    { name: 'default', ttl: 60_000, limit: 100 },
  ],
})
```

**Options:**

| Property | Type     | Default | Description           |
| -------- | -------- | ------- | --------------------- |
| `max`    | `number` | 10000   | Max keys to track     |

### RedisStorage

Redis-backed storage for distributed rate limiting.

```typescript
import { ThrottleModule, RedisThrottleStorage } from '@navios/throttle'

ThrottleModule.register({
  storage: new RedisThrottleStorage({
    host: 'localhost',
    port: 6379,
    password: 'secret',
    keyPrefix: 'rl:',

    // Or use existing ioredis instance
    client: existingRedisClient,
  }),
  throttlers: [
    { name: 'default', ttl: 60_000, limit: 100 },
  ],
})
```

**Options:**

| Property    | Type     | Description                |
| ----------- | -------- | -------------------------- |
| `host`      | `string` | Redis host                 |
| `port`      | `number` | Redis port                 |
| `password`  | `string` | Redis password             |
| `keyPrefix` | `string` | Prefix for rate limit keys |
| `client`    | `Redis`  | Existing ioredis client    |

### Custom Storage

Implement the `ThrottleStorage` interface for custom backends.

```typescript
import { ThrottleStorage, ThrottleRecord } from '@navios/throttle'

class CustomStorage implements ThrottleStorage {
  async increment(
    key: string,
    ttl: number,
    limit: number,
    strategy: string
  ): Promise<ThrottleRecord> {
    // Implementation
    return {
      totalHits: currentCount,
      timeToExpire: remainingTtl,
      isBlocked: currentCount > limit,
      timeToReset: resetTime,
    }
  }

  async reset(key: string): Promise<void> {
    // Clear rate limit for key
  }

  async get(key: string): Promise<ThrottleRecord | null> {
    // Get current record
  }
}
```

**ThrottleStorage Interface:**

```typescript
interface ThrottleStorage {
  increment(
    key: string,
    ttl: number,
    limit: number,
    strategy: string
  ): Promise<ThrottleRecord>

  reset(key: string): Promise<void>
  get(key: string): Promise<ThrottleRecord | null>

  // Lifecycle
  onModuleDestroy?(): Promise<void>
}

interface ThrottleRecord {
  totalHits: number
  timeToExpire: number
  isBlocked: boolean
  timeToReset: number
}
```

---

## Response Headers

The throttler automatically adds rate limit headers to responses:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640000000
Retry-After: 45  (only when rate limited)
```

### Customizing Headers

```typescript
ThrottleModule.register({
  throttlers: [
    { name: 'default', ttl: 60_000, limit: 100 },
  ],
  headers: {
    limit: 'X-Rate-Limit',
    remaining: 'X-Rate-Remaining',
    reset: 'X-Rate-Reset',
    retryAfter: 'Retry-After',
  },
  // Or disable headers
  skipHeaders: true,
})
```

---

## Error Handling

### Default Error Response

When rate limit is exceeded, a 429 response is returned:

```json
{
  "statusCode": 429,
  "message": "Too Many Requests",
  "error": "ThrottlerException"
}
```

### Custom Error Response

```typescript
import { ThrottleModule, ThrottlerException } from '@navios/throttle'

ThrottleModule.register({
  throttlers: [
    { name: 'default', ttl: 60_000, limit: 100 },
  ],
  errorMessage: 'Rate limit exceeded. Please try again later.',

  // Or use a factory
  errorFactory: (context, throttlerName, record) => {
    return new ThrottlerException({
      message: `Rate limit exceeded for ${throttlerName}`,
      retryAfter: record.timeToReset,
      limit: record.totalHits,
    })
  },
})
```

---

## ThrottlerService API

For programmatic rate limit control.

### Injection

```typescript
import { Injectable, inject } from '@navios/di'
import { ThrottlerService } from '@navios/throttle'

@Injectable()
class ApiService {
  private throttler = inject(ThrottlerService)
}
```

### check(key, throttlerName?)

Checks if a key is rate limited without incrementing.

```typescript
const record = await this.throttler.check('user:123', 'default')

if (record.isBlocked) {
  console.log(`Blocked. Retry after ${record.timeToReset}ms`)
}
```

### increment(key, throttlerName?)

Increments the counter and returns the current state.

```typescript
const record = await this.throttler.increment('user:123', 'default')

console.log(`${record.totalHits} requests used`)
```

### reset(key, throttlerName?)

Resets the rate limit for a key.

```typescript
// Reset specific throttler
await this.throttler.reset('user:123', 'default')

// Reset all throttlers for key
await this.throttler.resetAll('user:123')
```

### getRecord(key, throttlerName?)

Gets the current rate limit record.

```typescript
const record = await this.throttler.getRecord('user:123', 'default')

if (record) {
  console.log(`Remaining: ${record.limit - record.totalHits}`)
}
```

---

## Advanced Patterns

### IP-based with Proxy Support

```typescript
ThrottleModule.register({
  throttlers: [
    { name: 'default', ttl: 60_000, limit: 100 },
  ],
  // Trust X-Forwarded-For header
  getTracker: (context) => {
    const req = context.getRequest()
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
      ?? req.headers['x-real-ip']
      ?? req.ip
  },
})
```

### Different Limits by User Role

```typescript
import { Controller, Endpoint } from '@navios/core'
import { Throttle } from '@navios/throttle'

@Controller()
class ApiController {
  @Endpoint(apiCall)
  @Throttle({
    limit: (context) => {
      const user = context.getRequest().user
      if (user?.role === 'premium') return 1000
      if (user?.role === 'basic') return 100
      return 10 // anonymous
    },
    ttl: 60_000,
  })
  async call() { }
}
```

### Endpoint-Specific Throttling

```typescript
import { Module } from '@navios/core'
import { ThrottleModule } from '@navios/throttle'

@Module({
  imports: [
    ThrottleModule.register({
      throttlers: [
        // General API
        { name: 'api', ttl: 60_000, limit: 100 },
        // Authentication endpoints
        { name: 'auth', ttl: 60_000, limit: 5 },
        // File uploads
        { name: 'upload', ttl: 3_600_000, limit: 10 },
        // Search/expensive operations
        { name: 'search', ttl: 60_000, limit: 20 },
      ],
    }),
  ],
})
class AppModule {}

@Controller()
class AuthController {
  @Endpoint(login)
  @Throttle({ name: 'auth' })
  async login() { }

  @Endpoint(register)
  @Throttle({ name: 'auth', limit: 3 }) // Even stricter
  async register() { }
}

@Controller()
class UploadController {
  @Endpoint(uploadFile)
  @Throttle({ name: 'upload' })
  async upload() { }
}
```

### Combining with Guards

```typescript
import { Module, Controller, UseGuards } from '@navios/core'
import { ThrottlerGuard, Throttle } from '@navios/throttle'

// Apply globally via module
@Module({
  imports: [ThrottleModule.register({ /* ... */ })],
  guards: [ThrottlerGuard],
})
class AppModule {}

// Or apply to specific controllers
@Controller()
@UseGuards(ThrottlerGuard)
@Throttle({ limit: 100, ttl: 60_000 })
class ProtectedController { }
```

---

## Complete Example

```typescript
// throttle.config.ts
import { ThrottleModule, RedisThrottleStorage } from '@navios/throttle'

export const throttleConfig = ThrottleModule.register({
  storage: new RedisThrottleStorage({
    host: process.env.REDIS_HOST ?? 'localhost',
    port: 6379,
    keyPrefix: 'rl:',
  }),
  throttlers: [
    { name: 'default', ttl: 60_000, limit: 100 },
    { name: 'auth', ttl: 60_000, limit: 5 },
    { name: 'api', ttl: 1_000, limit: 10 },
    { name: 'heavy', ttl: 3_600_000, limit: 50 },
  ],
  getTracker: (context) => {
    const req = context.getRequest()
    // Prefer user ID, fall back to IP
    return req.user?.id ?? req.ip
  },
})
```

```typescript
// controllers/api.controller.ts
import { Controller, Endpoint, UseGuards } from '@navios/core'
import { inject } from '@navios/di'
import { Throttle, SkipThrottle, ThrottlerGuard } from '@navios/throttle'

@Controller()
@UseGuards(ThrottlerGuard)
@Throttle({ name: 'api' })
class ApiController {
  private dataService = inject(DataService)

  @Endpoint(listData)
  async list(params: EndpointParams<typeof listData>) {
    return this.dataService.findAll(params.query)
  }

  @Endpoint(getData)
  async get(params: EndpointParams<typeof getData>) {
    return this.dataService.findById(params.id)
  }

  // More restrictive for mutations
  @Endpoint(createData)
  @Throttle({ limit: 20, ttl: 60_000 })
  async create(params: EndpointParams<typeof createData>) {
    return this.dataService.create(params.data)
  }

  // Heavy operation with its own limit
  @Endpoint(exportData)
  @Throttle({ name: 'heavy' })
  async export(params: EndpointParams<typeof exportData>) {
    return this.dataService.export(params.query)
  }

  // Health check - no rate limiting
  @Endpoint(health)
  @SkipThrottle()
  async health() {
    return { status: 'ok' }
  }
}
```

```typescript
// controllers/auth.controller.ts
import { Controller, Endpoint, UseGuards } from '@navios/core'
import { Throttle, ThrottlerGuard, ThrottleKey } from '@navios/throttle'

@Controller()
@UseGuards(ThrottlerGuard)
@Throttle({ name: 'auth' })
class AuthController {
  private authService = inject(AuthService)

  @Endpoint(login)
  @ThrottleKey((ctx) => ctx.getRequest().body.email) // Rate limit by email
  async login(params: EndpointParams<typeof login>) {
    return this.authService.login(params.data)
  }

  @Endpoint(register)
  @Throttle({ limit: 3, ttl: 3_600_000 }) // 3 per hour
  async register(params: EndpointParams<typeof register>) {
    return this.authService.register(params.data)
  }

  @Endpoint(forgotPassword)
  @Throttle({ limit: 3, ttl: 3_600_000 })
  @ThrottleKey((ctx) => ctx.getRequest().body.email)
  async forgotPassword(params: EndpointParams<typeof forgotPassword>) {
    return this.authService.sendResetEmail(params.data.email)
  }
}
```

```typescript
// main.ts
import { Module } from '@navios/core'
import { NaviosFactory } from '@navios/core'
import { defineFastifyEnvironment } from '@navios/adapter-fastify'

@Module({
  imports: [throttleConfig, ApiModule, AuthModule],
})
class AppModule {}

async function bootstrap() {
  const app = await NaviosFactory.create(AppModule, {
    adapter: defineFastifyEnvironment(),
  })

  await app.listen({ port: 3000 })
}

bootstrap()
```

---

## API Reference Summary

### Module Exports

| Export                  | Type      | Description                      |
| ----------------------- | --------- | -------------------------------- |
| `ThrottleModule`        | Module    | Throttle module configuration    |
| `ThrottlerGuard`        | Guard     | Rate limiting guard              |
| `ThrottlerService`      | Class     | Programmatic throttle control    |
| `MemoryThrottleStorage` | Class     | In-memory storage                |
| `RedisThrottleStorage`  | Class     | Redis storage                    |
| `Throttle`              | Decorator | Configure rate limits            |
| `SkipThrottle`          | Decorator | Bypass rate limiting             |
| `ThrottleKey`           | Decorator | Custom key extraction            |
| `ThrottlerException`    | Exception | Rate limit exceeded error        |

### ThrottlerService Methods

| Method      | Return                       | Description                  |
| ----------- | ---------------------------- | ---------------------------- |
| `check`     | `Promise<ThrottleRecord>`    | Check without incrementing   |
| `increment` | `Promise<ThrottleRecord>`    | Increment and return state   |
| `reset`     | `Promise<void>`              | Reset specific throttler     |
| `resetAll`  | `Promise<void>`              | Reset all throttlers for key |
| `getRecord` | `Promise<ThrottleRecord>`    | Get current record           |

### Configuration Options

| Property       | Type              | Default    | Description                |
| -------------- | ----------------- | ---------- | -------------------------- |
| `throttlers`   | `ThrottlerConfig[]` | Required | Rate limit configurations  |
| `storage`      | `ThrottleStorage` | Memory     | Storage backend            |
| `getTracker`   | `Function`        | IP-based   | Key extraction function    |
| `headers`      | `HeadersConfig`   | Standard   | Response header names      |
| `skipHeaders`  | `boolean`         | `false`    | Disable rate limit headers |
| `errorMessage` | `string`          | Standard   | Custom error message       |
| `errorFactory` | `Function`        | -          | Custom error factory       |
