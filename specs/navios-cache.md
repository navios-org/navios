# @navios/cache Specification

## Overview

`@navios/cache` is a type-safe caching library for the Navios framework. It provides decorator-based caching with multiple storage backends and seamless integration into Navios's dependency injection system.

**Package:** `@navios/cache`
**Version:** 0.1.0
**License:** MIT
**Dependencies:** None (adapters are optional)
**Peer Dependencies:** `@navios/core`, `@navios/di`
**Optional Dependencies:** `ioredis` (^5.x), `keyv` (^5.x)

---

## Core Concepts

### Architecture Overview

```
CacheModule
├── CacheService (main service)
│   ├── get<T>(key) - Retrieve cached value
│   ├── set(key, value, ttl?) - Store value
│   ├── del(key) - Delete value
│   ├── has(key) - Check existence
│   ├── clear() - Clear all
│   └── wrap<T>(key, fn, ttl?) - Cache-aside pattern
│
├── Adapters
│   ├── MemoryAdapter (built-in, default)
│   ├── RedisAdapter (via ioredis)
│   ├── KeyvAdapter (via keyv - supports many backends)
│   └── Custom adapters via CacheAdapter interface
│
└── Decorators
    ├── @Cacheable() - Cache method results
    ├── @CacheEvict() - Invalidate cache entries
    ├── @CachePut() - Update cache without checking
    └── @CacheTTL() - Set TTL at method level
```

### Key Principles

- **Decorator-Based** - Clean API using TypeScript decorators
- **DI Integration** - Injectable service via @navios/di
- **Pluggable Backends** - Memory, Redis, or custom adapters
- **Type-Safe** - Full TypeScript support with generics
- **Cache-Aside Pattern** - Built-in `wrap()` for common patterns

---

## Setup

### Basic Configuration (In-Memory)

```typescript
import { Module } from '@navios/core'
import { CacheModule } from '@navios/cache'

@Module({
  imports: [
    CacheModule.register({
      ttl: 60_000, // Default TTL: 60 seconds
      max: 1000,   // Max items in memory cache
    }),
  ],
})
class AppModule {}
```

### Redis Configuration

```typescript
import { Module } from '@navios/core'
import { CacheModule, RedisAdapter } from '@navios/cache'

@Module({
  imports: [
    CacheModule.register({
      adapter: new RedisAdapter({
        host: 'localhost',
        port: 6379,
        password: 'secret',
        keyPrefix: 'app:cache:',
      }),
      ttl: 300_000, // 5 minutes
    }),
  ],
})
class AppModule {}
```

### Async Configuration

```typescript
import { Module } from '@navios/core'
import { CacheModule, RedisAdapter } from '@navios/cache'
import { inject } from '@navios/di'

@Module({
  imports: [
    CacheModule.registerAsync({
      useFactory: async () => {
        const config = await inject(ConfigService)
        return {
          adapter: new RedisAdapter({
            host: config.redis.host,
            port: config.redis.port,
          }),
          ttl: config.cache.defaultTtl,
        }
      },
    }),
  ],
})
class AppModule {}
```

---

## CacheService API

### Injection

```typescript
import { Injectable, inject } from '@navios/di'
import { CacheService } from '@navios/cache'

@Injectable()
class UserService {
  private cache = inject(CacheService)
}
```

### get<T>(key)

Retrieves a cached value by key.

```typescript
const user = await this.cache.get<User>('user:123')

if (user) {
  return user
}
```

**Parameters:**

| Parameter | Type     | Description     |
| --------- | -------- | --------------- |
| `key`     | `string` | The cache key   |

**Returns:** `Promise<T | null>` - The cached value or null

### set(key, value, options?)

Stores a value in the cache.

```typescript
await this.cache.set('user:123', user)

// With custom TTL (milliseconds)
await this.cache.set('user:123', user, { ttl: 300_000 })

// With tags for group invalidation
await this.cache.set('user:123', user, {
  ttl: 300_000,
  tags: ['users', `tenant:${tenantId}`],
})
```

**Parameters:**

| Parameter | Type           | Description              |
| --------- | -------------- | ------------------------ |
| `key`     | `string`       | The cache key            |
| `value`   | `T`            | The value to cache       |
| `options` | `SetOptions`   | Optional TTL and tags    |

**SetOptions:**

