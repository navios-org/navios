---
sidebar_position: 4
---

# API Reference

Complete API reference for the `@navios/di` v2 library. All symbols below are derived from the real exported v2 source.

## Core Classes

### Container

The main entry point for dependency injection.

```typescript
interface ContainerOptions {
  registry?: Registry // defaults to globalRegistry
  logger?: Console | null // diagnostics + plugin-error sink
  plugins?: Plugin[] // registered in order at construction
}

class Container extends AbstractContainer {
  constructor(options?: ContainerOptions)

  // Plugins
  use(plugin: Plugin): void

  // Service resolution
  get<T extends ClassType>(
    token: T,
  ): InstanceType<T> extends Factorable<infer R> ? Promise<R> : Promise<InstanceType<T>>
  get<T extends ClassTypeWithArgument<R>, R>(token: T, args: R): Promise<InstanceType<T>>
  get<T, S extends TokenSchemaType>(token: Token<T, S>, args: StandardSchemaV1.InferInput<S>): Promise<T>
  get<T>(token: Token<T, undefined>): Promise<T>
  get<T>(token: BoundToken<T, any>): Promise<T>
  get<T>(token: FactoryToken<T, any>): Promise<T>

  // Lifecycle
  invalidate(service: unknown): Promise<void>
  ready(): Promise<void>
  dispose(): Promise<void>

  // Introspection
  isRegistered(token: any): boolean
  calculateInstanceName(token, args?): string | null

  // Request Context Management
  beginRequest(requestId: string, metadata?: Record<string, any>): ScopedContainer
  getActiveRequestIds(): ReadonlySet<string>
  hasActiveRequest(requestId: string): boolean
  removeRequestId(requestId: string): void

  // Advanced (frozen, @internal — NOT stable public API)
  readonly internals: ContainerInternals
}
```

**Constructor:** `new Container(options?: ContainerOptions)` — an options bag. (The v1 positional `new Container(registry, logger, injectors)` was removed.)

**Methods:**

- `use(plugin)` — register a plugin after construction
- `get(token, args?)` — resolve a service (throws a scope-mismatch `DIError` for `Request`-scoped tokens)
- `invalidate(service)` — invalidate a service and its dependents
- `ready()` — await all pending operations
- `dispose()` — clean up all resources and run plugin `onContainerDispose`
- `isRegistered(token)` — whether a token is registered
- `calculateInstanceName(token, args?)` — the storage instance name, or `null` for unresolved factory tokens / validation errors
- `beginRequest(requestId, metadata?)` — start a request context, returns a `ScopedContainer`

> `container.internals` (`{ registry, storage, eventBus, resolver, serviceInitializer, serviceInvalidator, tokenResolver, nameResolver, pluginRegistry }`) is a **frozen, `@internal`** escape hatch for plugin authors — not stable public API. It replaces the removed v1 `getRegistry()` / `getStorage()` / `getEventBus()` / `getScopeTracker()` / `get*()` accessor methods.

### ScopedContainer

Request-scoped container for isolated request-scoped service resolution.

```typescript
class ScopedContainer extends AbstractContainer {
  readonly requestId: string

  // Service resolution (same overloads as Container.get)
  get<T extends ClassType>(token: T): Promise<InstanceType<T>>
  get<T, S extends TokenSchemaType>(token: Token<T, S>, args: StandardSchemaV1.InferInput<S>): Promise<T>
  // …BoundToken / FactoryToken / no-schema overloads

  // Explicit opt-in request resolution (same overloads as get)
  resolveInScope<T extends ClassType>(token: T): Promise<InstanceType<T>>
  resolveInScope<T, S extends TokenSchemaType>(
    token: Token<T, S>,
    args: StandardSchemaV1.InferInput<S>,
  ): Promise<T>

  // Lifecycle
  invalidate(service: unknown): Promise<void>
  endRequest(): Promise<void>
  dispose(): Promise<void> // alias for endRequest()
  ready(): Promise<void>

  // Introspection
  isRegistered(token: any): boolean
  getParent(): Container
  getRequestId(): string

  // Metadata
  getMetadata(key: string): any | undefined
  setMetadata(key: string, value: any): void
  addInstance<T>(token: ClassType | Token<T, any> | BoundToken<T, any>, instance: T): void

  // Advanced (frozen, @internal)
  readonly internals: ContainerInternals
}
```

**`resolveInScope(token, args?)`** — the explicit, opt-in, non-mutating successor to the **removed** v1 implicit Singleton→Request scope-upgrade. It resolves `token` treating its effective host scope as `Request` for that resolution only, caching the instance in **this** ScopedContainer's own request storage (disposed at `endRequest()`); the token's registered scope and all shared registrations are unchanged. Idempotent within a request, isolated across requests.

