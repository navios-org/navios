# API Reference

This document lists the API exported by `@navios/di` 2.0. Members marked `@internal` in the sources are not part of the public API and are not listed.

## Core Classes

### Container

The root container. It holds singletons and creates scopes.

```ts
class Container implements IContainer {
  constructor(options?: ContainerOptions)

  get: AsyncResolve
  getSync: SyncResolve
  tryGetSync<T>(token: AnyInjectableType, args?: unknown): T | null

  provide<T>(token: ClassType | InjectionToken<T, any>, impl: ProviderInput<T>): void
  decorate<T>(
    token: ClassType | InjectionToken<T, any>,
    decorator: (instance: T, info: { token: InjectionToken<any, any>; args: unknown }) => T,
  ): void
  addInstance<T>(
    token: ClassType | InjectionToken<T, any> | BoundInjectionToken<T, any>,
    instance: T,
  ): void
  isRegistered(token: AnyInjectableType): boolean
  getProvider(token: ClassType | InjectionToken<any, any>): ProviderRecord | undefined

  createScope(metadata?: Record<string, any>): ScopedContainer

  invalidate(service: unknown): Promise<void>
  onInvalidate(token: AnyInjectableType, args: unknown, listener: () => void): () => void
  ready(): Promise<void>
  dispose(): Promise<void>
  [Symbol.asyncDispose](): Promise<void>
}

interface ContainerOptions {
  /** Providers that replace or supply the defaults registered on tokens. */
  providers?: Provider[]
  /** Use only the providers given to this container and ignore the defaults. */
  strict?: boolean
  logger?: Console | null
}
```

| Member         | Description                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------------- |
| `get`          | Resolves an instance, waiting for asynchronous initialisers.                                                |
| `getSync`      | Resolves an instance synchronously. Throws `AsyncInitRequired` when an asynchronous initialiser is pending. |
| `tryGetSync`   | Returns an instance that is already built, or `null`. Never constructs.                                     |
| `provide`      | Replaces or supplies the provider for a token. Must be called before the token is first resolved here.      |
| `decorate`     | Wraps every instance of a token after it is constructed and initialised and before anything can observe it. |
| `addInstance`  | Stores a ready value as a singleton.                                                                        |
| `isRegistered` | Returns whether the token has an instance or a provider in this container.                                  |
| `getProvider`  | Returns the provider that would be used for the token.                                                      |
| `createScope`  | Creates a scope for request-scoped services.                                                                |
| `invalidate`   | Destroys an instance, the services that depend on it and the transients it owns.                            |
| `onInvalidate` | Calls `listener` when the instance for `token` and `args` is destroyed. Returns an unsubscribe function.    |
| `ready`        | Waits until no service is still being created.                                                              |
| `dispose`      | Waits for pending creations, then destroys every instance in reverse creation order.                        |

The container registers itself, so `inject(Container)` returns the root container.

### ScopedContainer

A scope of a root container. It holds request-scoped instances; singletons are resolved from, and stored in, the parent. Create it with `container.createScope()`.

```ts
class ScopedContainer implements IContainer {
  readonly parent: Container

  get: AsyncResolve
  getSync: SyncResolve
  tryGetSync<T>(token: AnyInjectableType, args?: unknown): T | null

  addInstance<T>(
    token: ClassType | InjectionToken<T, any> | BoundInjectionToken<T, any>,
    instance: T,
  ): void
  isRegistered(token: AnyInjectableType): boolean

  invalidate(service: unknown): Promise<void>
  onInvalidate(token: AnyInjectableType, args: unknown, listener: () => void): () => void
  ready(): Promise<void>
  dispose(): Promise<void>
  [Symbol.asyncDispose](): Promise<void>

  getParent(): Container
  getMetadata(key: string): any | undefined
  setMetadata(key: string, value: any): void

  /** @deprecated Use `dispose()`. */
  endRequest(): Promise<void>
}
```

After `dispose()`, `get()` rejects and `getSync()` and `addInstance()` throw a `DIError` with code `ContainerDisposed`. A second `dispose()` does nothing.

### InjectionToken

