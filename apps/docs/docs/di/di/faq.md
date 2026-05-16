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

Use the field decorators on `accessor` fields — `@Inject`, `@InjectLazy`, `@InjectOptional`, or `@InjectDerived`:

```typescript
@Injectable()
class MyService {
  @Inject(OtherService)
  private accessor dependency!: OtherService
}
```

### What's the difference between `@Inject` and `@InjectLazy`?

- `@Inject` — eager. The dependency is resolved and assigned before `onServiceInit`. Subject to the scope-compatibility check.
- `@InjectLazy` — the field is a `Promise<T>` resolved on first `await`. Use it for circular dependencies and to depend on a narrower-scoped service from a wider-scoped host.

### How do I handle circular dependencies?

Use `@InjectLazy` on at least one side of the circular dependency:

```typescript
@Injectable()
class ServiceA {
  @InjectLazy(ServiceB)
  private accessor serviceB!: Promise<ServiceB> // Break cycle here
}

@Injectable()
class ServiceB {
  @Inject(ServiceA)
  private accessor serviceA!: ServiceA // This side can use @Inject
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
container.bind(API_URL_TOKEN).toValue('https://test-api.com')
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

**Solution**: Use `@InjectLazy` on at least one side:

```typescript
@Injectable()
class ServiceA {
  @InjectLazy(ServiceB)
  private accessor serviceB!: Promise<ServiceB> // Break cycle
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
- Ensure `experimentalDecorators` is `false` (or unset) in `tsconfig.json` — v2 uses **stage-3** decorators, not the legacy experimental ones
- Ensure decorator metadata is available (`Symbol.metadata`); TypeScript 5.2+ targeting a modern lib, or a Babel/SWC stage-3 decorators + decorator-metadata setup
- Use TypeScript 5.2+ and a build tool that supports ES (stage-3) decorators
- Declare injected fields as `accessor name!: Type` — `@Inject*` are accessor decorators and throw at decoration time on a plain field

### Can I use Navios DI with experimental (legacy) decorators?

No. v2 is **stage-3 decorators only**. The v1 `@navios/di/legacy-compat` entry point and the runtime `inject()` helpers were removed. Configure your toolchain for stage-3 decorators + decorator metadata (set `experimentalDecorators: false`).

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
  @Inject(Dependency)
  private accessor dependency!: Dependency
}
```

### From NestJS

Navios DI has a similar API but uses field decorators instead of constructor injection:

```typescript
// NestJS
@Injectable()
class MyService {
  constructor(private dependency: Dependency) {}
}

// Navios DI
@Injectable()
class MyService {
  @Inject(Dependency)
  private accessor dependency!: Dependency
}
```

## Getting Help

- Check the [API Reference](/docs/di/di/api-reference) for complete method signatures
- Review the [Guides](/docs/di/di/guides/services) for detailed usage examples
- See [Best Practices](/docs/di/di/best-practices) for design recommendations
- Visit the [GitHub repository](https://github.com/Arilas/navios) for issues and discussions

