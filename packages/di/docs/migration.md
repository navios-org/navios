# Migration Guide: 1.x to 2.0

Version 2.0 replaces the resolution engine. Resolution is synchronous first, tokens are identified by the token object, the global registry and priorities are replaced by explicit providers, and a service is always built in its declared scope.

This guide lists every public change and shows the ones most applications will meet. Notes for versions before 1.0 are in the [changelog](../CHANGELOG.md).

## What Changed

| 1.x | 2.0 |
| --- | --- |
| `new Container(registry, logger, injectors)` | `new Container({ providers?, strict?, logger? })` |
| `Registry`, `globalRegistry`, `@Injectable({ registry })`, `@Factory({ registry })` | Removed. A class's token is its own identity. Isolation comes from using a new `Container`. |
| `@Injectable({ priority })`, `registry.getAll()`, override by priority | Removed. Use `provide(TokenOrClass, Impl)` in `new Container({ providers })` or `container.provide()`. |
| A second `@Injectable({ token })` for the same token | Throws `ProviderConflict` at decoration unless the class has the same name as the current default. |
| `container.beginRequest(id, metadata)` | `container.createScope(metadata?)`. Scopes have no ids. |
| `container.getActiveRequestIds()`, `container.hasActiveRequest()` | Removed. The container does not track its scopes. |
| `scoped.endRequest()` | `scoped.dispose()`, or `await using scope = container.createScope()`. `endRequest()` remains as a deprecated alias. |
| `scoped.getRequestId()` | Removed. |
| Using a disposed scope threw `Error` | Throws `DIError` with code `ContainerDisposed`. |
| Automatic scope upgrade: a singleton that injected a request-scoped service became request-scoped | Removed. It is a `DIError` with code `ScopeMismatchError`. |
| `inject(TransientService)` was an error ("use asyncInject") | Returns a fresh instance for each call. |
| Conditional `inject()` threw "Wrong token order" | Allowed. |
| A constructor ran twice when a dependency was not created yet | Runs once. It runs twice only on the first build of a class when a dependency has an unfinished asynchronous `onServiceInit()`. |
| `optional()` returned `null` on any failure | Returns `null` only when nothing provides the token. Other errors propagate. |
| An error thrown in a constructor or `onServiceInit()` was wrapped on some code paths only | Always a `DIError` with code `InitializationError` and the message `Service <Name> initialization failed: <original message>`; the original is in `cause`. |
| `token.id`, `InjectionToken.create(name, schema, customId)` | Removed. `InjectionToken.create(name, schema?)` or `create(name, { schema?, scope? })`. `toString()` returns the name. |
| Zod-only schema types (`ZodObject`, `z.input<S>`), zod as a peer dependency | Any Standard Schema (`StandardSchemaV1`, `InferInput<S>`, `InferOutput<S>`). Zod still works and is no longer required. Args must validate synchronously. |
| `BaseInjectionTokenSchemaType`, `OptionalInjectionTokenSchemaType` | Removed. `InjectionTokenSchemaType` is `StandardSchemaV1`. |
| `FactoryInjectionToken#value`, `#resolved`, `#resolve()` | Removed. The value is cached per root container. |
| `container.getEventBus()` and event bus subscriptions, `container.calculateInstanceName()` | `container.onInvalidate(token, args, listener)` |
| `container.getStorage()`, `getRegistry()`, `getInstanceResolver()`, `getNameResolver()`, `getScopeTracker()`, `getServiceInitializer()`, `getTokenResolver()`, `getServiceInvalidator()` | Removed. `container.getProvider(token)` returns the provider that would be used for a token. |
| `getInjectors()`, `defaultInjectors`, `wrapSyncInit`, `provideFactoryContext`, `InjectableType` | Removed. |
| `DIErrorCode.FactoryTokenNotResolved`, `PriorityConflictError`, `StorageError`, `DependencyResolutionError` | Removed. |
| Separate browser entry and the `AsyncLocalStorage` polyfill | Removed. There is one build, and it does not use `AsyncLocalStorage`. |
| - | New: `container.getSync()`, `container.provide()`, `container.decorate()`, `provide()`, `registerInjectable()`, `registerFactory()`, `ContainerOptions.strict`, `DIErrorCode.ProviderConflict`, `AsyncInitRequired`, `ContainerDisposed`. |