```ts
class InjectionToken<T, S = unknown, Required extends boolean = TokenArgsRequired<S>> {
  readonly name: string | symbol | ClassType
  readonly schema: StandardSchemaV1 | undefined
  readonly scope: InjectableScope | undefined

  static create<T>(name: string | symbol): InjectionToken<T, undefined>
  static create<T, Schema extends StandardSchemaV1>(
    name: string | symbol,
    schema: Schema,
  ): InjectionToken<T, Schema>
  static create<T>(
    name: string | symbol,
    options: { scope?: InjectableScope },
  ): InjectionToken<T, undefined>
  static create<T, Schema extends StandardSchemaV1>(
    name: string | symbol,
    options: { scope?: InjectableScope; schema: Schema },
  ): InjectionToken<T, Schema>

  static bound<T, S extends StandardSchemaV1>(
    token: InjectionToken<T, S>,
    value: InferInput<S>,
  ): BoundInjectionToken<T, S>

  static factory<T, S extends StandardSchemaV1>(
    token: InjectionToken<T, S>,
    factory: (ctx: FactoryContext) => Promise<InferInput<S>> | InferInput<S>,
  ): FactoryInjectionToken<T, S>

  static refineType<T>(token: BoundInjectionToken<any, any>): BoundInjectionToken<T, any>

  toString(): string
}
```

A token is identified by the object. It has no id; `toString()` returns the name. `scope` declares the scope of a token that has no provider and is supplied with `addInstance()`.

### BoundInjectionToken

A token with fixed args.

```ts
class BoundInjectionToken<T, S extends StandardSchemaV1> {
  readonly token: InjectionToken<T, S>
  readonly value: InferInput<S>
  readonly name: string | symbol | ClassType
  readonly schema: StandardSchemaV1 | undefined

  toString(): string
}
```

### FactoryInjectionToken

A token whose args are computed by a factory. The factory runs at most once per root container; the value is cached on the container, not on the token.

```ts
class FactoryInjectionToken<T, S extends StandardSchemaV1> {
  readonly token: InjectionToken<T, S>
  readonly factory: (ctx: FactoryContext) => Promise<InferInput<S>> | InferInput<S>
  readonly name: string | symbol | ClassType
  readonly schema: StandardSchemaV1 | undefined

  toString(): string
}
```

### EventEmitter

A small typed event emitter, registered as a transient service. It is a utility for application code and is not used by the container.

```ts
class EventEmitter<Events extends EventsConfig = {}> {
  on(event, listener): () => void
  off(event, listener): void
  once(event, listener): () => void
  emit(event, ...args): Promise<any>
}
```

## Decorators

### Injectable

```ts
function Injectable(options?: InjectableOptions): ClassDecorator

interface InjectableOptions {
  scope?: InjectableScope
  token?: InjectionToken<any, any>
  schema?: InjectionTokenSchemaType
}
```

- `scope` defaults to `InjectableScope.Singleton`.
- `token` makes the class the default provider of that token. A token accepts one default; a second class with a different name throws `ProviderConflict`.
- `schema` makes the class take validated args as its constructor argument. It cannot be combined with `token`.

The decorator is typed so that the constructor argument must match the output type of the schema, and so that a class registered for `InjectionToken<T>` must be assignable to `T`.

### Factory

```ts
function Factory(options?: FactoryOptions): ClassDecorator

interface FactoryOptions {
  scope?: InjectableScope
  token?: InjectionToken<any, any>
}
```

The class must implement `create()`. Resolving the class or its token returns the result of `create()`.

### Legacy decorators

`@navios/di/legacy-compat` exports `Injectable` and `Factory` for projects that use `experimentalDecorators`, and `createClassContext` and `createMethodContext` for building other legacy-compatible decorators.

## Enums

### InjectableScope

```ts
enum InjectableScope {
  /** One instance per container. */
  Singleton = 'Singleton',
  /** A new instance for each injection. */
  Transient = 'Transient',
  /** One instance per scope created with `createScope()`. */
  Request = 'Request',
}
```

### DIErrorCode

```ts
enum DIErrorCode {
  FactoryNotFound = 'FactoryNotFound',
  InstanceNotFound = 'InstanceNotFound',
  InstanceDestroying = 'InstanceDestroying',
  CircularDependency = 'CircularDependency',
  TokenValidationError = 'TokenValidationError',
  TokenSchemaRequiredError = 'TokenSchemaRequiredError',
  ClassNotInjectable = 'ClassNotInjectable',
  ScopeMismatchError = 'ScopeMismatchError',
  ProviderConflict = 'ProviderConflict',
  AsyncInitRequired = 'AsyncInitRequired',
  ContainerDisposed = 'ContainerDisposed',
  InitializationError = 'InitializationError',
  UnknownError = 'UnknownError',
}
```

