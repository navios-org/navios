# Migration Guide

This guide helps you migrate between different versions of Navios DI.

## Migrating to v0.3.x

### New Features

#### Request Context Management

The biggest addition in v0.3.x is request context management. This feature allows you to manage request-scoped services with automatic cleanup.

**New APIs:**

- `Container.beginRequest(requestId, metadata?, priority?)`
- `Container.endRequest(requestId)`
- `Container.getCurrentRequestContext()`
- `Container.setCurrentRequestContext(requestId)`
- `RequestContextHolder` interface

**Example:**

```typescript
// New request context API
const container = new Container()
const context = container.beginRequest('req-123', { userId: 456 })
container.setCurrentRequestContext('req-123')

// Add request-scoped data
const REQUEST_ID_TOKEN = InjectionToken.create<string>('REQUEST_ID')
context.addInstance(REQUEST_ID_TOKEN, 'req-123')

// Use in services
@Injectable()
class RequestService {
  private readonly requestId = asyncInject(REQUEST_ID_TOKEN)

  async process() {
    const id = await this.requestId
    console.log(`Processing request: ${id}`)
  }
}

// Clean up when done
await container.endRequest('req-123')
```

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

**Solution:** Make sure you've set the current request context:

```typescript
container.setCurrentRequestContext('your-request-id')
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

**Solution:** Always call `endRequest()`:

```typescript
try {
  const context = container.beginRequest('req-123')
  // ... process request
} finally {
  await container.endRequest('req-123')
}
```

## Getting Help

If you encounter issues during migration:

1. Check the [API Reference](./api-reference.md) for detailed method signatures
2. Review the [examples](./examples/) for common patterns
3. Check the GitHub issues for known migration problems
4. Create a new issue if you find a bug or need help

## Changelog Summary

### v0.3.1

- Added request context management
- Improved TypeScript type definitions
- Enhanced container API with request context methods
- New `RequestContextHolder` interface
- Better error messages for injection failures

### v0.3.0

- Initial release with request context support
- Container API improvements
- Better async injection handling

### v0.2.x

- Basic dependency injection functionality
- Injectable and Factory decorators
- Injection tokens with Zod validation
- Service lifecycle hooks
