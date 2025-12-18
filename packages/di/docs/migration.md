# Migration Guide

This guide helps you migrate between different versions of Navios DI.

## Migrating to v0.6.0 (Circular Dependency Detection & Browser Support & ScopedContainer)

### New Features

#### Circular Dependency Detection

v0.5.x adds automatic circular dependency detection. When services form a circular dependency using `inject()`, the system now throws a clear error instead of hanging:

```typescript
@Injectable()
class ServiceA {
  private serviceB = inject(ServiceB)
}

@Injectable()
class ServiceB {
  private serviceA = inject(ServiceA)
}

// Error: Circular dependency detected: ServiceA -> ServiceB -> ServiceA
await container.get(ServiceA)
```

**Breaking circular dependencies** - Use `asyncInject()` on at least one side:

```typescript
@Injectable()
class ServiceA {
  private serviceB = asyncInject(ServiceB) // Break cycle with asyncInject

  async doSomething() {
    const b = await this.serviceB
    return b.process()
  }
}

@Injectable()
class ServiceB {
  private serviceA = inject(ServiceA) // This side can use inject()
}
```

#### Browser Support

The library now supports browser environments with a dedicated entry point:

```typescript
// Bundlers automatically select the browser entry via package.json exports
import { Container, inject } from '@navios/di'
```

The browser build uses `SyncLocalStorage` instead of `AsyncLocalStorage`, which works for synchronous dependency tracking.

#### Cross-Storage Invalidation

Singletons that depend on request-scoped services are now properly invalidated when the request ends:

```typescript
@Injectable({ scope: InjectableScope.Request })
class RequestData {}

@Injectable({ scope: InjectableScope.Singleton })
class SingletonConsumer {
  private requestData = inject(RequestData)
}

// When the request ends:
await scopedContainer.endRequest()
// SingletonConsumer is automatically invalidated
```

### Renamed Types (Deprecated Aliases Available)

For cleaner naming, many internal types have been renamed. Deprecated aliases are provided for backward compatibility:

| Old Name                                | New Name                  |
| --------------------------------------- | ------------------------- |
| `ServiceLocatorInstanceHolder`          | `InstanceHolder`          |
| `ServiceLocatorInstanceHolderStatus`    | `InstanceStatus`          |
| `ServiceLocatorInstanceEffect`          | `InstanceEffect`          |
| `ServiceLocatorInstanceDestroyListener` | `InstanceDestroyListener` |
| `BaseInstanceHolderManager`             | `BaseHolderManager`       |
| `ServiceLocatorManager`                 | `HolderManager`           |
| `SingletonHolderStorage`                | `SingletonStorage`        |
| `RequestHolderStorage`                  | `RequestStorage`          |
| `ServiceLocatorEventBus`                | `LifecycleEventBus`       |
| `CircularDependencyDetector`            | `CircularDetector`        |
| `ServiceInstantiator`                   | `Instantiator`            |
| `RequestContextHolder`                  | `RequestContext`          |
| `DefaultRequestContextHolder`           | `DefaultRequestContext`   |
| `createRequestContextHolder`            | `createRequestContext`    |

### Migration Steps

1. **Update circular dependencies**: If your code hangs during startup, you likely have circular dependencies. Add `asyncInject()` to break the cycle.

2. **Update type imports**: While deprecated aliases work, consider updating to new names:

   ```typescript
   // Before
   // After
   import { InstanceHolder, ServiceLocatorInstanceHolder } from '@navios/di'
   ```

3. **Browser builds**: No changes needed - bundlers automatically select the correct entry point.

---

## ScopedContainer

### Breaking Changes

v0.4.x introduces `ScopedContainer` for request context management. This is a **breaking change** that fixes race conditions in concurrent request handling.

#### Removed Methods

The following `Container` methods have been **removed**:

- `Container.setCurrentRequestContext(requestId)` - removed
- `Container.getCurrentRequestContext()` - removed
- `Container.endRequest(requestId)` - removed (use `ScopedContainer.endRequest()`)

#### Changed Return Type

