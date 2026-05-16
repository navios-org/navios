# Navios DI

A powerful, type-safe dependency injection library for TypeScript applications. Navios DI v2 is a modern, **stage-3 decorator** based container with field-level injection, Standard-Schema validated tokens, a Koa-style plugin pipeline, request scoping, factories, and a rich testing toolkit.

> **v2 at a glance.** Injection is done exclusively with the **field decorators** `@Inject`, `@InjectLazy`, `@InjectOptional`, and `@InjectDerived` applied to `accessor` fields. The runtime helpers `inject()` / `asyncInject()` / `optional()` and the `InjectionToken` class from v1 are **gone**. See [Migrating from v1](#migrating-from-v1) for the full mapping.

## Features

- **Type-safe** — full TypeScript inference for tokens, schemas, and resolved instances
- **Stage-3 field decorators** — `@Inject` / `@InjectLazy` / `@InjectOptional` / `@InjectDerived` on `accessor` fields
- **Standard-Schema tokens** — `Token`, `BoundToken`, `FactoryToken` with schema-validated args
- **Scopes** — `Singleton`, `Transient`, `Request`
- **Explicit request scoping** — `Container.beginRequest()` → `ScopedContainer`, plus opt-in `ScopedContainer.resolveInScope()`
- **Plugin pipeline** — `definePlugin` with observer hooks and Koa-style `middleware`
- **Lifecycle hooks** — `OnServiceInit` / `OnServiceDestroy`
- **Factories** — `@Factory` classes with a `create()` method
- **Priority system** — multiple registrations per token, highest priority wins
- **Testing** — `TestContainer` / `UnitTestContainer` from `@navios/di/testing`

## Installation

```bash
yarn add @navios/di
# or
npm install @navios/di
```

v2 requires a runtime/toolchain with **stage-3 decorators and decorator metadata** (`Symbol.metadata`). TypeScript 5.2+ with `"useDefineForClassFields": true` (the default for modern targets), or a Babel/SWC setup with the stage-3 decorators + decorator-metadata transforms.

## Quick Start

```typescript
import { Container, Inject, Injectable } from '@navios/di'

@Injectable()
class DatabaseService {
  async connect() {
    return 'Connected to database'
  }
}

@Injectable()
class UserService {
  // Field injection. The accessor keyword and the `!` are REQUIRED.
  @Inject(DatabaseService)
  private accessor db!: DatabaseService

  async getUsers() {
    const connection = await this.db.connect()
    return `Users from ${connection}`
  }
}

const container = new Container()
const userService = await container.get(UserService)
console.log(await userService.getUsers()) // "Users from Connected to database"

await container.dispose()
```

The decorated field **must** be declared as `accessor name!: Type`. `@Inject` is a stage-3 accessor decorator and throws at decoration time if applied to a plain field, a method, or a parameter.

## Core Concepts

### `@Injectable`

Marks a class as resolvable by the container.

```typescript
import { Injectable, InjectableScope } from '@navios/di'

// Singleton (default) — one instance shared process-wide
@Injectable()
class SingletonService {}

// Transient — a fresh instance on every resolution
@Injectable({ scope: InjectableScope.Transient })
class TransientService {}

// Request-scoped — one instance per request scope (see ScopedContainer)
@Injectable({ scope: InjectableScope.Request })
class RequestService {}

// Custom token (see Tokens below)
@Injectable({ token: MyToken })
class TokenizedService {}

// Priority — when several classes register the same token, the
// highest priority wins (default priority is 0)
@Injectable({ priority: 100 })
class DefaultMailer {}

@Injectable({ priority: 200 }) // this one wins
class OverrideMailer {}
```

`@Injectable` options: `scope?`, `token?`, `schema?`, `registry?`, `priority?`. You cannot pass both `token` and `schema` (a token already carries its own schema).

#### Constructor arguments via `schema`

A schema makes the class take **one validated argument object** in its constructor. The container validates the args you pass to `get()` against the schema before constructing.

```typescript
import { Injectable } from '@navios/di'
import { z } from 'zod/v4'

const databaseConfigSchema = z.object({
  host: z.string(),
  port: z.number(),
})

@Injectable({ schema: databaseConfigSchema })
class DatabaseConfig {
  constructor(public readonly config: z.output<typeof databaseConfigSchema>) {}

  get connectionString() {
    return `${this.config.host}:${this.config.port}`
  }
}

const container = new Container()
const config = await container.get(DatabaseConfig, { host: 'localhost', port: 5432 })
console.log(config.connectionString) // "localhost:5432"
```

> In v2 a token's schema is always a [Standard Schema](https://standardschema.dev/) (zod v4, Valibot, ArkType, …). Presence of a schema means **args are required** — the v1 "args optional via `.optional()`" behavior is gone for the `get()` typing (passing an optional Zod schema is still accepted at runtime, but the typed overloads treat a schema as required).

### The four field decorators

All four are stage-3 **accessor** decorators. Always: `@DecoratorName(Token) accessor field!: Type`.

#### `@Inject` — eager injection

The dependency is resolved before the host's `onServiceInit` runs and assigned to the field. The scope-compatibility check is enforced: an eager `@Inject` of a `Request`- or `Transient`-scoped dependency from a `Singleton` host throws a `DIError` (use `@InjectLazy` instead).

```typescript
@Injectable()
class NotificationService {
  @Inject(EmailService)
  private accessor email!: EmailService

  notify(message: string) {
    return this.email.send(message)
  }
}
```

#### `@InjectLazy` — deferred / circular / cross-scope

The field is a `Promise<T>` that resolves the dependency on first `await`. Use it for circular dependencies and to safely depend on a narrower-scoped service from a wider-scoped host.

```typescript
@Injectable()
class ServiceA {
  @InjectLazy(ServiceB)
  private accessor serviceB!: Promise<ServiceB>

  async doSomething() {
    const b = await this.serviceB
    return b.getValue()
  }
}

@Injectable()
class ServiceB {
  @Inject(ServiceA)
  private accessor serviceA!: ServiceA

  getValue() {
    return 'value from B'
  }
}
```

#### `@InjectOptional` — null when unavailable

The field is `T | null`. If the dependency is not registered (or fails to resolve), the field is `null` instead of throwing.

```typescript
@Injectable()
class FeatureService {
  @InjectOptional(AnalyticsService)
  private accessor analytics!: AnalyticsService | null

  track(event: string) {
    this.analytics?.track(event)
  }
}
```

#### `@InjectDerived` — args derived from the host's own args

`@InjectDerived(token, derive)` resolves `token` with arguments computed from the host's (schema-validated) resolution args. This is the v2 replacement for the v1 in-constructor `inject(Token, { ...derivedFromArgs })` pattern. The `derive` callback receives the host's validated args and returns the args object for the dependency.

```typescript
import { Inject, InjectDerived, Injectable, Token } from '@navios/di'
import { z } from 'zod/v4'

export const queuePublisherOptionsSchema = z.object({
  messageDef: pubsubMessageConfigSchema,
  name: z.string().default('default'),
})

export const QueuePublisherToken = Token.create<
  QueuePublisher<any>,
  typeof queuePublisherOptionsSchema
>('QueuePublisher', queuePublisherOptionsSchema)

@Injectable({ token: QueuePublisherToken })
export class QueuePublisher<MessageDef> {
  // Derive the per-`name` QueueClient from THIS host's validated args.
  // QueueClientToken is a per-name singleton: same `name` => shared client.
  @InjectDerived(
    QueueClientToken,
    (hostArgs: z.infer<typeof queuePublisherOptionsSchema>) => ({ name: hostArgs.name }),
  )
  private accessor queueClient!: QueueClient

  constructor({ messageDef }: z.infer<typeof queuePublisherOptionsSchema>) {
    this.messageDef = messageDef
  }
}
```

(This is the real `@navios/queues` keystone pattern — see `packages/queues/src/services/queue-publisher.service.mts`.)

### Tokens

`Token` is the v2 identity object (renamed from v1's `InjectionToken`). It also produces `BoundToken` and `FactoryToken` via instance methods.

#### `Token.create`

```typescript
import { Token } from '@navios/di'
import { z } from 'zod/v4'

// String / symbol token, no schema
const LoggerToken = Token.create<Logger>('Logger')

// Class token (id derived from the class)
const ServiceToken = Token.create(MyService) // Token<MyService, undefined>

// Token with a Standard Schema — resolving it REQUIRES validated args
const configSchema = z.object({
  apiUrl: z.string(),
  timeout: z.number(),
})
const ConfigToken = Token.create<z.infer<typeof configSchema>, typeof configSchema>(
  'APP_CONFIG',
  configSchema,
)

@Injectable({ token: ConfigToken })
class ConfigService {
  constructor(private readonly config: z.output<typeof configSchema>) {}
  getApiUrl() {
    return this.config.apiUrl
  }
}

const container = new Container()
const config = await container.get(ConfigToken, {
  apiUrl: 'https://api.example.com',
  timeout: 5000,
})
```

`Token.create` overloads:

- `Token.create<T extends ClassType>(name: T): Token<InstanceType<T>, undefined>`
- `Token.create<T extends ClassType, S extends StandardSchemaV1>(name: T, schema: S): Token<InstanceType<T>, S, true>`
- `Token.create<T>(name: string | symbol): Token<T, undefined>`
- `Token.create<T, S extends StandardSchemaV1>(name: string | symbol, schema: S): Token<T, S>`

#### `BoundToken` — pre-bound args via `.bind()`

```typescript
const BoundConfig = ConfigToken.bind({
  apiUrl: 'https://api.example.com',
  timeout: 5000,
})

// No args needed — the value is already bound
const config = await container.get(BoundConfig)
```

#### `FactoryToken` — lazily-computed args via `.fromFactory()`

```typescript
const FactoryConfig = ConfigToken.fromFactory(async (ctx) => ({
  apiUrl: process.env.API_URL ?? 'https://api.example.com',
  timeout: Number(process.env.TIMEOUT ?? '5000'),
}))

const config = await container.get(FactoryConfig)
```

`Token` also exposes the static helpers `Token.bound(token, value)` and `Token.factory(token, factory)` (equivalent to `token.bind(value)` / `token.fromFactory(factory)`).

### `@Factory`

A factory class owns a `create()` method that produces the instance. Implement `Factorable<R>` (or `FactorableWithArgs<R, S>` when the token has a schema).

```typescript
import { Factory, Inject } from '@navios/di'
import type { Factorable, FactoryContext } from '@navios/di'

@Factory({ token: QueueClientToken })
class QueueClientFactory implements Factorable<QueueClient> {
  @Inject(QueueConfigServiceToken)
  private accessor configService!: QueueConfigService

  async create(ctx: FactoryContext): Promise<QueueClient> {
    const client = makeClient(this.configService.getConfig())
    await client.connect()
    // Register cleanup tied to this instance's lifetime
    ctx.addDestroyListener(async () => {
      await client.disconnect()
    })
    return client
  }
}

// Resolving the factory's token returns the CREATED value, not the factory
const client = await container.get(QueueClientToken)
```

`@Factory` options: `scope?`, `token?`, `registry?`, `priority?`. Factory fields are injected just like on `@Injectable` classes (`@Inject accessor`). Factories do not run lifecycle hooks on the produced value automatically — register cleanup via `ctx.addDestroyListener` as shown.

### Scopes & containers

`InjectableScope` has three members:

| Scope | Behavior |
|---|---|
| `Singleton` (default) | One instance shared across the container |
| `Transient` | A new instance every resolution |
| `Request` | One instance per request scope (a `ScopedContainer`) |

#### `Container`

```typescript
import { Container } from '@navios/di'

const container = new Container() // options bag — see below

const service = await container.get(MyService)
await container.invalidate(service) // drop it + dependents; recreated on next get
await container.ready()             // await pending operations
await container.dispose()           // tear everything down
```

`new Container(options?: ContainerOptions)` — **options bag** (the v1 positional `new Container(registry, logger)` is gone):

```typescript
interface ContainerOptions {
  registry?: Registry      // defaults to the globalRegistry
  logger?: Console | null  // diagnostics + plugin-error sink
  plugins?: Plugin[]       // registered in order at construction
}

const container = new Container({
  registry: customRegistry,
  logger: console,
  plugins: [metricsPlugin],
})
```

Resolving a `Request`-scoped service directly from `Container.get()` throws a scope-mismatch `DIError` — use a `ScopedContainer`.

#### `ScopedContainer` (request context)

```typescript
import { Container, Injectable, InjectableScope } from '@navios/di'

@Injectable({ scope: InjectableScope.Request })
class RequestLogger {
  log(msg: string) { /* ... */ }
}

const container = new Container()

// Begin a request — returns a ScopedContainer
const scope = container.beginRequest('req-123', { userId: 456 })

const logger = await scope.get(RequestLogger) // request-scoped instance

// Per-request metadata
scope.setMetadata('correlationId', 'abc-123')
scope.getMetadata('correlationId')   // 'abc-123'
scope.getRequestId()                 // 'req-123'

// End the request — disposes all request-scoped instances
await scope.endRequest()             // dispose() is an alias
```

`Container.beginRequest(requestId: string, metadata?: Record<string, any>): ScopedContainer`. Singleton/transient resolutions made through a `ScopedContainer` delegate to the parent `Container`; only `Request`-scoped services live in the scope's own storage.

#### `ScopedContainer.resolveInScope` — explicit opt-in request resolution

v2 **deleted** the v1 implicit Singleton→Request scope-upgrade (it silently mutated a shared global registration and had a concurrency race). Its deliberate, opt-in, non-mutating successor is `ScopedContainer.resolveInScope()`:

```typescript
const scope = container.beginRequest('req-1')

// Resolve a Singleton-declared class AS IF it were Request-scoped,
// for THIS resolution only, inside this scope.
const controller = await scope.resolveInScope(SomeController)

await scope.endRequest() // controller is disposed here
```

`resolveInScope<T>(token, args?): Promise<T>` (same overloads as `get`). The instance is created and cached in **this** ScopedContainer's own request storage and disposed at `endRequest()`; it is **never** written to parent/global singleton storage. The token's registered scope and every shared registration are unchanged — any other `container.get()` / `scope.get()` of the same token keeps its declared scope. It is idempotent within a request and isolated across requests. Use it when a class is declared `Singleton` but must be resolved per-request because it eagerly depends on `Request`-scoped state.

### Lifecycle hooks

```typescript
import { Injectable } from '@navios/di'
import type { OnServiceDestroy, OnServiceInit } from '@navios/di'

@Injectable()
class DatabaseService implements OnServiceInit, OnServiceDestroy {
  private connection: Connection | null = null

  async onServiceInit() {
    this.connection = await connect()
  }

  async onServiceDestroy() {
    await this.connection?.close()
  }
}
```

`onServiceInit()` runs after the instance is constructed and its eager `@Inject` fields are assigned. `onServiceDestroy()` runs on `invalidate()` / `dispose()` / `endRequest()`. Both may be sync or async.

### Plugins

Plugins are the container-wide policy layer. A plugin has a `name`, optional **observer hooks**, and an optional Koa-style **`middleware`**.

```typescript
import { Container, definePlugin } from '@navios/di'

const timingPlugin = definePlugin({
  name: 'timing',

  // Observer hooks: run in registration order, awaited sequentially,
  // return value ignored. Errors are ISOLATED + reported (never abort
  // resolution). Use middleware if you must affect/abort resolution.
  onBeforeCreate(ctx) {
    console.time(ctx.instanceName)
  },
  onAfterCreate(ctx, instance) {
    console.timeEnd(ctx.instanceName)
  },

  // The single transforming hook. Composed Koa-style (first plugin is
  // outermost, `core` is innermost). Call next() exactly once and
  // RETURN its result. Middleware errors DO propagate (intentional abort).
  async middleware(ctx, next) {
    const instance = await next()
    return instance // optionally wrap/transform
  },
})

// Register at construction…
const container = new Container({ plugins: [timingPlugin] })

// …or after construction (later resolutions observe it)
container.use(timingPlugin)
```

`definePlugin(plugin: Plugin): Plugin` is a typed identity helper. The `Plugin` interface:

```typescript
interface Plugin {
  name: string
  onBeforeCreate?(ctx: CreateContext): void | Promise<void>
  onAfterCreate?(ctx: CreateContext, instance: unknown): void | Promise<void>
  onBeforeDestroy?(ctx: DestroyContext, instance: unknown): void | Promise<void>
  onAfterDestroy?(ctx: DestroyContext): void | Promise<void>
  onContainerDispose?(container: IContainer): void | Promise<void>
  middleware?(ctx: CreateContext, next: () => Promise<unknown>): Promise<unknown>
}
```

`CreateContext` carries `{ token, target, scope, args, instanceName, container, requestId? }`. `DestroyContext` is deliberately minimal: `{ instanceName, container, requestId? }`. Observer-hook errors are isolated and routed to the container `logger` (or `console.error`); middleware errors propagate and abort the `get()`. A real-world example is `@navios/otel`'s tracing plugin (`packages/otel/src/plugins/otel-tracing.plugin.mts`): one `definePlugin({ middleware })` that wraps `@Traced` instances after `await next()`.

### Custom registry & priority

```typescript
import { Container, Registry } from '@navios/di'

// Child registry — inherits parent registrations, can shadow them
const registry = new Registry(globalRegistry)
const container = new Container({ registry })

// All registrations for a token, highest priority first
const records = registry.getAll(MyToken)
```

### `container.internals` (advanced / plugin authors)

`container.internals` is a **frozen, `@internal`** namespace — an escape hatch for plugin authors and internal wiring, **not stable public API**. It exposes `{ registry, storage, eventBus, resolver, serviceInitializer, serviceInvalidator, tokenResolver, nameResolver, pluginRegistry }`. (This replaces v1's `getRegistry()` / `getStorage()` / `getEventBus()` accessor methods, which were removed.) Treat anything reached through `internals` as unstable.

### Error handling

```typescript
import { DIError, DIErrorCode } from '@navios/di'

try {
  await container.get(SomeService)
} catch (error) {
  if (error instanceof DIError) {
    switch (error.code) {
      case DIErrorCode.FactoryNotFound:        /* not registered */ break
      case DIErrorCode.ScopeMismatchError:     /* wrong container for scope */ break
      case DIErrorCode.TokenValidationError:   /* schema validation failed */ break
      // …more codes
    }
  }
}
```

## Testing

`@navios/di/testing` ships `TestContainer` (integration/e2e) and `UnitTestContainer` (isolated unit tests).

### `TestContainer`

`TestContainer extends Container` with a fluent binding API, assertion helpers, method-call tracking, and dependency-graph inspection.

```typescript
import { TestContainer } from '@navios/di/testing'
import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest'

describe('UserService', () => {
  let container: TestContainer

  beforeEach(() => {
    // Options: { parentRegistry?, logger?, plugins? }
    // parentRegistry defaults to globalRegistry; pass `null` for full isolation
    container = new TestContainer()
  })

  afterEach(async () => {
    await container.clear()
  })

  it('creates a user', async () => {
    container.bind(DatabaseService).toValue({ save: vi.fn().mockResolvedValue({ id: '1' }) })
    container.bind(UserRepo).toClass(MockUserRepo)
    container.bind(ConfigToken).toFactory(() => ({ apiKey: 'test' }))

    // Field-granular override: set ONE @Inject* field without
    // resolving its real token at all
    container.mockInject(UserService, 'repo', { findUser: () => fakeUser })

    const service = await container.get(UserService)
    const user = await service.create({ name: 'John' })
    expect(user.id).toBe('1')

    container.expectResolved(UserService)
    container.expectSingleton(UserService)
    container.expectInitialized(UserService)
    container.expectCalled(DatabaseService, 'save')
  })
})
```

### `UnitTestContainer`

`UnitTestContainer extends Container` for isolated unit tests with automatic method-call tracking (Proxy). Only services in `providers` are constructed for real.

```typescript
import { UnitTestContainer } from '@navios/di/testing'

const container = new UnitTestContainer({
  providers: [
    { token: UserService, useClass: MockUserService },
    { token: ConfigToken, useValue: { apiUrl: 'test' } },
    { token: ApiClient, useFactory: () => new MockApiClient() },
  ],
  // v2 default: auto-mock unregistered deps. Pass strict: true to throw.
  // strict: true,
})

const service = await container.get(UserService)
await service.findUser('123')

container.expectCalled(UserService, 'findUser')
container.expectCalledWith(UserService, 'findUser', ['123'])
container.expectNotCalled(UserService, 'deleteUser')
```

> **v2 behavior change:** auto-mocking unregistered dependencies is now the **default**. Pass `{ strict: true }` to restore the v1 throw-on-unregistered behavior. (`allowUnregistered` is the deprecated inverse alias; `strict` wins if both are set.)

## Migrating from v1

The symbols below were **removed** in v2. They appear here only to map old → new — none of them should be used in v2 code.

| v1 (removed) | v2 replacement |
|---|---|
| `inject(X)` (runtime helper) | `@Inject(X) accessor x!: X` (field decorator) |
| `asyncInject(X)` | `@InjectLazy(X) accessor x!: Promise<X>` |
| `optional(X)` | `@InjectOptional(X) accessor x!: X \| null` |
| in-constructor `inject(Tok, deriveFromArgs)` | `@InjectDerived(Tok, hostArgs => derivedArgs) accessor x!: T` |
| `InjectionToken` (class) | `Token` |
| `InjectionToken.create(...)` | `Token.create(...)` |
| `InjectionToken.bound(tok, v)` / `BoundInjectionToken` | `tok.bind(v)` / `BoundToken` (or `Token.bound(tok, v)`) |
| `InjectionToken.factory(tok, f)` / `FactoryInjectionToken` | `tok.fromFactory(f)` / `FactoryToken` (or `Token.factory(tok, f)`) |
| `new Container(registry, logger)` (positional) | `new Container({ registry, logger, plugins })` (options bag) |
| `container.getRegistry()` / `getStorage()` / `getEventBus()` / `get*()` accessors | `container.internals.{registry,storage,eventBus,…}` (`@internal`) |
| `Registry.updateScope(token, scope)` | removed — use explicit scopes / `ScopedContainer.resolveInScope` |
| implicit Singleton→Request scope-upgrade | explicit `ScopedContainer.resolveInScope(token, args?)` |
| `wrapSyncInit` / sync-init throw-proxy | none — v2 resolves eager deps before assigning fields |
| `legacy-compat` module | removed |
| `UnitTestContainer` strict-by-default | auto-mock by default; `{ strict: true }` to opt in |

Mechanical migration of a service:

```typescript
// v1
@Injectable()
class OrderService {
  private readonly repo = inject(OrderRepo)
  private readonly cache = asyncInject(CacheService)
  private readonly metrics = optional(MetricsService)
}

// v2
@Injectable()
class OrderService {
  @Inject(OrderRepo)            private accessor repo!: OrderRepo
  @InjectLazy(CacheService)     private accessor cache!: Promise<CacheService>
  @InjectOptional(MetricsService) private accessor metrics!: MetricsService | null
}
```

## License

MIT