| Property | Type       | Description                    |
| -------- | ---------- | ------------------------------ |
| `ttl`    | `number`   | Time to live in milliseconds   |
| `tags`   | `string[]` | Tags for group invalidation    |

**Returns:** `Promise<void>`

### del(key)

Deletes a cached value.

```typescript
await this.cache.del('user:123')
```

**Returns:** `Promise<boolean>` - Whether the key existed

### delByTag(tag)

Deletes all cached values with a specific tag.

```typescript
// Invalidate all user-related cache entries
await this.cache.delByTag('users')

// Invalidate all cache for a specific tenant
await this.cache.delByTag(`tenant:${tenantId}`)
```

**Returns:** `Promise<number>` - Number of deleted keys

### has(key)

Checks if a key exists in the cache.

```typescript
if (await this.cache.has('user:123')) {
  // Key exists
}
```

**Returns:** `Promise<boolean>`

### clear()

Clears all cached values.

```typescript
await this.cache.clear()
```

**Returns:** `Promise<void>`

### wrap<T>(key, fn, options?)

Cache-aside pattern: returns cached value or executes function and caches result.

```typescript
const user = await this.cache.wrap(
  `user:${userId}`,
  async () => this.userRepository.findById(userId),
  { ttl: 60_000 }
)
```

**Parameters:**

| Parameter | Type              | Description                    |
| --------- | ----------------- | ------------------------------ |
| `key`     | `string`          | The cache key                  |
| `fn`      | `() => Promise<T>`| Function to execute on miss    |
| `options` | `WrapOptions`     | Optional TTL and tags          |

**Returns:** `Promise<T>`

### mget<T>(keys)

Retrieves multiple cached values.

```typescript
const users = await this.cache.mget<User>(['user:1', 'user:2', 'user:3'])
// Returns: Map<string, User | null>
```

**Returns:** `Promise<Map<string, T | null>>`

### mset(entries, options?)

Stores multiple values in the cache.

```typescript
await this.cache.mset([
  ['user:1', user1],
  ['user:2', user2],
  ['user:3', user3],
], { ttl: 60_000 })
```

**Returns:** `Promise<void>`

---

## Decorators

### @Cacheable(options?)

Caches the return value of a method.

```typescript
import { Injectable } from '@navios/di'
import { Cacheable } from '@navios/cache'

@Injectable()
class UserService {
  @Cacheable({ key: 'user:$userId', ttl: 60_000 })
  async findById(userId: string): Promise<User> {
    return this.db.users.findUnique({ where: { id: userId } })
  }

  @Cacheable({
    key: (args) => `users:list:${args.page}:${args.limit}`,
    ttl: 30_000,
    tags: ['users'],
  })
  async findAll(args: { page: number; limit: number }): Promise<User[]> {
    return this.db.users.findMany({
      skip: (args.page - 1) * args.limit,
      take: args.limit,
    })
  }
}
```

**Options:**

| Property    | Type                           | Description                      |
| ----------- | ------------------------------ | -------------------------------- |
| `key`       | `string \| (args) => string`   | Cache key or key generator       |
| `ttl`       | `number`                       | TTL in milliseconds              |
| `tags`      | `string[] \| (args) => string[]` | Cache tags for invalidation    |
| `condition` | `(args, result) => boolean`    | Condition to cache result        |
| `unless`    | `(args, result) => boolean`    | Condition to skip caching        |

**Key Interpolation:**

Use `$paramName` syntax for simple parameter interpolation:

```typescript
@Cacheable({ key: 'user:$userId' })
async findById(userId: string) { }

@Cacheable({ key: 'users:$tenantId:$page' })
async findByTenant(tenantId: string, page: number) { }
```

### @CacheEvict(options)

Invalidates cache entries when method is called.

```typescript
@Injectable()
class UserService {
  @CacheEvict({ key: 'user:$userId' })
  async updateUser(userId: string, data: UpdateUserDto): Promise<User> {
    return this.db.users.update({ where: { id: userId }, data })
  }

  @CacheEvict({ tags: ['users'] })
  async bulkUpdate(data: BulkUpdateDto): Promise<void> {
    await this.db.users.updateMany(data)
  }

  @CacheEvict({ allEntries: true })
  async clearAllUsers(): Promise<void> {
    // Clears entire cache
  }
}
```

**Options:**

