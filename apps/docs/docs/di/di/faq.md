---
sidebar_position: 6
---

# FAQ

Frequently asked questions and troubleshooting guide for Navios DI.

## Common Questions

### How do I register a service?

Services are automatically registered when you use the `@Injectable()` decorator:

```typescript
@Injectable()
class MyService {
  // Service is automatically registered
}
```

### How do I inject a dependency?

Use `inject()`, `asyncInject()`, or `optional()`:

```typescript
@Injectable()
class MyService {
  private readonly dependency = inject(OtherService)
}
```

### What's the difference between inject and asyncInject?

- `inject()` - Synchronous injection, works with all scopes
- `asyncInject()` - Asynchronous injection, useful for breaking circular dependencies

### How do I handle circular dependencies?

Use `asyncInject()` on at least one side of the circular dependency:

```typescript
@Injectable()
class ServiceA {
  private serviceB = asyncInject(ServiceB) // Break cycle here
}

@Injectable()
class ServiceB {
  private serviceA = inject(ServiceA) // This side can use inject
}
```

### What are the different service scopes?

- **Singleton** - One instance shared across the application (default)
- **Transient** - New instance created for each injection
- **Request** - One instance per request context

### Does Navios DI work in the browser?

Yes! Navios DI fully supports browser environments. Bundlers automatically use the browser-optimized build which uses `SyncLocalStorage` instead of `AsyncLocalStorage`. See the [Browser Support guide](/docs/di/di/guides/browser-support) for details.

### Is circular dependency detection enabled in production?

No, circular dependency detection is disabled in production (`NODE_ENV=production`) for performance. Always test with development mode to catch circular dependencies early.

### How do I use request-scoped services?

Request-scoped services require a `ScopedContainer`:

```typescript
const scoped = container.beginRequest('req-123')
const service = await scoped.get(RequestService)
await scoped.endRequest()
```

### How do I test services?

Use `TestContainer` for testing:

```typescript
import { TestContainer } from '@navios/di/testing'

const container = new TestContainer()
container.bindValue(API_URL_TOKEN, 'https://test-api.com')
const service = await container.get(MyService)
```

## Troubleshooting

### Error: "AsyncLocalStorage is not defined"

**Problem**: Your bundler is using the Node.js entry in a browser context.

**Solution**: Ensure your bundler is configured to use the `browser` condition:

```javascript
// webpack
resolve: {
  conditionNames: ['browser', 'import', 'default']
}
```

### Error: "Service not registered"

**Problem**: You're trying to use a service that hasn't been registered.

**Solution**: Make sure the service is decorated with `@Injectable()`:

```typescript
@Injectable() // Don't forget this!
class MyService {}
```

### Error: "Circular dependency detected"

**Problem**: Services depend on each other in a cycle.

**Solution**: Use `asyncInject()` on at least one side:

```typescript
@Injectable()
class ServiceA {
  private serviceB = asyncInject(ServiceB) // Break cycle
}
```

### Error: "Cannot resolve request-scoped service from Container"

**Problem**: You're trying to get a request-scoped service from the main container.

**Solution**: Use `ScopedContainer`:

```typescript
// ❌ Wrong
await container.get(RequestService)

// ✅ Correct
const scoped = container.beginRequest('req-123')
await scoped.get(RequestService)
```

### Decorators not working

**Problem**: Decorators are not being recognized.

**Solution**: 
- Ensure `experimentalDecorators: false` in `tsconfig.json`
- Make sure you're using TypeScript 5+
- Check that your build tool supports ES decorators

### Service recreated on every access

**Problem**: Service is being recreated instead of reused.

**Solution**: Check the service scope. If it should be a singleton, make sure it's not marked as transient:

```typescript
@Injectable() // Singleton (default)
class MyService {}
```

### Type errors with injected services

**Problem**: TypeScript type errors with injected services.

**Solution**:
- Ensure proper TypeScript configuration
- Use proper type annotations for injected services
- Check that all dependencies are properly typed

## Migration from Other DI Libraries

### From InversifyJS

Navios DI uses a simpler decorator-based approach:

```typescript
// InversifyJS
@injectable()
class MyService {
  constructor(@inject('Token') private dependency: Dependency) {}
}

// Navios DI
@Injectable()
class MyService {
  private readonly dependency = inject(Dependency)
}
```

### From NestJS

Navios DI has a similar API but simpler:

```typescript
// NestJS
@Injectable()
class MyService {
  constructor(private dependency: Dependency) {}
}

// Navios DI
@Injectable()
class MyService {
  private readonly dependency = inject(Dependency)
}
```

## Getting Help

- Check the [API Reference](/docs/di/di/api-reference) for complete method signatures
- Review the [Guides](/docs/di/di/guides/services) for detailed usage examples
- See [Best Practices](/docs/di/di/best-practices) for design recommendations
- Visit the [GitHub repository](https://github.com/Arilas/navios) for issues and discussions