## Registry

```typescript
class Registry {
  constructor(parent?: Registry)

  set<Instance, Schema>(
    token: Token<Instance, Schema>,
    scope: InjectableScope,
    target: ClassType,
    type: InjectableType,
    priority?: number,
  ): void

  get<Instance, Schema>(token: Token<Instance, Schema>): FactoryRecord<Instance, Schema>
  getAll<Instance, Schema>(token: Token<Instance, Schema>): FactoryRecord<Instance, Schema>[]
  has(token: Token<any, any>): boolean
  delete(token: Token<any, any>): void
}

const globalRegistry: Registry
```

- `set(token, scope, target, type, priority?)` — register a factory record
- `get(token)` — highest-priority factory record for the token
- `getAll(token)` — all factory records, highest priority first
- `has(token)` — whether the token is registered (walks parents)
- `delete(token)` — remove all registrations for the token

> The v1 `Registry.updateScope(token, scope)` was **removed**. A child `new Registry(parent)` shadows parent registrations.

## Tokens

### Token

```typescript
class Token<T, S extends StandardSchemaV1 | undefined = undefined> {
  readonly id: string
  readonly name: string | symbol | ClassType
  readonly schema: S

  constructor(name: string | symbol | ClassType, schema: S, customId?: string)

  static create<T extends ClassType>(name: T): Token<InstanceType<T>, undefined>
  static create<T extends ClassType, S extends StandardSchemaV1>(
    name: T,
    schema: S,
  ): Token<InstanceType<T>, S, true>
  static create<T>(name: string | symbol): Token<T, undefined>
  static create<T, S extends StandardSchemaV1>(name: string | symbol, schema: S): Token<T, S>

  bind<SS extends StandardSchemaV1>(
    this: Token<T, SS>,
    value: StandardSchemaV1.InferInput<SS>,
  ): BoundToken<T, SS>

  fromFactory<SS extends StandardSchemaV1>(
    this: Token<T, SS>,
    factory: (ctx: FactoryContext) => Promise<StandardSchemaV1.InferInput<SS>>,
  ): FactoryToken<T, SS>

  static bound<T, S extends StandardSchemaV1>(
    token: Token<T, S>,
    value: StandardSchemaV1.InferInput<S>,
  ): BoundToken<T, S>
  static factory<T, S extends StandardSchemaV1>(
    token: Token<T, S>,
    factory: (ctx: FactoryContext) => Promise<StandardSchemaV1.InferInput<S>>,
  ): FactoryToken<T, S>
}
```

