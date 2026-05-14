# @navios/di v2 — Overhaul Design

**Status:** approved
**Date:** 2026-05-15
**Scope:** `packages/di`, downstream rewrites in `packages/{core,di-react,jwt,microservice,otel,otel-bun,otel-fastify}` and their tests.

## Goals

1. **Simpler injection model** — class fields with explicit decorators. No class-body magic, no double-construction, no throw-proxy.
2. **First-class extension points** — lifecycle hooks plus a middleware pipeline so OTEL, request logging, profiling, and auth context are short plugins instead of priority-juggling registrations.
3. **Smaller public surface** — collapse three token classes, hide eight internal components behind one namespace, drop the dynamic scope-upgrade machinery.
4. **Validator-agnostic** — Standard Schema instead of hard-baked Zod v4.

## Breaking changes (no shims, no `legacy-compat/`)

| Removed | Replaced by |
|---|---|
| `inject()` / `asyncInject()` / `optional()` / `wrapSyncInit` / `provideFactoryContext` | `@Inject` / `@InjectLazy` / `@InjectOptional` / `@InjectDerived` field decorators |
| `BoundInjectionToken` / `FactoryInjectionToken` classes | `Token.bind(value)` / `Token.fromFactory(fn)` methods on a unified `Token` |
| `InjectionToken` (renamed) | `Token` |
| `Container.getStorage()` / `getServiceInitializer()` / 6 more top-level getters | `container.internals.*`, marked `@internal` |
| Runtime scope upgrades (`ScopeTracker`, ~215 lines) | Hard error at first resolution: *"X is Singleton but depends on Y (Request). Mark X as Request or use `@InjectLazy`."* |
| Zod v4-locked schemas | Any Standard Schema v1 validator |
| `packages/di/src/legacy-compat/` | Deleted |

## What stays