- `Container.beginRequest()` now returns a `ScopedContainer` instead of `RequestContextHolder`

#### New API

```typescript
// OLD (v0.3.x) - no longer works
const context = container.beginRequest('req-123')
container.setCurrentRequestContext('req-123')
const service = await container.get(RequestService)
await container.endRequest('req-123')

// NEW (v0.4.x) - use ScopedContainer
const scoped = container.beginRequest('req-123')
const service = await scoped.get(RequestService)
await scoped.endRequest()
```

### Migration Steps

#### 1. Update Request Context Creation

**Before:**

```typescript
const context = container.beginRequest('req-123', { userId: 456 })
container.setCurrentRequestContext('req-123')
```

**After:**

```typescript
const scoped = container.beginRequest('req-123', { userId: 456 })
```

#### 2. Update Service Resolution

**Before:**

```typescript
container.setCurrentRequestContext('req-123')
const service = await container.get(RequestService)
```

**After:**

```typescript
const scoped = container.beginRequest('req-123')
const service = await scoped.get(RequestService)
```

#### 3. Update Cleanup

**Before:**

```typescript
await container.endRequest('req-123')
```

**After:**

```typescript
await scoped.endRequest()
// or
await scoped.dispose()
```

#### 4. Update Middleware (Express/Fastify)

**Before:**

```typescript
app.use(async (req, res, next) => {
  const requestId = `req-${Date.now()}`
  const context = container.beginRequest(requestId)
  container.setCurrentRequestContext(requestId)

  res.on('finish', () => container.endRequest(requestId))
  next()
})

app.get('/', async (req, res) => {
  const service = await container.get(RequestService)
  res.json(service.getData())
})
```

**After:**

```typescript
app.use(async (req, res, next) => {
  const requestId = `req-${Date.now()}`
  const scoped = container.beginRequest(requestId)
  ;(req as any).scoped = scoped

  res.on('finish', () => scoped.endRequest())
  next()
})

app.get('/', async (req, res) => {
  const scoped = (req as any).scoped
  const service = await scoped.get(RequestService)
  res.json(service.getData())
})
```

### Why This Change?

The old API had a race condition:

```typescript
// Request A starts
container.setCurrentRequestContext('req-A')
const serviceA = await container.get(RequestService) // async...

// Request B starts while A is still resolving
container.setCurrentRequestContext('req-B')

// Service A might get Request B's context! Bug!
```

The new API eliminates this by giving each request its own container:

```typescript
// Request A
const scopedA = container.beginRequest('req-A')
const serviceA = await scopedA.get(RequestService) // Always gets A's context

// Request B
const scopedB = container.beginRequest('req-B')
const serviceB = await scopedB.get(RequestService) // Always gets B's context

// No race condition possible
```

### New Features

#### IContainer Interface

Both `Container` and `ScopedContainer` implement `IContainer`:

```typescript
interface IContainer {
  get<T>(token, args?): Promise<T>
  invalidate(service: unknown): Promise<void>
  isRegistered(token): boolean
  dispose(): Promise<void>
  ready(): Promise<void>
  tryGetSync<T>(token, args?): T | null
}
```

#### Request-Scoped Error Protection

Attempting to get a request-scoped service from Container now throws a helpful error:

```typescript
await container.get(RequestService)
// Error: Cannot resolve request-scoped service "RequestService" from Container.
// Use beginRequest() to create a ScopedContainer for request-scoped services.
```

#### Active Request Tracking

```typescript
const scoped = container.beginRequest('req-123')
container.hasActiveRequest('req-123') // true
await scoped.endRequest()
container.hasActiveRequest('req-123') // false
```

---

## Migrating to v0.3.x

### New Features

#### Request Context Management (Legacy)

> **Note:** This section documents the v0.3.x API which is deprecated in v0.4.x. See "Migrating to v0.4.x" above for the current API.

**Old APIs (deprecated in v0.4.x):**