## Interfaces

### OnServiceInit

```ts
interface OnServiceInit {
  onServiceInit(): Promise<void> | void
}
```

### OnServiceDestroy

```ts
interface OnServiceDestroy {
  onServiceDestroy(): Promise<void> | void
}
```

### Factorable

```ts
interface Factorable<T> {
  create(ctx?: FactoryContext): Promise<T> | T
}
```

### FactorableWithArgs

```ts
interface FactorableWithArgs<T, A extends InjectionTokenSchemaType> {
  create(ctx?: FactoryContext, ...args: [InferOutput<A>]): Promise<T> | T
}
```

### FactoryContext

Passed to `create()` of a factory class, to function providers and to the factory of a factory token.

```ts
interface FactoryContext {
  inject: <T = any>(token: AnyInjectableType, args?: unknown) => Promise<T>
  container: IContainer
  addDestroyListener: (listener: () => void | Promise<void>) => void
}
```

### IContainer

Implemented by `Container` and `ScopedContainer`.

```ts
interface IContainer {
  get: AsyncResolve
  getSync: SyncResolve
  tryGetSync<T>(token: AnyInjectableType, args?: unknown): T | null
  invalidate(service: unknown): Promise<void>
  onInvalidate(token: AnyInjectableType, args: unknown, listener: () => void): () => void
  isRegistered(token: AnyInjectableType): boolean
  addInstance<T>(
    token: ClassType | InjectionToken<T, any> | BoundInjectionToken<T, any>,
    instance: T,
  ): void
  dispose(): Promise<void>
  ready(): Promise<void>
}
```

### Provider, ProviderInput, ProviderRecord

```ts
/** What `provide()` returns and `ContainerOptions.providers` accepts. */
interface Provider {
  token: InjectionToken<any, any>
  record: ProviderRecord
}

/** The second argument of `provide()`. */
type ProviderInput<T> =
  | ClassType
  | { value: T }
  | { class: ClassType; scope?: InjectableScope }
  | { factory: (ctx: FactoryContext, args: any) => T | Promise<T>; scope?: InjectableScope }

type ProviderKind = 'class' | 'factory' | 'function' | 'value'

/** How to produce the value for a token. Returned by `container.getProvider()`. */
interface ProviderRecord {
  token: InjectionToken<any, any>
  kind: ProviderKind
  target: ClassType | undefined
  fn: ((ctx: FactoryContext, args: any) => unknown) | undefined
  value: unknown
  scope: InjectableScope
}
```

### StandardSchemaV1

