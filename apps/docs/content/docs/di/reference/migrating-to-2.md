---
title: Migrating to 2.0
---

# Migrating to 2.0

Version 2.0 replaces the resolution engine of `@navios/di`. Resolution is synchronous first, a token is identified by the object, the global registry and priorities give way to explicit providers, and a service is always built in the scope it declares. This page lists every public change from 1.x and shows the ones most applications meet.

Server applications should read [Migrating to 2.0](/docs/server/reference/migrating-to-2) for the framework changes; this page covers only the container.

## What changed

| 1.x                                                                                              | 2.0                                                                                                        |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `new Container(registry, logger, injectors)`                                                     | `new Container({ providers?, strict?, logger? })`                                                          |
| `Registry`, `globalRegistry`, the `registry` option of `@Injectable` and `@Factory`              | Removed. Isolation comes from using a new `Container`                                                      |
| The `priority` option, `registry.getAll()`, override by priority                                 | Removed. Use [`provide()`](/docs/di/essentials/providers#provide)                                          |
| A second `@Injectable({ token })` for one token                                                  | Throws `ProviderConflict` at decoration, unless the class has the same name as the current default         |
| `container.beginRequest(id, metadata)`                                                           | `container.createScope(metadata?)`. Scopes have no ids                                                     |
| `scoped.endRequest()`, `scoped.getParent()`                                                      | `scoped.dispose()` or `await using`; `scoped.parent`                                                       |
| `container.tryGetSync(token)`                                                                    | `container.peek(token)`, with an inferred result                                                           |
| A disposed container could be used again                                                         | Throws `ContainerDisposed`. `clear()` of the testing containers leaves them usable                          |
| `DIErrorCode.FactoryNotFound`                                                                    | `DIErrorCode.ProviderNotFound`                                                                             |
| `DIErrorCode.InstanceNotFound`, `InstanceDestroying`, the static creators of `DIError`           | Removed                                                                                                    |
| `EventEmitter`, `EventsConfig`, `EventsNames`, `EventsArgs`                                      | Removed. Use the event emitter of your platform or a library                                               |
| `Join`, `UnionToIntersection`, `UnionToOvlds`, `PopUnion`, `IsUnion`, `UnionToArray`, `InjectableTokenMeta`, the `ClassTypeWith…` types except `ClassTypeWithInstance` | Removed                              |
| `container.getActiveRequestIds()`, `container.hasActiveRequest()`, `scoped.getRequestId()`       | Removed. The container does not track its scopes                                                           |
| Using a disposed scope threw `Error`                                                             | Throws `DIError` with code `ContainerDisposed`                                                             |
| A singleton that injected a request-scoped service silently became request-scoped                | `DIError` with code `ScopeMismatchError`                                                                   |
| `inject(TransientService)` was an error                                                          | Returns a new instance for each call                                                                       |
| Conditional `inject()` threw "Wrong token order"                                                 | Allowed                                                                                                    |
| `inject()` in a lifecycle hook or a method                                                       | Throws `OutsideInjectionContext`. Inject in a field, or inject the [`Container`](/docs/di/essentials/services#inject) and resolve later |
| A constructor ran twice when a dependency was not created yet                                    | Runs once, except in the cases described under [constructor replay](/docs/di/how-it-works#constructor-replay) |
| `optional()` returned `null` on any failure                                                      | Returns `null` only when nothing provides the token. Other errors propagate                                |
| Errors from constructors and `onServiceInit` were wrapped on some code paths                     | Always a `DIError` with code `InitializationError`; the original is in `cause`                             |
| `token.id`, `InjectionToken.create(name, schema, customId)`                                      | Removed. `create(name, schema?)` or `create(name, { schema?, scope? })`. `toString()` returns the name     |
| Zod-only schema types, `zod` as a peer dependency                                                | Any Standard Schema: `StandardSchemaV1`, `InferInput<S>`, `InferOutput<S>`. Arguments validate synchronously |
| `BaseInjectionTokenSchemaType`, `OptionalInjectionTokenSchemaType`                               | Removed, like `InjectionTokenSchemaType`. Use `StandardSchemaV1`                                           |
| `FactoryInjectionToken#value`, `#resolved`, `#resolve()`                                         | Removed. The value is cached per root container                                                            |
| `container.getEventBus()` (the lifecycle event bus), `container.calculateInstanceName()`         | [`container.onInvalidate()`](/docs/di/guides/invalidation#oninvalidate)                                    |
| `container.getStorage()`, `getRegistry()`, `getInstanceResolver()`, `getNameResolver()`, `getScopeTracker()`, `getServiceInitializer()`, `getTokenResolver()`, `getServiceInvalidator()` | Removed. `container.getProvider(token)` answers which provider would be used |
| `getInjectors()`, `defaultInjectors`, `wrapSyncInit`, `provideFactoryContext`, `InjectableType`  | Removed                                                                                                    |
| `DIErrorCode.FactoryTokenNotResolved`, `PriorityConflictError`, `StorageError`, `DependencyResolutionError` | Removed                                                                                         |
| A separate browser entry with an `AsyncLocalStorage` polyfill                                    | Removed. There is one build and it does not use `AsyncLocalStorage`                                        |

New in 2.0: `provide()` with `{ existing }` [aliases](/docs/di/essentials/providers#aliases), [`registerProvider()`](/docs/di/essentials/providers#registerprovider), `inject(ScopedContainer)`, `container.provide()` and `container.decorate()` (both throw once the token is resolved), `container.getSync()`, `container.instances()`, `container.onInvalidate()`, `container.getProvider()`, `registerInjectable()`, `registerFactory()`, `ContainerOptions.strict`, tokens that declare a scope, `Symbol.asyncDispose` on containers and scopes, and the error codes `ProviderConflict`, `AsyncInitRequired`, `ContainerDisposed`, `OutsideInjectionContext` and `AccessBeforeInit`.

Unchanged: `@Injectable({ scope, token, schema })`, `@Factory({ scope, token })`, `inject`, `asyncInject`, `optional`, `InjectionToken.bound`, `InjectionToken.factory`, `InjectionToken.refineType`, the lifecycle hooks, `container.get`, `invalidate`, `dispose`, `ready`, `addInstance`, `isRegistered`, `InjectableScope`, `getInjectableToken`, the `create(ctx, args)` signature of factories, and the `@navios/di/legacy-compat` entry point.

## Registries and priorities become providers

```ts
// 1.x
const registry = new Registry()

@Injectable({ token: MAILER, registry })
class SmtpMailer {}

@Injectable({ token: MAILER, registry, priority: 100 })
class SesMailer {}

const container = new Container(registry)
```

```ts
// 2.0
import { Container, Injectable, provide } from '@navios/di'

@Injectable({ token: MAILER }) // the default
class SmtpMailer {}

@Injectable() // an alternative, not a second default
class SesMailer {}

const container = new Container({
  providers: [provide(MAILER, SesMailer)],
})
```

A token accepts one default. Remove `token` from every alternative and bind the one you want with `provide()`.

A custom registry that existed only to isolate tests needs no replacement: each `Container` has its own instances. Code that re-registered a service with a higher priority in order to wrap it should use [`container.decorate()`](/docs/di/essentials/providers#decorating-instances).

## Request contexts become scopes

```ts
// 1.x
const scoped = container.beginRequest('req-123', { userId: 456 })
try {
  const handler = await scoped.get(RequestHandler)
  await handler.run()
} finally {
  await scoped.endRequest()
}
```

```ts
// 2.0
{
  await using scope = container.createScope({ userId: 456 })
  const handler = await scope.get(RequestHandler)
  await handler.run()
}
```

A `try`/`finally` with `scope.dispose()` works too. Scopes have no id; if you need one, add it to the scope as a [value](/docs/di/essentials/scopes#values-supplied-per-scope).

## Scope mismatches are errors

In 1.x this singleton was turned into a request-scoped service without notice:

```ts
@Injectable({ scope: InjectableScope.Request })
class RequestState {}

@Injectable()
class AuditService {
  private readonly state = inject(RequestState)
}
```

In 2.0 resolving `AuditService` fails with `ScopeMismatchError`. To keep the old behaviour, declare it: `@Injectable({ scope: InjectableScope.Request })` on `AuditService`. [Scopes](/docs/di/essentials/scopes#scopemismatcherror) lists the other options.

## inject works for transients

```ts
// 1.x
@Injectable()
class ReportService {
  private readonly builder = asyncInject(QueryBuilder) // transient

  async run() {
    const builder = await this.builder
    return builder.build()
  }
}
```

```ts
// 2.0
@Injectable()
class ReportService {
  private readonly builder = inject(QueryBuilder)

  run() {
    return this.builder.build()
  }
}
```

Existing `asyncInject()` calls keep working. They are only needed to [break a cycle](/docs/di/guides/circular-dependencies#breaking-a-cycle-with-asyncinject).

## Tokens have no ids

```ts
// 1.x
const TOKEN = InjectionToken.create<Service, typeof schema>('Service', schema, 'custom-id')
registryByName.set(TOKEN.id, handler)

function register<S extends ZodObject>(schema: S, args: z.input<S>) {}
```

```ts
// 2.0
import type { InferInput, StandardSchemaV1 } from '@navios/di'

const TOKEN = InjectionToken.create<Service, typeof schema>('Service', schema)
registryByToken.set(TOKEN, handler)

function register<S extends StandardSchemaV1>(schema: S, args: InferInput<S>) {}
```

Code that looked services up by `token.id` or by a name string has to hold on to the token object. Two tokens created with the same name are different tokens. Existing Zod schemas work unchanged, except those that validate asynchronously.

## Instance names and the event bus are gone

```ts
// 1.x
const name = container.calculateInstanceName(UserService, args)
const unsubscribe = container.getEventBus().on(name, 'destroy', listener)
```

```ts
// 2.0
const unsubscribe = container.onInvalidate(UserService, args, listener)
```

The storage, registry, resolver and tracker accessors have no public replacement.

## Behaviour to check

- **Errors are wrapped.** A test that compared a rejection with the original error by identity must read `error.cause`. The message still contains the original message, so `rejects.toThrow('boom')` keeps passing.
- **`optional()` no longer hides failures.** If code relied on it to tolerate a service that fails to construct, handle the failure inside the service or resolve it with `container.get()` in a `try` block.
- **Constructors run once.** Guards against double construction can be removed. Constructors should still be free of side effects and should not use injected services; see [constructor replay](/docs/di/how-it-works#constructor-replay).
- **Singletons are built against the root container.** A value added with `scope.addInstance()` is not visible to a singleton, even when the singleton is first requested through that scope.
- **Factory token values are per container.** They used to be cached on the token and shared by all containers.
- **A disposed container is closed.** Code that used one again has to create a new `Container`.
- **Implementations are type-checked.** `provide()`, `addInstance()` and the testing containers reject what lacks public members of the target. A partial mock needs a cast.
- **A value for a request-scoped token belongs to a scope.** `addInstance()` on the root container fails with `ScopeMismatchError` for it.
- **`create()` makes a factory only with a `FactoryContext` first, or without parameters.** That is how types are inferred; a service whose `create()` takes its own data is no longer typed as a factory.
- **Errors carry no arguments.** `context` of a `TokenValidationError` is `{ name, issues: { path, message }[] }`, without the schema and the value.
- **Destroy errors are printed.** Without a `logger`, what `onServiceDestroy()` throws goes to `console.error()`.
- **Root-level transients are not tracked.** A transient resolved directly from the root container no longer has `onServiceDestroy` called by `dispose()`.
- **Arguments that are `undefined` count as absent.** `{ id, opt: undefined }` and `{ id }` are one instance, and dates, maps, sets and URLs are compared by value.
- **Falsy values are injected as they are.** A token bound to `0`, `''`, `false` or `null` resolves to that value.
- **Classes with identical source are distinct.** Token ids derived from class source are gone, so two classes produced by the same function no longer share an instance.

## Tests

- Replace `new Container(new Registry())` with `new Container()`.
- Replace priority-based overrides with `new Container({ providers: [provide(Token, Mock)] })` or `TestContainer#bind()`.
- A value bound for a request-scoped token is served by scopes only.
- `TestContainer` has no `parentRegistry` option. `clear()` keeps what was bound, and the factory given to `toFactory()` receives the factory context and the arguments.
- `UnitTestContainer` is a strict container: only its `providers` resolve. `getRegisteredTokenIds()` and `getAutoMockedTokenIds()` are `getRegisteredTokens()` and `getAutoMockedTokens()`, which hold the tokens. `useFactory` receives the context and the arguments.
- `clear()` leaves both usable; `dispose()` closes them.
- Delete tests that asserted removed behaviour: priorities, scope upgrade, request ids, token ids, "Wrong token order", double construction.