| Property      | Type                         | Description                    |
| ------------- | ---------------------------- | ------------------------------ |
| `key`         | `string \| (args) => string` | Cache key to invalidate        |
| `tags`        | `string[]`                   | Tags to invalidate             |
| `allEntries`  | `boolean`                    | Clear all cache entries        |
| `beforeInvocation` | `boolean`               | Evict before method executes   |

### @CachePut(options)

Always executes the method and updates the cache (doesn't check cache first).

```typescript
@Injectable()
class UserService {
  @CachePut({ key: 'user:$userId' })
  async refreshUser(userId: string): Promise<User> {
    // Always fetches fresh data and updates cache
    return this.db.users.findUnique({ where: { id: userId } })
  }
}
```

### @CacheTTL(ttl)

Sets TTL at class or method level (can be overridden).

```typescript
@Injectable()
@CacheTTL(300_000) // Default 5 minutes for all methods
class ProductService {
  @Cacheable({ key: 'product:$id' })
  async findById(id: string): Promise<Product> { }

  @Cacheable({ key: 'products:featured' })
  @CacheTTL(60_000) // Override: 1 minute for this method
  async getFeaturedProducts(): Promise<Product[]> { }
}
```

---

## Adapters

### MemoryAdapter (Default)

In-memory cache using LRU eviction. Best for single-instance deployments or development.

```typescript
import { CacheModule, MemoryAdapter } from '@navios/cache'

CacheModule.register({
  adapter: new MemoryAdapter({
    max: 1000,           // Max items (default: 1000)
    maxSize: 50_000_000, // Max size in bytes (default: 50MB)
    ttl: 60_000,         // Default TTL
  }),
})
```

**Options:**

| Property  | Type     | Default    | Description                |
| --------- | -------- | ---------- | -------------------------- |
| `max`     | `number` | 1000       | Maximum number of items    |
| `maxSize` | `number` | 50MB       | Maximum size in bytes      |
| `ttl`     | `number` | 0 (no TTL) | Default TTL in ms          |

### RedisAdapter

Redis-backed cache for distributed deployments.

```typescript
import { CacheModule, RedisAdapter } from '@navios/cache'

CacheModule.register({
  adapter: new RedisAdapter({
    host: 'localhost',
    port: 6379,
    password: 'secret',
    db: 0,
    keyPrefix: 'myapp:cache:',

    // Cluster mode
    cluster: [
      { host: 'redis-1', port: 6379 },
      { host: 'redis-2', port: 6379 },
      { host: 'redis-3', port: 6379 },
    ],

    // Sentinel mode
    sentinels: [
      { host: 'sentinel-1', port: 26379 },
    ],
    name: 'mymaster',
  }),
})
```

**Options:**

| Property    | Type       | Description                      |
| ----------- | ---------- | -------------------------------- |
| `host`      | `string`   | Redis host                       |
| `port`      | `number`   | Redis port                       |
| `password`  | `string`   | Redis password                   |
| `db`        | `number`   | Redis database index             |
| `keyPrefix` | `string`   | Prefix for all cache keys        |
| `cluster`   | `array`    | Cluster node configuration       |
| `sentinels` | `array`    | Sentinel configuration           |
| `name`      | `string`   | Sentinel master name             |
| `tls`       | `object`   | TLS configuration                |

### KeyvAdapter

Universal adapter supporting multiple backends via Keyv.

```typescript
import { CacheModule, KeyvAdapter } from '@navios/cache'

// SQLite
CacheModule.register({
  adapter: new KeyvAdapter('sqlite://cache.sqlite'),
})

// PostgreSQL
CacheModule.register({
  adapter: new KeyvAdapter('postgresql://user:pass@localhost/db'),
})

// MongoDB
CacheModule.register({
  adapter: new KeyvAdapter('mongodb://localhost:27017/cache'),
})
```

### Custom Adapter

Implement the `CacheAdapter` interface for custom backends.

```typescript
import { CacheAdapter } from '@navios/cache'

class CustomAdapter implements CacheAdapter {
  async get<T>(key: string): Promise<T | null> {
    // Implementation
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    // Implementation
  }

  async del(key: string): Promise<boolean> {
    // Implementation
  }

  async has(key: string): Promise<boolean> {
    // Implementation
  }

  async clear(): Promise<void> {
    // Implementation
  }

  async mget<T>(keys: string[]): Promise<Map<string, T | null>> {
    // Implementation
  }

  async mset<T>(entries: [string, T][], ttl?: number): Promise<void> {
    // Implementation
  }

  // Optional: for tag-based invalidation
  async setWithTags<T>(key: string, value: T, tags: string[], ttl?: number): Promise<void> {
    // Implementation
  }

  async delByTag(tag: string): Promise<number> {
    // Implementation
  }
}
```

**CacheAdapter Interface:**

```typescript
interface CacheAdapter {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T, ttl?: number): Promise<void>
  del(key: string): Promise<boolean>
  has(key: string): Promise<boolean>
  clear(): Promise<void>
  mget<T>(keys: string[]): Promise<Map<string, T | null>>
  mset<T>(entries: [string, T][], ttl?: number): Promise<void>

  // Optional methods for tag support
  setWithTags?<T>(key: string, value: T, tags: string[], ttl?: number): Promise<void>
  delByTag?(tag: string): Promise<number>

  // Lifecycle
  onModuleDestroy?(): Promise<void>
}
```

---

## Multi-Cache Configuration

Configure multiple named cache instances for different use cases.

```typescript
import { Module } from '@navios/core'
import { CacheModule, RedisAdapter, MemoryAdapter } from '@navios/cache'

@Module({
  imports: [
    CacheModule.register({
      stores: {
        // Default cache (memory, short TTL)
        default: {
          adapter: new MemoryAdapter({ max: 500 }),
          ttl: 30_000,
        },

        // Session cache (Redis, longer TTL)
        sessions: {
          adapter: new RedisAdapter({ host: 'redis', keyPrefix: 'sess:' }),
          ttl: 86_400_000, // 24 hours
        },

        // API response cache
        api: {
          adapter: new RedisAdapter({ host: 'redis', keyPrefix: 'api:' }),
          ttl: 300_000, // 5 minutes
        },
      },
    }),
  ],
})
class AppModule {}
```

### Using Named Caches

```typescript
import { Injectable, inject } from '@navios/di'
import { CacheService, InjectCache } from '@navios/cache'

@Injectable()
class SessionService {
  // Inject specific cache by name
  private sessionCache = inject(CacheService, { name: 'sessions' })

  async getSession(sessionId: string) {
    return this.sessionCache.get(`session:${sessionId}`)
  }
}

// Or with decorator
@Injectable()
class ApiService {
  @InjectCache('api')
  private apiCache!: CacheService

  @Cacheable({ key: 'external:$endpoint', cache: 'api' })
  async fetchExternal(endpoint: string) {
    return fetch(endpoint).then(r => r.json())
  }
}
```

---

## Cache Events

Subscribe to cache events for monitoring and debugging.

```typescript
import { Injectable, inject } from '@navios/di'
import { CacheService, OnCacheHit, OnCacheMiss, OnCacheEvict } from '@navios/cache'

@Injectable()
class CacheMonitor implements OnCacheHit, OnCacheMiss, OnCacheEvict {
  private metrics = inject(MetricsService)

  onCacheHit(key: string, value: unknown): void {
    this.metrics.increment('cache.hit', { key })
  }

  onCacheMiss(key: string): void {
    this.metrics.increment('cache.miss', { key })
  }

  onCacheEvict(key: string): void {
    this.metrics.increment('cache.evict', { key })
  }
}
```

---

## Integration with Request Scope

Cache can be scoped to requests for user-specific caching.

```typescript
import { Injectable, Scope } from '@navios/di'
import { Cacheable } from '@navios/cache'
import { Request } from '@navios/core'

@Injectable({ scope: Scope.Request })
class UserDataService {
  private request = inject(Request)

  @Cacheable({
    key: (args) => `user:${this.request.user.id}:prefs`,
    ttl: 300_000,
  })
  async getUserPreferences() {
    return this.db.preferences.findFirst({
      where: { userId: this.request.user.id },
    })
  }
}
```

---

## Complete Example

```typescript
// cache.config.ts
import { CacheModule, RedisAdapter, MemoryAdapter } from '@navios/cache'

export const cacheConfig = CacheModule.register({
  stores: {
    default: {
      adapter: new MemoryAdapter({ max: 1000 }),
      ttl: 60_000,
    },
    persistent: {
      adapter: new RedisAdapter({
        host: process.env.REDIS_HOST,
        port: 6379,
        keyPrefix: 'app:',
      }),
      ttl: 3_600_000,
    },
  },
})
```

```typescript
// services/product.service.ts
import { Injectable, inject } from '@navios/di'
import { Cacheable, CacheEvict, CacheService } from '@navios/cache'

@Injectable()
class ProductService {
  private db = inject(DatabaseService)
  private cache = inject(CacheService)

  @Cacheable({
    key: 'product:$id',
    ttl: 300_000,
    tags: ['products'],
  })
  async findById(id: string): Promise<Product | null> {
    return this.db.products.findUnique({ where: { id } })
  }

  @Cacheable({
    key: (args) => `products:category:${args.categoryId}:${args.page}`,
    ttl: 60_000,
    tags: (args) => ['products', `category:${args.categoryId}`],
  })
  async findByCategory(args: { categoryId: string; page: number }): Promise<Product[]> {
    return this.db.products.findMany({
      where: { categoryId: args.categoryId },
      skip: (args.page - 1) * 20,
      take: 20,
    })
  }

  @CacheEvict({
    key: 'product:$id',
    tags: ['products'],
  })
  async update(id: string, data: UpdateProductDto): Promise<Product> {
    return this.db.products.update({ where: { id }, data })
  }

  @CacheEvict({ tags: ['products'] })
  async bulkImport(products: CreateProductDto[]): Promise<void> {
    await this.db.products.createMany({ data: products })
  }

  // Manual cache control
  async getProductWithRelations(id: string): Promise<ProductWithRelations> {
    return this.cache.wrap(
      `product:${id}:full`,
      async () => {
        const product = await this.db.products.findUnique({
          where: { id },
          include: { category: true, reviews: true },
        })
        return product
      },
      { ttl: 120_000, tags: ['products', `product:${id}`] }
    )
  }
}
```

```typescript
// modules/products.module.ts
import { Module, Controller, Endpoint } from '@navios/core'
import { inject } from '@navios/di'

@Controller()
class ProductController {
  private productService = inject(ProductService)

  @Endpoint(getProduct)
  async get(params: EndpointParams<typeof getProduct>) {
    const product = await this.productService.findById(params.id)
    if (!product) {
      throw new NotFoundException('Product not found')
    }
    return product
  }

  @Endpoint(listProducts)
  async list(params: EndpointParams<typeof listProducts>) {
    return this.productService.findByCategory({
      categoryId: params.query.categoryId,
      page: params.query.page ?? 1,
    })
  }
}

@Module({
  imports: [cacheConfig],
  controllers: [ProductController],
})
class ProductsModule {}
```

---

## API Reference Summary

### Module Exports

| Export           | Type        | Description                        |
| ---------------- | ----------- | ---------------------------------- |
| `CacheModule`    | Module      | Cache module with configuration    |
| `CacheService`   | Class       | Main cache service                 |
| `MemoryAdapter`  | Class       | In-memory cache adapter            |
| `RedisAdapter`   | Class       | Redis cache adapter                |
| `KeyvAdapter`    | Class       | Keyv universal adapter             |
| `Cacheable`      | Decorator   | Cache method results               |
| `CacheEvict`     | Decorator   | Invalidate cache entries           |
| `CachePut`       | Decorator   | Update cache unconditionally       |
| `CacheTTL`       | Decorator   | Set TTL at class/method level      |
| `InjectCache`    | Decorator   | Inject named cache                 |

### CacheService Methods

| Method     | Return                      | Description                    |
| ---------- | --------------------------- | ------------------------------ |
| `get`      | `Promise<T \| null>`        | Get cached value               |
| `set`      | `Promise<void>`             | Set cached value               |
| `del`      | `Promise<boolean>`          | Delete cached value            |
| `delByTag` | `Promise<number>`           | Delete by tag                  |
| `has`      | `Promise<boolean>`          | Check if key exists            |
| `clear`    | `Promise<void>`             | Clear all cache                |
| `wrap`     | `Promise<T>`                | Cache-aside pattern            |
| `mget`     | `Promise<Map<string, T>>`   | Get multiple values            |
| `mset`     | `Promise<void>`             | Set multiple values            |

### Configuration Options

| Property  | Type           | Default         | Description                |
| --------- | -------------- | --------------- | -------------------------- |
| `adapter` | `CacheAdapter` | `MemoryAdapter` | Cache storage adapter      |
| `ttl`     | `number`       | `0`             | Default TTL in ms          |
| `stores`  | `object`       | -               | Named cache configurations |