Unchanged: `@Injectable({ scope, token, schema })`, `@Factory({ scope, token })`, `inject`, `asyncInject`, `optional`, `InjectionToken.bound`, `InjectionToken.factory`, `InjectionToken.refineType`, `onServiceInit` and `onServiceDestroy`, `container.get`, `invalidate`, `dispose`, `ready`, `tryGetSync`, `addInstance`, `isRegistered`, `InjectableScope`, `getInjectableToken`, the factory `create(ctx, args)` signature with `ctx.inject`, `ctx.container` and `ctx.addDestroyListener`, and `@navios/di/legacy-compat`.

## Common Changes

### 1. Registries and priorities become providers

Before:

```ts
const registry = new Registry()

@Injectable({ token: MailerToken, registry })
class SmtpMailer {}

@Injectable({ token: MailerToken, registry, priority: 100 })
class SesMailer {}

const container = new Container(registry)
```

After:

```ts
import { Container, Injectable, provide } from '@navios/di'

@Injectable({ token: MailerToken }) // the default
class SmtpMailer {}

@Injectable() // an alternative, not a second default
class SesMailer {}

const container = new Container({
  providers: [provide(MailerToken, SesMailer)],
})
```

A token accepts one default provider. If two classes declare the same token, the second one throws `ProviderConflict` when it is decorated. Remove `token` from the alternative and bind it with `provide()`.

A custom registry that existed only to isolate tests needs no replacement. Each `Container` has its own instances, and a class registered with `@Injectable()` can be resolved from any container.

To override a provider on an existing container, call `container.provide(token, impl)` before the token is first resolved there.

Code that re-registered a service with a higher priority to wrap it should use `container.decorate()`:

```ts
container.decorate(HttpClient, (client) => withTracing(client))
```

### 2. Request contexts become scopes

Before:

```ts
const scoped = container.beginRequest('req-123', { userId: 456 })
try {
  const handler = await scoped.get(RequestHandler)
  await handler.run()
} finally {
  await scoped.endRequest()
}
```

After:

```ts
{
  await using scope = container.createScope({ userId: 456 })
  const handler = await scope.get(RequestHandler)
  await handler.run()
}
```

Or, without `await using`:

```ts
const scope = container.createScope({ userId: 456 })
try {
  const handler = await scope.get(RequestHandler)
  await handler.run()
} finally {
  await scope.dispose()
}
```

Scopes have no id. If you need a request id, keep it in the metadata or add it to the scope as a value:

```ts
const REQUEST_ID = InjectionToken.create<string>('RequestId', { scope: InjectableScope.Request })

scope.addInstance(REQUEST_ID, 'req-123')
```

### 3. Scope mismatches are errors

Before, this singleton was silently turned into a request-scoped service:

```ts
@Injectable({ scope: InjectableScope.Request })
class RequestState {}

@Injectable()
class AuditService {
  private readonly state = inject(RequestState)
}
```

After, resolving `AuditService` fails:

```
Scope mismatch: RequestState is request-scoped and cannot be resolved from the root container
(AuditService -> RequestState). Resolve it from a scope created with container.createScope(),
and do not inject it into a singleton.
```

The check also applies through a transient. Declare what the old version did implicitly:

```ts
@Injectable({ scope: InjectableScope.Request })
class AuditService {
  private readonly state = inject(RequestState)
}
```

If the service has to stay a singleton, pass the request-scoped object to its methods instead of injecting it.

### 4. `inject()` works for transients; `asyncInject()` is for cycles

Before:

```ts
@Injectable()
class ReportService {
  private readonly builder = asyncInject(QueryBuilder) // transient

  async run() {
    const builder = await this.builder
    return builder.build()
  }
}
```

After:

```ts
@Injectable()
class ReportService {
  private readonly builder = inject(QueryBuilder)

  run() {
    return this.builder.build()
  }
}
```

