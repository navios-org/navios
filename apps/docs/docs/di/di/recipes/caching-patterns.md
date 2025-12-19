---
sidebar_position: 4
---

# Caching Patterns

This recipe demonstrates different caching patterns using dependency injection.

## Singleton Cache Service

```typescript
@Injectable()
class CacheService {
  private cache = new Map<string, { value: any; expires?: number }>()

  set(key: string, value: any, ttl?: number) {
    this.cache.set(key, {
      value,
      expires: ttl ? Date.now() + ttl : null,
    })
  }

  get(key: string) {
    const item = this.cache.get(key)
    if (!item) return null

    if (item.expires && Date.now() > item.expires) {
      this.cache.delete(key)
      return null
    }

    return item.value
  }

  delete(key: string) {
    return this.cache.delete(key)
  }

  clear() {
    this.cache.clear()
  }
}
```

## Transient Cache Factory

```typescript
@Factory({ scope: InjectableScope.Transient })
class CacheFactory {
  create() {
    const cache = new Map()

    return {
      set(key: string, value: any) {
        cache.set(key, value)
      },
      get(key: string) {
        return cache.get(key)
      },
      clear() {
        cache.clear()
      },
    }
  }
}
```

## Service with Caching

```typescript
@Injectable()
class UserService {
  private readonly cache = inject(CacheService)
  private readonly db = inject(DatabaseService)

  async getUser(id: string) {
    // Check cache first
    const cached = this.cache.get(`user:${id}`)
    if (cached) return cached

    // Query database
    const user = await this.db.query(`SELECT * FROM users WHERE id = ${id}`)

    // Cache the result
    this.cache.set(`user:${id}`, user, 60000) // 1 minute TTL

    return user
  }
}
```