The [Standard Schema](https://standardschema.dev) interface, declared inside `@navios/di` so that the package depends on no schema library.

```ts
interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': StandardSchemaProps<Input, Output>
}

type InferInput<S> // the input type of a schema
type InferOutput<S> // the output type of a schema
```

## Functions

### inject

```ts
const inject: SyncResolve

inject(Class): InstanceType<Class>
inject(Class, args): InstanceType<Class>
inject(FactoryClass): R // the type returned by create()
inject(token: InjectionToken<T, undefined>): T
inject(token: InjectionToken<T, S>, args: InferInput<S>): T
inject(token: BoundInjectionToken<T, any>): T
inject(token: FactoryInjectionToken<T, any>): T
```

Injects a dependency while a class is being constructed, in a field initialiser or the constructor. It returns the real instance, including for transients, where each call gets its own instance. Called outside a construction, it throws.

### optional

```ts
const optional: OptionalResolve
```

Takes the same arguments as `inject` and returns `T | null`. It returns `null` when nothing provides the token. Any other failure, such as a constructor that throws, propagates.

### asyncInject

```ts
const asyncInject: AsyncResolve
```

Takes the same arguments as `inject` and returns `Promise<T>`. The dependency starts resolving after the current construction has returned, so it can be used to break a circular dependency deliberately.

### provide

```ts
function provide<T>(target: ClassType | InjectionToken<T, any>, impl: ProviderInput<T>): Provider
```

Binds a token or a registered class to an implementation class, a value or a factory function. A class implementation keeps the scope it was registered with unless `scope` is given. A value has the scope of the token, or singleton. Throws `ClassNotInjectable` when `target` is a class that is not registered.

### registerInjectable

```ts
function registerInjectable<T extends ClassType>(
  target: T,
  options?: { scope?: InjectableScope; token?: InjectionToken<any, any>; schema?: StandardSchemaV1 },
): InjectionToken<InstanceType<T>, any>
```

Registers a class as injectable without decorator syntax. `@Injectable` calls this function.

### registerFactory

```ts
function registerFactory(
  target: ClassType,
  options?: { scope?: InjectableScope; token?: InjectionToken<any, any> },
): InjectionToken<any, any>
```

Registers a factory class without decorator syntax. `@Factory` calls this function.

### getInjectableToken

```ts
function getInjectableToken<R>(target: ClassType): InjectionToken<R>
```

Returns the token of a registered class. Throws `ClassNotInjectable` when the class is not registered.

### findInjectableToken

```ts
function findInjectableToken(target: ClassType): InjectionToken<any, any> | undefined
```

Like `getInjectableToken`, but returns `undefined` instead of throwing. Only a registration on the class itself counts; an undecorated subclass of an injectable class has no token.

### validateSync

```ts
function validateSync(schema: StandardSchemaV1, value: unknown, tokenName: string): unknown
```

Validates a value with a Standard Schema and returns the output. Throws `TokenValidationError` when the value is invalid or the schema validates asynchronously.

### isStandardSchema

```ts
function isStandardSchema(value: unknown): value is StandardSchemaV1
```

## Types

### Class types

```ts
type ClassType = new (...args: any[]) => any
type ClassTypeWithoutArguments = new () => any
type ClassTypeWithArgument<Arg> = new (arg: Arg) => any
type ClassTypeWithOptionalArgument<Arg> = new (arg?: Arg) => any
type ClassTypeWithInstance<T> = new (...args: any[]) => T
type ClassTypeWithInstanceAndArgument<T, Arg> = new (arg: Arg) => T
type ClassTypeWithInstanceAndOptionalArgument<T, Arg> = new (arg?: Arg) => T
```

### InjectionTokenSchemaType

```ts
type InjectionTokenSchemaType = StandardSchemaV1
```

### TokenArgsRequired

```ts
type TokenArgsRequired<S> // true when the schema does not accept undefined
```

### AnyInjectableType

```ts
type AnyInjectableType =
  | ClassType
  | InjectionToken<any, any>
  | BoundInjectionToken<any, any>
  | FactoryInjectionToken<any, any>
```

### InjectionTokenType

```ts
type InjectionTokenType =
  | InjectionToken<any, any>
  | BoundInjectionToken<any, any>
  | FactoryInjectionToken<any, any>
```

### Resolver signatures

- `AsyncResolve` - the overloads of `container.get` and `asyncInject`
- `SyncResolve` - the overloads of `container.getSync` and `inject`
- `OptionalResolve` - the overloads of `optional`

## Scope Compatibility

| Consumer  | May depend on                                    |
| --------- | ------------------------------------------------ |
| Singleton | Singleton, Transient                             |
| Request   | Singleton, Request, Transient                    |
| Transient | whatever the service that injects it may depend on |

`inject()`, `optional()` and `asyncInject()` all work with every scope. A singleton that reaches a request-scoped service, directly or through a transient, fails with `ScopeMismatchError`.

## Error Handling

### DIError

```ts
class DIError extends Error {
  readonly code: DIErrorCode
  readonly context?: Record<string, unknown>
  readonly cause?: unknown
}
```

| Code                       | Message                                                                                         | Context                               |
| -------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------- |
| `FactoryNotFound`          | `Factory <name> not found`                                                                      | `name`                                |
| `ClassNotInjectable`       | `Class <name> is not decorated with @Injectable.`                                               | `className`                           |
| `ScopeMismatchError`       | `Scope mismatch: <name> is request-scoped and cannot be resolved from the root container (<path>). ...` | `name`, `path`                |
| `CircularDependency`       | `Circular dependency detected: A -> B -> A`                                                     | `cycle`                               |
| `ProviderConflict`         | `Token <token> already has a default provider (<existing>); <incoming> cannot become a second default. ...` | `token`, `existing`, `incoming` |
| `TokenValidationError`     | `Validation failed for <token>`                                                                 | `schema`, `value`, `issues`           |
| `TokenSchemaRequiredError` | `Token <token> requires schema arguments and cannot be used with addInstance. ...`              | `token`                               |
| `AsyncInitRequired`        | `<name> or one of its dependencies has an asynchronous initializer and cannot be resolved synchronously. ...` | `name`                  |
| `InitializationError`      | `Service <name> initialization failed: <original message>`                                      | `serviceName`, `error`; `cause` is set |
| `ContainerDisposed`        | `ScopedContainer has been disposed`                                                             | `kind`                                |
| `UnknownError`             | varies                                                                                          | varies                                |

`InstanceNotFound` and `InstanceDestroying` exist in the enum but are not raised by the container in 2.0.

### Error Handling Example

```ts
import { DIError, DIErrorCode } from '@navios/di'

try {
  const service = await container.get(UserService)
} catch (error) {
  if (error instanceof DIError) {
    switch (error.code) {
      case DIErrorCode.FactoryNotFound:
        console.error('No provider:', error.context?.name)
        break
      case DIErrorCode.ScopeMismatchError:
        console.error('Scope mismatch:', error.context?.path)
        break
      case DIErrorCode.CircularDependency:
        console.error('Cycle:', error.context?.cycle)
        break
      case DIErrorCode.InitializationError:
        console.error('Failed to initialise:', error.cause)
        break
      default:
        console.error(error.message)
    }
  }
}
```

## Usage Examples

### Basic Service Registration

```ts
import { Container, Injectable } from '@navios/di'

@Injectable()
class UserService {
  getUsers() {
    return ['Alice', 'Bob']
  }
}

const container = new Container()
const userService = await container.get(UserService)
```

### Service with Dependencies

```ts
import { inject, Injectable } from '@navios/di'

@Injectable()
class EmailService {
  sendEmail(to: string, subject: string) {
    return `Email sent to ${to}: ${subject}`
  }
}

@Injectable()
class UserService {
  private readonly emailService = inject(EmailService)

  createUser(name: string, email: string) {
    this.emailService.sendEmail(email, 'Welcome!')
    return { name, email }
  }
}
```

### Injection Token Usage

```ts
import { Container, Injectable, InjectionToken } from '@navios/di'
import { z } from 'zod'

const configSchema = z.object({
  apiUrl: z.string(),
  timeout: z.number(),
})

const CONFIG_TOKEN = InjectionToken.create<ConfigService, typeof configSchema>(
  'APP_CONFIG',
  configSchema,
)

@Injectable({ token: CONFIG_TOKEN })
class ConfigService {
  constructor(private readonly config: z.output<typeof configSchema>) {}

  getApiUrl() {
    return this.config.apiUrl
  }
}

const container = new Container()
const config = await container.get(CONFIG_TOKEN, {
  apiUrl: 'https://api.example.com',
  timeout: 5000,
})
```

### Providers

```ts
import { Container, provide } from '@navios/di'

const container = new Container({
  providers: [
    provide(EmailService, FakeEmailService),
    provide(CLOCK, { value: { now: () => 0 } }),
    provide(ID_GENERATOR, { factory: () => ({ next: () => 'id-1' }) }),
  ],
})
```

### Factory Usage

```ts
import { Container, Factory } from '@navios/di'

@Factory()
class DatabaseConnectionFactory {
  create() {
    return { host: 'localhost', port: 5432, connected: true }
  }
}

const container = new Container()
const connection = await container.get(DatabaseConnectionFactory)
```

### Service Lifecycle

```ts
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

### Request Scope Usage

```ts
import { Container, inject, Injectable, InjectableScope, InjectionToken } from '@navios/di'

const REQUEST_ID = InjectionToken.create<string>('RequestId', {
  scope: InjectableScope.Request,
})

@Injectable({ scope: InjectableScope.Request })
class RequestLogger {
  private readonly requestId = inject(REQUEST_ID)

  log(message: string) {
    console.log(`[${this.requestId}] ${message}`)
  }
}

const container = new Container()

{
  await using scope = container.createScope()
  scope.addInstance(REQUEST_ID, 'req-1')

  const logger = await scope.get(RequestLogger)
  logger.log('handling request')
}
```

### Circular Dependency Handling

```ts
import { asyncInject, inject, Injectable } from '@navios/di'

@Injectable()
class ServiceA {
  private readonly serviceB = asyncInject(ServiceB)

  async doSomething() {
    const b = await this.serviceB
    return b.getValue()
  }
}

@Injectable()
class ServiceB {
  private readonly serviceA = inject(ServiceA)

  getValue() {
    return 'value from B'
  }
}
```