- `@Injectable` and `@Factory` as two decorators (distinct mental models: "is a service" vs "creates a service").
- Three scopes: `Singleton | Transient | Request`.
- `Container` + `ScopedContainer` two-class design, extending `AbstractContainer`.
- `OnServiceInit` / `OnServiceDestroy` interfaces.
- `TestContainer` / `UnitTestContainer` testing utilities (surface tweaks only).
- Global registry as default.
- `LifecycleEventBus` for per-instance `destroy` subscriptions (used by `di-react`'s `useService`).

## New API surface

### Defining services

```ts
import {
  Injectable,
  Factory,
  Inject,
  InjectLazy,
  InjectOptional,
  InjectDerived,
  InjectableScope,
} from '@navios/di'

@Injectable()
class DatabaseService {
  @Inject(ConfigToken) private config!: Config
  @Inject(Logger) private logger!: Logger
}

@Injectable({ scope: InjectableScope.Request })
class RequestContext {
  @InjectOptional(UserService) private user!: UserService | null
  @InjectLazy(MetricsService) private metrics!: Promise<MetricsService>
}

@Factory()
class DbConnectionFactory implements Factorable<Connection> {
  @Inject(ConfigToken) private config!: Config

  async create(ctx: FactoryContext): Promise<Connection> {
    const conn = await pg.connect(this.config.dbUrl)
    ctx.onDestroy(() => conn.close())
    return conn
  }
}
```

### Args-dependent deps (`@InjectDerived`)

Replaces the v1 pattern of calling `inject(Dep, { …args… })` inside the constructor where `args` are runtime values.

```ts
import { z } from 'zod' // any Standard Schema validator

const myServiceSchema = z.object({ dbUrl: z.string() })

@Injectable({ schema: myServiceSchema })
class MyService {
  @InjectDerived(Database, (args: z.output<typeof myServiceSchema>) => ({ url: args.dbUrl }))
  private db!: Database

  constructor(args: z.output<typeof myServiceSchema>) {}
}
```

The callback receives the host class's validated args at resolution time and returns the input for the dependency's schema. Distinct decorator name (matches the project's explicit-name preference), distinct metadata kind in the resolver, cleaner TS errors than an overloaded `@Inject`.

### Behavior rules for `@Inject*` decorators

- `@Inject(Token)` — resolved eagerly before construction. Field populated by the time the constructor runs. Throws at startup if the dependency's scope is incompatible (Singleton→Request, or Singleton→Transient where the dep is eager).
- `@InjectLazy(Token)` — field holds `Promise<T>` reaching out to the container on first await. Use for circular deps and Transient deps from Singletons.
- `@InjectOptional(Token)` — field holds `T | null`. Null if the dep is not registered or fails to construct.
- `@InjectDerived(Token, (ownArgs) => depArgs)` — eager, but with args computed from the host class's instance-time args.

Combinations (e.g. lazy + optional) are explicit separate decorators when needed; we are not introducing options bags.

### Tokens

```ts
import { Token } from '@navios/di'

const Logger = Token.create<ILogger>('Logger')

const ConfigToken = Token.create<Config>(
  'Config',
  z.object({ host: z.string(), port: z.number() }),
)

const DevConfig = ConfigToken.bind({ host: 'localhost', port: 5432 })

const ProdConfig = ConfigToken.fromFactory(async (ctx) => {
  const env = await ctx.inject(EnvironmentService)
  return { host: env.DB_HOST, port: Number(env.DB_PORT) }
})

await container.get(ConfigToken, { host: 'localhost', port: 5432 })
await container.get(DevConfig)
await container.get(ProdConfig)
```

`Token.bind()` and `Token.fromFactory()` return narrowed `Token<T, S>` subtypes — same class hierarchy as today, but reached via methods instead of three top-level exports.

### Container

```ts
const container = new Container({
  registry?: Registry,        // default: globalRegistry
  logger?: Console,
  plugins?: Plugin[],
})

await container.get(SomeService)
await container.get(SomeToken, args)
await container.invalidate(instance)
await container.dispose()
container.use(plugin)
container.beginRequest(id, metadata?)  // returns ScopedContainer

// Internals — @internal, not part of the public type, available for plugin authors:
container.internals.registry
container.internals.storage
container.internals.eventBus
container.internals.resolver
// (other 4 components live here too — no top-level getters)
```

Public method count shrinks from ~20 to ~7. `Container.get()` overload set drops from 7 to 3 (class type, token, args-required schema-error case).

## Plugin & lifecycle architecture

### Plugin shape

```ts
interface Plugin {
  name: string

  // Fire-and-forget observers. Run in registration order. Return value ignored.
  onBeforeCreate?(ctx: CreateContext): void | Promise<void>
  onAfterCreate?(ctx: CreateContext, instance: unknown): void | Promise<void>
  onBeforeDestroy?(ctx: DestroyContext, instance: unknown): void | Promise<void>
  onAfterDestroy?(ctx: DestroyContext): void | Promise<void>
  onContainerDispose?(container: Container): void | Promise<void>

  // Transformation, has next(). Composed Koa-style (outermost wraps innermost).
  middleware?(ctx: CreateContext, next: () => Promise<unknown>): Promise<unknown>
}

interface CreateContext {
  readonly token: Token<unknown>
  readonly target: ClassType
  readonly scope: InjectableScope
  readonly args: unknown
  readonly instanceName: string
  readonly container: IContainer
  readonly requestId?: string
}
```

`definePlugin(plugin: Plugin): Plugin` is a typed pass-through helper for ergonomics.

### Resolution pipeline

```
container.get(Token, args)
  │
  ├─ validate args against schema (if any)
  ├─ resolve to concrete class via Registry
  ├─ check storage for existing holder ──► return cached
  │
  ├─ fire onBeforeCreate hooks (awaited)
  ├─ run middleware chain:
  │     mw1 ──► mw2 ──► mw3 ──► (core: resolve deps + construct + assign fields + onServiceInit)
  │      ▲                            │
  │      └────────── wraps ───────────┘
  │
  ├─ store instance, register dependents
  ├─ fire onAfterCreate hooks (awaited)
  └─ return instance
```

Middleware runs around every `.get()`. For singletons this is once-per-instance because subsequent gets hit the cache before middleware. For transients it runs every time. Plugins are global to the container — match logic lives inside each middleware (`if (!hasTracedMetadata(ctx.target)) return next()`), no built-in `match` filter.

### OTEL plugin in v2

```ts
import { definePlugin } from '@navios/di'
import { TracedProxyFactory, hasTracedMetadata } from '@navios/otel/internals'

export const otelPlugin = (opts: OtelOptions) => definePlugin({
  name: 'otel-tracing',
  async middleware(ctx, next) {
    const instance = await next()
    if (!hasTracedMetadata(ctx.target)) return instance
    const factory = await ctx.container.get(TracedProxyFactory)
    return factory.wrap(instance, ctx.target)
  },
})

// Usage
const container = new Container({ plugins: [otelPlugin({})] })
```

Replaces ~120 lines (`defineOtelTracingPlugin` + `createTracedWrapperFactory` + `pre:adapter-resolve` hook in `@navios/core` + the synthesized `:original`-token + priority-juggling). The `LifecycleEventBus` remains the dynamic-subscription layer for instance-level subscribers (e.g. `di-react`'s `useService`); plugins are the static-registration layer for container-wide policy.

## Internal architecture

| Component | v2 status |
|---|---|
| `Container` / `ScopedContainer` / `AbstractContainer` | Keep. Slim public surface, internals namespace. |
| `Registry` | Keep. `updateScope()` removed. |
| `Token` | Renamed from `InjectionToken`. Absorbs `BoundInjectionToken` + `FactoryInjectionToken` as `.bind()` / `.fromFactory()` subtypes. |
| `UnifiedStorage` | Keep. |
| `InstanceHolder` / `InstanceStatus` | Keep. |
| `ServiceInitializer` | Major rewrite. One-pass resolution: reads `@Inject*` metadata, resolves eager deps in parallel, constructs class once, assigns fields, runs `onServiceInit`. No `wrapSyncInit`, no frozen-replay, no proxy. |
| `InstanceResolver` | Simplify. Lose request-scope-upgrade branches. Run plugin middleware chain around `serviceInitializer.instantiateService`. |
| `ServiceInvalidator` | Keep. |
| `LifecycleEventBus` | Keep. |
| `TokenResolver` | Simplify. One fewer token type. |
| `NameResolver` | Lose `upgradeInstanceNameToRequest`. |
| `CircularDetector` | Keep. |
| `PluginRegistry` | **New.** Holds registered plugins, builds middleware chain, dispatches hooks. |
| `ScopeTracker` | **Delete.** ~215 lines gone. |
| `get-injectors` / `default-injectors` | **Delete.** Context-injection functions replaced by field decorators. |
| `legacy-compat/` | **Delete** entire directory. |
| `event-emitter.mts` (user-facing `EventEmitter`) | Keep unchanged. |

### Instantiation algorithm (v1 → v2)

**v1:**
1. Run constructor inside `wrapSyncInit`; `inject()` returns a throw-proxy and queues a request.
2. Collect promises pushed by `inject()` calls.
3. `await Promise.allSettled` of those.
4. **Re-run constructor** in frozen-replay mode — `inject()` returns cached values by index.
5. If any deps were transient + sync-injected, fail with a confusing message.

**v2:**
1. Read `@Inject*` metadata from the class (collected at decoration time into a `WeakMap`).
2. Validate scope compatibility against current host scope (memoized, once per class).
3. Resolve all `@Inject` and `@InjectDerived` deps in parallel via `Promise.all`. Build `Promise<T>` for `@InjectLazy`. Attach `.catch(() => null)` for `@InjectOptional`.
4. `new target(args)` — runs **once**.
5. Assign each resolved dep to its field (via accessor decorator's per-instance map, or by writing to the named field).
6. `await instance.onServiceInit?.()`.

### Scope compatibility check (replaces `ScopeTracker`)

At first resolution of any class, walk its `@Inject*` metadata, look up each dep's scope, then:
- Singleton + dep is Request, kind is `@Inject` or `@InjectDerived` → `DIError.scopeMismatch` ("mark X as Request or wrap in `@InjectLazy`").
- Singleton + dep is Transient, kind is `@Inject` or `@InjectDerived` → `DIError.scopeMismatch` ("use `@InjectLazy` for transient dependencies").
- `@InjectLazy` always OK (deferred resolution).
- `@InjectOptional` always OK (null-safe).
- Otherwise OK.

Memoized via `WeakMap<ClassType, true>` so steady-state cost is zero.

## Testing utilities

- `TestContainer.mockInject(targetClass, fieldName, value)` — new helper, sets a field directly without registry binding. Unit-test services in isolation without registering token-level fakes.
- `UnitTestContainer` — auto-mocking becomes the **default**; `new UnitTestContainer({ strict: true })` to opt out. Current strict-by-default surprises most users.
- `recordMethodCall` / `expectCalled*` / `bind().to{Value,Class,Factory}()` — unchanged.

`@navios/di-react`'s `useService` simplifies — `tryGetSync` is now sound (no throw-proxy to guard), so the dual sync-try / async-fallback dance compresses. Estimated reduction: ~210 → ~80 LOC.

## Migration map (v1 → v2)

| v1 | v2 |
|---|---|
| `private foo = inject(Foo)` | `@Inject(Foo) private foo!: Foo` |
| `private foo = inject(Foo, args)` (static `args`) | `@Inject(Foo, args) private foo!: Foo` |
| `inject(Foo, { …constructorArgs })` inside constructor | `@InjectDerived(Foo, (a) => …) private foo!: Foo` |
| `private foo = asyncInject(Foo)` | `@InjectLazy(Foo) private foo!: Promise<Foo>` |
| `private foo = optional(Foo)` | `@InjectOptional(Foo) private foo!: Foo \| null` |
| `import { InjectionToken } from '@navios/di'` | `import { Token } from '@navios/di'` |
| `InjectionToken.create(…)` | `Token.create(…)` |
| `InjectionToken.bound(tok, val)` | `tok.bind(val)` |
| `InjectionToken.factory(tok, fn)` | `tok.fromFactory(fn)` |
| `container.getStorage()` (+ 7 siblings) | `container.internals.storage` (etc.) |
| Zod-only schemas | Standard Schema — existing zod schemas work unchanged |
| `@navios/otel` `defineOtelTracingPlugin` + `createTracedWrapperFactory` | One `definePlugin({ middleware })` |
| `legacy-compat/` imports | Deleted — Stage-3 decorators only |
| Implicit Singleton→Request upgrade | Explicit `scope: Request` or `@InjectLazy` |

Most rows are mechanical 1:1 transforms. A jscodeshift codemod is feasible for the field-decorator rewrites and should be written before touching consumer packages.

## Out of scope

- `@Module` decorator / NestJS-style module composition — revisit if isolation pain appears in v3.
- Backwards-compat shims — hard cut.
- Async constructors — `onServiceInit` remains the async-init seam.
- Removing `@Factory` — stays as the second decorator.

## Open follow-ups

- Decide naming for combination decorators (`@InjectLazyOptional`?) once a real use case appears; not introduced upfront.
- Decide whether `@InjectDerived`'s callback should be `async` to allow `await ctx.inject(...)` inside, or strictly sync. Lean: strict sync, but revisit if a real use case shows up.
- Whether `Token` should expose a Standard-Schema-typed assertion helper (`tok.assert(unknown): T`) — minor convenience, not blocking.