Each `inject()` call of a transient returns its own instance. Existing `asyncInject()` calls keep working; they are only needed to break a circular dependency.

### 5. `optional()` no longer hides errors

Before, `optional(Service)` returned `null` when `Service` failed to construct. After, it returns `null` only when nothing provides the token, and a failing constructor throws.

If code relied on `optional()` to tolerate a failing service, handle the failure where it happens, for example inside the service's `onServiceInit()`, or resolve the service with `container.get()` in a `try` block.

### 6. Tokens have no ids, and schemas are Standard Schema

Before:

```ts
import type { z, ZodObject } from 'zod/v4'

const TOKEN = InjectionToken.create<Service, typeof schema>('Service', schema, 'custom-id')
console.log(TOKEN.id)

function register<S extends ZodObject>(schema: S, args: z.input<S>) {}
```

After:

```ts
import type { InferInput, StandardSchemaV1 } from '@navios/di'

const TOKEN = InjectionToken.create<Service, typeof schema>('Service', schema)

function register<S extends StandardSchemaV1>(schema: S, args: InferInput<S>) {}
```

A token is identified by the object. Code that looked services up by `token.id` or by a name string must hold on to the token itself. Two tokens created with the same name are different tokens.

Existing zod schemas work unchanged. A schema with asynchronous validation, such as an async refinement, is rejected with `TokenValidationError`; validate such input before resolving the token.

### 7. Internal accessors and the event bus are gone

Before:

```ts
const name = container.calculateInstanceName(UserService, args)
const unsubscribe = container.getEventBus().on(name, 'destroy', listener)
```

After:

```ts
const unsubscribe = container.onInvalidate(UserService, args, listener)
```

The storage, registry, resolver and tracker accessors have no public replacement. To ask which implementation a container would use for a token, call `container.getProvider(token)`; it returns a record with `kind`, `scope` and `target`.

### 8. Errors from constructors are always wrapped

An error that is not a `DIError` and is thrown by a constructor, a factory or `onServiceInit()` now always reaches the caller as a `DIError`:

```ts
const error = await container.get(Broken).catch((e) => e)

expect(error.code).toBe(DIErrorCode.InitializationError)
expect(error.message).toBe('Service Broken initialization failed: boom')
expect(error.cause).toBe(originalError)
```

A test that compared the rejection with the original error by identity must read `error.cause`. The message still contains the original message, so assertions such as `rejects.toThrow('boom')` keep passing. A `DIError` thrown by a nested dependency propagates unchanged.

## Behaviour Changes to Check

- **Constructors run once.** Code that compensated for double construction, such as guards against running twice, can be removed. Constructors should still be free of side effects, because the first build of a class is replayed once when a dependency has an unfinished asynchronous `onServiceInit()`.
- **Do not read injected services in a constructor.** In a replayed pass a dependency that is not ready is a placeholder. Move such code to `onServiceInit()`.
- **Singletons are built against the root container.** A value added to a scope with `scope.addInstance()` is not visible to a singleton, even when the singleton is first requested through that scope.
- **Factory token values are per container.** A `FactoryInjectionToken` used to cache its value on the token, shared by all containers. Each root container now computes it once.
- **Transients resolved directly from the root container are not tracked.** Their `onServiceDestroy()` is not called by `dispose()`. Transients injected into a service are destroyed with it, and transients resolved from a scope are destroyed with the scope.
- **Falsy values are injected as they are.** A token bound to `0`, `''`, `false` or `null` resolves to that value.
- **Classes with identical source are distinct.** Token ids derived from the class source are gone, so two classes produced by the same function no longer collide.

## Testing

- Replace `new Container(new Registry())` with `new Container()`.
- Replace priority-based overrides with `new Container({ providers: [provide(Token, Mock)] })` or `TestContainer#bind()`.
- `TestContainer` and `UnitTestContainer` keep their API. `UnitTestContainer` is a strict container: only its `providers` can be resolved.
- Tests that asserted removed behaviour (priorities, scope upgrade, request ids, token ids, "Wrong token order", double construction) should be deleted.