`Token` is the v2 identity object (renamed from v1's `InjectionToken`). A token with a `schema` requires args at `get()`. `TokenSchemaType` is `StandardSchemaV1` (zod v4 / Valibot / ArkType / …).

### BoundToken

```typescript
class BoundToken<T, S extends StandardSchemaV1> {
  readonly token: Token<T, S>
  readonly value: StandardSchemaV1.InferInput<S>
}
```

Produced by `token.bind(value)` (or `Token.bound(token, value)`). Resolves without passing args.

### FactoryToken

```typescript
class FactoryToken<T, S extends StandardSchemaV1> {
  readonly token: Token<T, S>
  readonly factory: (ctx: FactoryContext) => Promise<StandardSchemaV1.InferInput<S>>
  resolve(ctx: FactoryContext): Promise<StandardSchemaV1.InferInput<S>>
}
```

Produced by `token.fromFactory(factory)` (or `Token.factory(token, factory)`). The factory computes the token args lazily.

> The v1 `InjectionToken` / `BoundInjectionToken` / `FactoryInjectionToken` classes were **removed**.

## Decorators

### Injectable

```typescript
function Injectable(options?: {
  scope?: InjectableScope
  token?: Token<any, any>
  schema?: TokenSchemaType
  registry?: Registry
  priority?: number
}): ClassDecorator
```

Marks a class as injectable. Cannot pass both `token` and `schema`. A `schema` makes the class take one validated argument object in its constructor.

### Factory

```typescript
function Factory(options?: {
  scope?: InjectableScope
  token?: Token<any, any>
  registry?: Registry
  priority?: number
}): ClassDecorator
```

Marks a class as a factory. The class implements `Factorable<R>` (or `FactorableWithArgs<R, S>` when the token has a schema) — a `create()` method that returns the produced value.

### Field decorators

All four are **stage-3 accessor decorators**. Always applied as `@Decorator(token) accessor field!: Type`. They throw at decoration time if applied to anything other than an `accessor` field, or if decorator metadata is unavailable.

```typescript
function Inject<T>(token: AnyTokenOrClass, args?: unknown): ClassAccessorDecorator
function InjectLazy<T>(token: AnyTokenOrClass, args?: unknown): ClassAccessorDecorator
function InjectOptional<T>(token: AnyTokenOrClass, args?: unknown): ClassAccessorDecorator
function InjectDerived<TDep, THostArgs>(
  token: AnyTokenOrClass,
  derive: (hostArgs: THostArgs) => unknown,
): ClassAccessorDecorator

// AnyTokenOrClass = Token<any,any> | BoundToken<any,any> | FactoryToken<any,any> | ClassType
```

| Decorator | Field type | Behavior |
|---|---|---|
| `@Inject(Token)` | `accessor x!: T` | Eager. Resolved & assigned before `onServiceInit`. Scope-checked. |
| `@InjectLazy(Token)` | `accessor x!: Promise<T>` | Deferred. Resolved on first `await`. For circular / cross-scope deps. |
| `@InjectOptional(Token)` | `accessor x!: T \| null` | `null` when unregistered / fails to resolve. |
| `@InjectDerived(Token, derive)` | `accessor x!: T` | Resolves `Token` with args from `derive(hostValidatedArgs)`. |

> The v1 runtime helpers `inject()` / `asyncInject()` / `optional()` and `wrapSyncInit()` were **removed** — v2 injection is exclusively these field decorators.

## Enums

### InjectableScope

```typescript
enum InjectableScope {
  Singleton = 'Singleton', // one instance shared across the container (default)
  Transient = 'Transient', // a new instance every resolution
  Request = 'Request', // one instance per request scope (ScopedContainer)
}
```

### InjectableType

```typescript
enum InjectableType {
  Class = 'Class',
  Factory = 'Factory',
}
```

## Interfaces

### OnServiceInit / OnServiceDestroy

```typescript
interface OnServiceInit {
  onServiceInit(): Promise<void> | void
}

interface OnServiceDestroy {
  onServiceDestroy(): Promise<void> | void
}
```

### Factorable / FactorableWithArgs

```typescript
interface Factorable<T> {
  create(ctx?: FactoryContext): Promise<T> | T
}

interface FactorableWithArgs<T, A extends TokenSchemaType> {
  create(ctx?: FactoryContext, ...args: [StandardSchemaV1.InferOutput<A>]): Promise<T> | T
}
```

### FactoryContext

Context provided to factory `create()` methods and to `Token.fromFactory()` factories.

```typescript
interface FactoryContext {
  // resolve a dependency from within the factory
  inject<T>(token: AnyTokenOrClass, args?: unknown): Promise<T>
  // the resolving container (Container or ScopedContainer)
  container: IContainer
  // register a cleanup tied to the produced instance's lifetime
  addDestroyListener(listener: () => void | Promise<void>): void
}
```

### Plugin

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

interface CreateContext {
  readonly token: Token<unknown>
  readonly target: ClassType
  readonly scope: InjectableScope
  readonly args: unknown
  readonly instanceName: string
  readonly container: IContainer
  readonly requestId?: string
}

interface DestroyContext {
  readonly instanceName: string
  readonly container: IContainer
  readonly requestId?: string
}

function definePlugin(plugin: Plugin): Plugin
```

Observer hooks (`onBefore*` / `onAfter*` / `onContainerDispose`) run in registration order, awaited sequentially; their errors are **isolated** and reported (never abort resolution). `middleware` is the single transforming hook, composed Koa-style (first plugin outermost, `core` innermost); call `next()` exactly once and **return** its result. Middleware errors **propagate** (intentional abort). `definePlugin` is a typed identity helper.

### IContainer

```typescript
interface IContainer {
  readonly internals: ContainerInternals
  get<T>(token: any, args?: any): Promise<T> // (typed overloads omitted)
  invalidate(service: unknown): Promise<void>
  isRegistered(token: any): boolean
  addInstance<T>(token: ClassType | Token<T, any> | BoundToken<T, any>, instance: T): void
  dispose(): Promise<void>
  ready(): Promise<void>
}
```

## Error Handling

### DIError / DIErrorCode

```typescript
class DIError extends Error {
  readonly code: DIErrorCode
  static factoryNotFound(message: string): DIError
  static instanceNotFound(message: string): DIError
  static instanceDestroying(message: string): DIError
  static circularDependency(message: string): DIError
  static scopeMismatchError(tokenName, expected, actual): DIError
  static tokenSchemaRequiredError(tokenName): DIError
  static unknown(message: string): DIError
}

enum DIErrorCode {
  FactoryNotFound = 'FACTORY_NOT_FOUND',
  FactoryTokenNotResolved = 'FACTORY_TOKEN_NOT_RESOLVED',
  InstanceNotFound = 'INSTANCE_NOT_FOUND',
  InstanceDestroying = 'INSTANCE_DESTROYING',
  CircularDependency = 'CIRCULAR_DEPENDENCY',
  UnknownError = 'UNKNOWN_ERROR',
  TokenValidationError = 'TOKEN_VALIDATION_ERROR',
  TokenSchemaRequiredError = 'TOKEN_SCHEMA_REQUIRED_ERROR',
  ClassNotInjectable = 'CLASS_NOT_INJECTABLE',
  ScopeMismatchError = 'SCOPE_MISMATCH_ERROR',
  PriorityConflictError = 'PRIORITY_CONFLICT_ERROR',
  StorageError = 'STORAGE_ERROR',
  InitializationError = 'INITIALIZATION_ERROR',
  DependencyResolutionError = 'DEPENDENCY_RESOLUTION_ERROR',
}
```

## Testing

Imported from `@navios/di/testing`.

### TestContainer

```typescript
interface TestContainerOptions {
  parentRegistry?: Registry | null // defaults to globalRegistry; null = fully isolated
  logger?: Console | null
  plugins?: Plugin[]
}

class TestContainer extends Container {
  constructor(options?: TestContainerOptions)

  bind<T>(token: Token<T, any> | BoundToken<T, any> | (new (...a: any[]) => T)): BindingBuilder<T>
  mockInject<T>(target: new (...a: any[]) => T, fieldName: string | symbol, value: unknown): this

  expectResolved/expectNotResolved/expectSingleton/expectTransient/expectRequestScoped(token): void
  expectInitialized/expectDestroyed/expectNotDestroyed(token): void
  recordMethodCall(token, method, args, result?, error?): void
  expectCalled/expectCalledWith/expectCallCount(token, method, …): void
  getMethodCalls(token): MethodCallRecord[]
  getServiceStats(token): MockServiceStats
  getDependencyGraph(): DependencyGraph
  getSimplifiedDependencyGraph(): Record<string, string[]>
  clear(): Promise<void>
}

interface BindingBuilder<T> {
  toValue(value: T): void
  toClass<C extends new (...args: any[]) => T>(cls: C): void
  toFactory(factory: () => T | Promise<T>): void
}
```

`mockInject(target, fieldName, value)` is a field-granular override: it sets a single `@Inject*` accessor field without resolving its real token (no constructor side-effects; the dependency need not be registered).

### UnitTestContainer

```typescript
interface UnitTestContainerOptions {
  providers: ProviderConfig[]
  strict?: boolean // default false → auto-mock unregistered deps
  allowUnregistered?: boolean // deprecated inverse alias; `strict` wins if both set
  logger?: Console | null
  plugins?: Plugin[]
}

interface ProviderConfig<T = any> {
  token: Token<T, any> | BoundToken<T, any> | (new (...a: any[]) => T)
  useValue?: T
  useClass?: new (...args: any[]) => T
  useFactory?: () => T | Promise<T>
}

class UnitTestContainer extends Container {
  constructor(options: UnitTestContainerOptions)
  enableAutoMocking(): this
  disableAutoMocking(): this
  expectCalled/expectNotCalled/expectCalledWith/expectCallCount(token, method, …): void
  expectAutoMocked/expectNotAutoMocked(token): void
  expectResolved/expectNotResolved/expectInitialized/expectDestroyed/expectNotDestroyed(token): void
  clear(): Promise<void>
}
```

> **v2 behavior change:** auto-mocking unregistered dependencies is the **default**. Pass `{ strict: true }` for the v1 throw-on-unregistered behavior.

## Scope Compatibility

| Host scope ↓ / Dependency → | `@Inject` (eager) | `@InjectLazy` | `@InjectOptional` | `@InjectDerived` |
|---|---|---|---|---|
| Singleton → Singleton dep | ✅ | ✅ | ✅ | ✅ |
| Singleton → Request/Transient dep | ❌ throws `ScopeMismatchError` | ✅ | ✅ | ❌ throws |
| Request → any | ✅ | ✅ | ✅ | ✅ |
| Transient → any | ✅ | ✅ | ✅ | ✅ |

**Notes:**

- An eager `@Inject` (or `@InjectDerived`) of a narrower-scoped dependency from a `Singleton` host throws a scope-mismatch `DIError` — use `@InjectLazy` (a `Promise<T>` field) instead.
- `@InjectLazy` is always safe (deferred resolution) and is the tool for circular dependencies.
- `@InjectOptional` is always safe (returns `null` when unavailable).

## Next Steps

- Explore the [guides](/docs/di/di/guides/services) for detailed usage examples
- Check out [recipes](/docs/di/di/recipes/configuration-services) for common patterns
- Review [best practices](/docs/di/di/best-practices) for service design