- `Container.beginRequest(requestId, metadata?, priority?)` - returns `RequestContextHolder` in v0.3.x
- `Container.endRequest(requestId)` - removed in v0.4.x
- `Container.getCurrentRequestContext()` - removed in v0.4.x
- `Container.setCurrentRequestContext(requestId)` - removed in v0.4.x

### Recommended Changes

#### Prefer `asyncInject` over `inject`

While `inject` still works, `asyncInject` is now the recommended approach for most use cases as it's safer and handles async dependencies better.

**Before:**

```typescript
@Injectable()
class UserService {
  private readonly db = inject(DatabaseService)
}
```

**After:**

```typescript
@Injectable()
class UserService {
  private readonly db = asyncInject(DatabaseService)

  async getUsers() {
    const database = await this.db
    return database.query('SELECT * FROM users')
  }
}
```

### Breaking Changes

None in v0.3.x - this is a feature release with full backward compatibility.

## Migrating from v0.2.x to v0.3.x

### New Dependencies

No new peer dependencies were added.

### Updated Type Definitions

Some internal type definitions were improved for better TypeScript support, but no breaking changes to public APIs.

## Future Migration Notes

### Planned for v0.4.x

- Enhanced request context lifecycle hooks
- Performance optimizations for high-throughput scenarios
- Additional factory pattern improvements

### Best Practices for Forward Compatibility

1. **Use `asyncInject` for new code** - This is the future-preferred injection method
2. **Implement lifecycle hooks** - `OnServiceInit` and `OnServiceDestroy` for proper resource management
3. **Use request contexts** - For web applications and request-scoped data
4. **Prefer injection tokens** - For configuration and interface-based dependencies

## Common Migration Issues

### Issue: Services not found in request context

**Problem:** Services can't be resolved when using request contexts.

**Solution:** Use a `ScopedContainer` for request-scoped services:

```typescript
const scoped = container.beginRequest('your-request-id')
const service = await scoped.get(RequestService)
```

### Issue: Async dependencies not ready

**Problem:** Using `inject` with dependencies that aren't immediately available.

**Solution:** Switch to `asyncInject`:

```typescript
// Instead of this:
private readonly service = inject(AsyncService)

// Use this:
private readonly service = asyncInject(AsyncService)
```

### Issue: Memory leaks with request contexts

**Problem:** Request contexts not being cleaned up.

**Solution:** Always call `endRequest()` on the ScopedContainer:

```typescript
const scoped = container.beginRequest('req-123')
try {
  const service = await scoped.get(RequestService)
  // ... process request
} finally {
  await scoped.endRequest()
}
```

## Getting Help

If you encounter issues during migration:

1. Check the [API Reference](./api-reference.md) for detailed method signatures
2. Review the [examples](./examples/) for common patterns
3. Check the GitHub issues for known migration problems
4. Create a new issue if you find a bug or need help

## Changelog Summary

### v0.5.x

- **Circular Dependency Detection**: Automatic detection with clear error messages
- **Browser Support**: Dedicated browser entry point with `SyncLocalStorage` polyfill
- **Cross-Storage Invalidation**: Singletons depending on request-scoped services are properly invalidated
- **Resolution Context**: Uses `AsyncLocalStorage` to track resolution across async boundaries
- **Type Renames**: Cleaner names for internal types (with deprecated aliases)
- **Platform Support**: Node.js, Bun, Deno, and browser environments

### v0.4.x

- **ScopedContainer**: New request context management API
- **Race Condition Fix**: Eliminates concurrency issues with request-scoped services
- **IContainer Interface**: Common interface for `Container` and `ScopedContainer`
- **Request-Scoped Errors**: Clear error when resolving request-scoped from `Container`
- **Active Request Tracking**: `hasActiveRequest()` and `getActiveRequestIds()` methods

### v0.3.x

- Added request context management
- Improved TypeScript type definitions
- Enhanced container API with request context methods
- New `RequestContextHolder` interface
- Better error messages for injection failures

### v0.2.x

- Basic dependency injection functionality
- Injectable and Factory decorators
- Injection tokens with Zod validation
- Service lifecycle hooks
