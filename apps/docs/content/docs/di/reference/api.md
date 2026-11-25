---
title: API
---

# API

Everything exported by `@navios/di` and `@navios/di/testing`. Each entry links to the page that explains it; this page only lists signatures.

## Containers

### Container

```ts
new Container(options?: ContainerOptions)
```

| Option      | Type              | Default | Purpose                                                                                          |
| ----------- | ----------------- | ------- | ------------------------------------------------------------------------------------------------ |
| `providers` | `Provider[]`      | `[]`    | Bindings created with [`provide()`](/docs/di/essentials/providers#provide)                       |
| `strict`    | `boolean`         | `false` | Ignore default providers. See [Strict containers](/docs/di/essentials/providers#strict-containers) |
| `logger`    | `Console \| null` | `null`  | Receives a warning when `invalidate()` is given an unknown instance, and an error when a destroy hook throws |

| Member                                 | Returns                       | Description                                                                                         |
| -------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------- |
| `get(token, args?)`                    | `Promise<T>`                  | Resolves an instance, waiting for anything asynchronous                                             |
| `getSync(token, args?)`                | `T`                           | Resolves synchronously. Throws `AsyncInitRequired` if something has to be awaited                   |
| `tryGetSync(token, args?)`             | `T \| null`                   | Returns an instance that already exists. Never builds                                               |
| `provide(target, impl)`                | `void`                        | Adds a [provider](/docs/di/essentials/providers#containerprovide). Throws once the token is resolved |
| `decorate(target, fn)`                 | `void`                        | [Wraps](/docs/di/essentials/providers#decorating-instances) every instance built for a token. Not applied to `{ value }` providers or `addInstance()` values |
| `addInstance(target, value)`           | `void`                        | [Stores](/docs/di/essentials/providers#addinstance) a ready value as a singleton                    |
| `isRegistered(target)`                 | `boolean`                     | Whether the token has an instance or a provider here                                                |
| `getProvider(target)`                  | `ProviderRecord \| undefined` | The provider that would be used                                                                     |
| `instances()`                          | `unknown[]`                   | Every instance currently held, in creation order, without the container itself                      |
| `createScope(metadata?)`               | `ScopedContainer`             | Creates a [scope](/docs/di/essentials/scopes#creating-a-scope)                                      |
| `invalidate(instance)`                 | `Promise<void>`               | [Destroys](/docs/di/guides/invalidation) an instance and its dependents                             |
| `onInvalidate(token, args, listener)`  | `() => void`                  | Listens for the destruction of an instance. Returns an unsubscribe function                         |
| `ready()`                              | `Promise<void>`               | Resolves when nothing is still being created                                                        |
| `dispose()`                            | `Promise<void>`               | [Destroys](/docs/di/essentials/lifecycle#dispose) everything the container holds                    |
| `[Symbol.asyncDispose]()`              | `Promise<void>`               | Calls `dispose()`                                                                                   |

`Container` is itself injectable: `inject(Container)` returns the root container.

### ScopedContainer

Created by `container.createScope()`. It has `get`, `getSync`, `tryGetSync`, `addInstance`, `isRegistered`, `invalidate`, `onInvalidate`, `ready`, `dispose` and `[Symbol.asyncDispose]` with the signatures above, and adds:

| Member                    | Returns     | Description                                 |
| ------------------------- | ----------- | ------------------------------------------- |
| `parent`                  | `Container` | The root container                          |
| `getParent()`             | `Container` | The same, as a method                       |
| `getMetadata(key)`        | `any`       | Reads the metadata given to `createScope()` |
| `setMetadata(key, value)` | `void`      | Changes it                                  |

`addInstance()` on a scope stores a request-scoped value. A scope has no `provide()`, `decorate()` or `getProvider()`; those belong to the root.

### IContainer

The interface both containers implement: `get`, `getSync`, `tryGetSync`, `invalidate`, `onInvalidate`, `isRegistered`, `addInstance`, `dispose`, `ready`. It is the type of `FactoryContext.container`.

## Registration

| Export                                 | Signature                                                                              | Described in                                                              |
| -------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `Injectable`                           | `(options?: { scope?, token?, schema? }) => ClassDecorator`                            | [Services and injection](/docs/di/essentials/services#injectable)         |
| `Factory`                              | `(options?: { scope?, token? }) => ClassDecorator`                                     | [Factories](/docs/di/essentials/factories#factory)                        |
| `registerInjectable`                   | `(target, options?: RegisterInjectableOptions) => InjectionToken`                      | [Services and injection](/docs/di/essentials/services#registering-without-decorators) |
| `registerFactory`                      | `(target, options?: RegisterFactoryOptions) => InjectionToken`                         | [Factories](/docs/di/essentials/factories#registering-without-decorators) |
| `provide`                              | `(target: ClassType \| InjectionToken<T>, impl: ProviderInput<T>) => Provider`         | [Providers](/docs/di/essentials/providers#provide)                        |
| `getInjectableToken`                   | `(target: ClassType) => InjectionToken`. Throws `ClassNotInjectable` when unregistered | [Tokens](/docs/di/essentials/tokens#creating-a-token)                     |
| `findInjectableToken`                  | `(target: ClassType) => InjectionToken \| undefined`                                   | The same, without throwing                                                |
| `InjectableTokenMeta`                  | `symbol`                                                                               | The property under which a class carries its token                        |

Only a registration on the class itself counts. An undecorated subclass of an injectable class has no token.

Option and record types: `InjectableOptions`, `FactoryOptions`, `RegisterInjectableOptions`, `RegisterFactoryOptions`, `ContainerOptions`.

```ts
type ProviderInput<T> =
  | ClassType
  | { value: T }
  | { class: ClassType; scope?: InjectableScope }
  | { factory: (ctx: FactoryContext, args: any) => T | Promise<T>; scope?: InjectableScope }

interface Provider {
  token: InjectionToken<any, any>
  record: ProviderRecord
}

interface ProviderRecord {
  token: InjectionToken<any, any>
  kind: ProviderKind // 'class' | 'factory' | 'function' | 'value'
  target: ClassType | undefined
  fn: ((ctx: FactoryContext, args: any) => unknown) | undefined
  value: unknown
  scope: InjectableScope
}
```

## Injection functions

All three can only be called while a class is being constructed. See [Services and injection](/docs/di/essentials/services#inject).

| Export        | Returns      | Description                                                                |
| ------------- | ------------ | -------------------------------------------------------------------------- |
| `inject`      | `T`          | The instance, built on the spot if needed                                  |
| `optional`    | `T \| null`  | The instance, or `null` when nothing provides the token                    |
| `asyncInject` | `Promise<T>` | Starts resolving after the current constructor returns. For breaking cycles |

Each takes `(token, args?)`. Their overloads are exported as the types `SyncResolve`, `OptionalResolve` and `AsyncResolve`; `container.getSync` and `container.get` share the first and the last. When a token requires arguments and none are given, the return type is the string type `MissingArgsError<S>`, which names the missing keys.

## Tokens

See [Tokens](/docs/di/essentials/tokens).

```ts
class InjectionToken<T, S = unknown> {
  readonly name: string | symbol | ClassType
  readonly schema: StandardSchemaV1 | undefined
  readonly scope: InjectableScope | undefined

  static create<T>(name: string | symbol): InjectionToken<T, undefined>
  static create<T, S extends StandardSchemaV1>(name: string | symbol, schema: S): InjectionToken<T, S>
  static create<T>(name: string | symbol, options: { scope?: InjectableScope }): InjectionToken<T, undefined>
  static create<T, S extends StandardSchemaV1>(
    name: string | symbol,
    options: { scope?: InjectableScope; schema: S },
  ): InjectionToken<T, S>

  static bound<T, S extends StandardSchemaV1>(
    token: InjectionToken<T, S>,
    value: InferInput<S>,
  ): BoundInjectionToken<T, S>

  static factory<T, S extends StandardSchemaV1>(
    token: InjectionToken<T, S>,
    factory: (ctx: FactoryContext) => InferInput<S> | Promise<InferInput<S>>,
  ): FactoryInjectionToken<T, S>

  static refineType<T>(token: BoundInjectionToken<any, any>): BoundInjectionToken<T, any>

  toString(): string // the name
}
```

| Export                     | Description                                                                            |
| -------------------------- | -------------------------------------------------------------------------------------- |
| `BoundInjectionToken`      | Result of `InjectionToken.bound()`. Fields: `token`, `value`, `name`, `schema`         |
| `FactoryInjectionToken`    | Result of `InjectionToken.factory()`. Fields: `token`, `factory`, `name`, `schema`     |
| `InjectionTokenOptions`    | `{ schema?, scope? }`                                                                  |
| `InjectionTokenSchemaType` | Alias of `StandardSchemaV1`                                                            |
| `TokenArgsRequired<S>`     | `true` when schema `S` does not accept `undefined`                                     |
| `AnyInjectableType`        | A class or any of the three token classes: whatever `get()` and `inject()` accept      |
| `InjectionTokenType`       | Any of the three token classes                                                         |

## Factories and lifecycle

| Export                     | Shape                                                                                          | Described in                                                |
| -------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `FactoryContext`           | `{ inject(token, args?): Promise<T>; container: IContainer; addDestroyListener(listener): void }` | [Factories](/docs/di/essentials/factories#factorycontext) |
| `Factorable<T>`            | `{ create(ctx?: FactoryContext): T \| Promise<T> }`                                            | [Factories](/docs/di/essentials/factories#factory)          |
| `FactorableWithArgs<T, S>` | `{ create(ctx: FactoryContext \| undefined, args: InferOutput<S>): T \| Promise<T> }`          | [Factories](/docs/di/essentials/factories#providing-a-token) |
| `OnServiceInit`            | `{ onServiceInit(): void \| Promise<void> }`                                                   | [Lifecycle](/docs/di/essentials/lifecycle#onserviceinit)    |
| `OnServiceDestroy`         | `{ onServiceDestroy(): void \| Promise<void> }`                                                | [Lifecycle](/docs/di/essentials/lifecycle#onservicedestroy) |

## InjectableScope

```ts
enum InjectableScope {
  Singleton = 'Singleton',
  Transient = 'Transient',
  Request = 'Request',
}
```

See [Scopes](/docs/di/essentials/scopes).

## Schema helpers

`@navios/di` contains its own copy of the Standard Schema types, so it depends on no schema library.

| Export                                                                          | Description                                                                                                   |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `StandardSchemaV1<Input, Output>`                                               | The Standard Schema interface                                                                                 |
| `StandardSchemaProps`, `StandardSchemaTypes`, `StandardSchemaResult`, `StandardSchemaIssue` | Its parts                                                                                         |
| `InferInput<S>`, `InferOutput<S>`                                               | The input and output type of a schema                                                                         |
| `isStandardSchema(value)`                                                       | Type guard                                                                                                    |
| `validateSync(schema, value, tokenName)`                                        | Validates and returns the output. Throws `TokenValidationError` on issues or when the schema validates asynchronously |

## Type utilities

Constructor shapes used by the decorator overloads: `ClassType`, `ClassTypeWithoutArguments`, `ClassTypeWithArgument<A>`, `ClassTypeWithOptionalArgument<A>`, `ClassTypeWithInstance<T>`, `ClassTypeWithInstanceAndArgument<T, A>`, `ClassTypeWithInstanceAndOptionalArgument<T, A>`.

Helpers behind `MissingArgsError`: `Join`, `UnionToIntersection`, `UnionToOvlds`, `PopUnion`, `IsUnion`, `UnionToArray`.

## EventEmitter

A small typed event emitter, registered as a transient injectable so that each `inject(EventEmitter)` gets its own. It is a utility for application code; the container does not use it.

```ts
class EventEmitter<Events extends EventsConfig = {}> {
  on(event, listener): () => void // returns an unsubscribe function
  off(event, listener): void
  once(event, listener): () => void
  emit(event, ...args): Promise<any> // resolves when every listener has settled
}

type EventsConfig = { [event: string]: any[] } // event name to listener arguments
```

`EventsNames<Events>` and `EventsArgs<Events, Name>` extract the event names and the argument tuple of one event.

## Error codes

Every failure raised by the container is a `DIError`.

```ts
class DIError extends Error {
  readonly code: DIErrorCode
  readonly context?: Record<string, unknown>
  readonly cause?: unknown
}
```

| `DIErrorCode`              | Raised when                                                                                         | `context`                              |
| -------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `FactoryNotFound`          | No instance and no provider exists for the token                                                    | `name`                                 |
| `ClassNotInjectable`       | A class without `@Injectable` or `@Factory` is resolved, provided or stored                         | `className`                            |
| `ScopeMismatchError`       | A request-scoped service is reached from the root container or from a singleton                     | `name`, `path`                         |
| `CircularDependency`       | Services depend on each other in a cycle                                                            | `cycle`                                |
| `ProviderConflict`         | A second class declares itself the default of a token                                               | `token`, `existing`, `incoming`        |
| `TokenValidationError`     | Arguments fail the token's schema, or the schema validates asynchronously                           | `schema`, `value`, `issues`            |
| `TokenSchemaRequiredError` | `addInstance()` is called with a token whose arguments are required                                 | `token`                                |
| `AsyncInitRequired`        | `getSync()` meets something that has to be awaited                                                  | `name`                                 |
| `InitializationError`      | A constructor, factory or `onServiceInit` throws something that is not a `DIError`                  | `serviceName`, `error`; `cause` is set |
| `ContainerDisposed`        | A disposed scope is used                                                                            | `kind`                                 |
| `OutsideInjectionContext`  | `inject()`, `optional()` or `asyncInject()` is called outside a construction                        | `what`                                 |
| `AccessBeforeInit`         | A constructor uses a [placeholder](/docs/di/how-it-works#constructor-replay)                        | `name`                                 |
| `UnknownError`             | Misuse without a code of its own: `provide()` after resolution, a second `addInstance()`, a value that is not a class or token | varies      |

`InstanceNotFound` and `InstanceDestroying` exist in the enum and are not raised by the container.

The messages, for matching against logs. In code, compare `code`.

| `DIErrorCode`              | Message                                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `FactoryNotFound`          | `Factory <name> not found`                                                                                  |
| `ClassNotInjectable`       | `Class <name> is not decorated with @Injectable.`                                                           |
| `ScopeMismatchError`       | `Scope mismatch: <name> is request-scoped and cannot be resolved from the root container (<path>). …`       |
| `CircularDependency`       | `Circular dependency detected: A -> B -> A`                                                                 |
| `ProviderConflict`         | `Token <token> already has a default provider (<existing>); <incoming> cannot become a second default. …`   |
| `TokenValidationError`     | `Validation failed for <token>`, followed by `: token args schemas must validate synchronously` for an asynchronous schema |
| `TokenSchemaRequiredError` | `Token <token> requires schema arguments and cannot be used with addInstance. …`                            |
| `AsyncInitRequired`        | `<name> or one of its dependencies has an asynchronous initializer and cannot be resolved synchronously. …` |
| `InitializationError`      | `Service <name> initialization failed: <original message>`                                                  |
| `ContainerDisposed`        | `ScopedContainer has been disposed`                                                                         |
| `OutsideInjectionContext`  | `[Injector] Trying to access <function> outside of a injectable context`                                    |
| `AccessBeforeInit`         | `[Injector] Trying to access <name> before it's initialized, please move the code to a onServiceInit method` |

`AccessBeforeInit` is thrown inside a construction pass that the container discards and repeats, so it is seen only by code that catches it in the constructor or keeps the placeholder and uses it later.

```ts
import { DIError, DIErrorCode } from '@navios/di'

try {
  await container.get(UserService)
} catch (error) {
  if (error instanceof DIError && error.code === DIErrorCode.InitializationError) {
    console.error(error.cause)
  }
}
```

## Testing

Exported from `@navios/di/testing`. See [Testing](/docs/di/guides/testing).

### TestContainer

```ts
new TestContainer(options?: { logger?: Console | null })
```

Extends `Container`.

| Member                                                       | Description                                                                                  |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `bind(target)`                                               | Returns a `BindingBuilder` with `toValue(value)`, `toClass(cls)` and `toFactory(fn)`         |
| `clear()`                                                    | Disposes all instances and resets recorded calls and events. Bindings stay                   |
| `expectResolved(target)`, `expectNotResolved(target)`        | Whether the container holds an instance for the token                                        |
| `expectSingleton(target)`, `expectTransient(target)`, `expectRequestScoped(target)` | The scope of the provider in use                                      |
| `expectSameInstance(target)`, `expectDifferentInstances(target)` | Resolves twice and compares. Both return a promise                                       |
| `recordMethodCall(target, method, args, result?, error?)`    | Reports a call, for use inside a fake                                                        |
| `expectCalled(target, method)`, `expectCalledWith(target, method, args)`, `expectCallCount(target, method, count)` | Assert on reported calls              |
| `getMethodCalls(target)`, `clearMethodCalls()`               | Read and reset reported calls                                                                |
| `recordLifecycleEvent(target, event, instanceName)`          | Reports `'created'`, `'initialized'` or `'destroyed'`                                        |
| `expectInitialized(target)`, `expectDestroyed(target)`, `expectNotDestroyed(target)` | Assert on reported lifecycle events                                  |
| `getServiceStats(target)`                                    | `{ instanceCount, methodCalls, lifecycleEvents }`                                            |
| `getDependencyGraph()`                                       | `{ nodes, rootTokens }` for the resolved instances, with scope, dependencies and dependents  |
| `getSimplifiedDependencyGraph()`                             | `Record<string, string[]>`: token name to sorted dependency names                            |

### UnitTestContainer

```ts
new UnitTestContainer(options: {
  providers: ProviderConfig[]
  allowUnregistered?: boolean
  logger?: Console | null
})

interface ProviderConfig<T = any> {
  token: ClassType | InjectionToken<T, any> | BoundInjectionToken<T, any>
  useValue?: T
  useClass?: new (...args: any[]) => T
  useFactory?: () => T | Promise<T>
}
```

Extends `Container` in strict mode. Objects returned by `get()` and `getSync()` record their method calls.

| Member                                                       | Description                                                                 |
| ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `clear()`                                                    | Disposes all instances and resets recorded calls and events                 |
| `enableAutoMocking()`, `disableAutoMocking()`                | Switch `allowUnregistered` on or off. Both return the container             |
| `expectResolved(target)`, `expectNotResolved(target)`        | Whether the container holds an instance for the token                       |
| `expectAutoMocked(target)`, `expectNotAutoMocked(target)`    | Whether a placeholder was handed out for the token                          |
| `expectCalled(target, method)`, `expectNotCalled(target, method)`, `expectCalledWith(target, method, args)`, `expectCallCount(target, method, count)` | Assert on recorded calls |
| `getMethodCalls(target)`, `clearMethodCalls()`               | Read and reset recorded calls                                               |
| `recordLifecycleEvent(target, event, instanceName)`          | Reports a lifecycle event                                                   |
| `expectInitialized(target)`, `expectDestroyed(target)`, `expectNotDestroyed(target)` | Assert on reported lifecycle events                 |
| `getServiceStats(target)`                                    | `{ instanceCount, methodCalls, lifecycleEvents }`                           |
| `getRegisteredTokens()`, `getAutoMockedTokens()`             | `ReadonlySet<InjectionToken>` of listed and auto-mocked tokens              |

### Testing types

`BindingBuilder<T>`, `ProviderConfig<T>`, `TestContainerOptions`, `UnitTestContainerOptions`, `MethodCallRecord` (`{ method, args, timestamp, result?, error? }`), `LifecycleRecord` (`{ event, timestamp, instanceName }`), `MockServiceStats`, `DependencyNode`, `DependencyGraph`.
