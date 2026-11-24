# Container

The `Container` class is the entry point for dependency injection. It holds singletons, resolves services and creates scopes.

## Overview

A container:

- resolves instances with `get()` and `getSync()`
- decides which provider is used for a token (`providers`, `provide()`)
- destroys instances (`invalidate()`, `dispose()`)
- creates scopes for request-scoped services (`createScope()`)

Containers are independent. Two containers never share an instance, and nothing is registered in a container ahead of time: a class registered with `@Injectable()` can be resolved from any container.

## Basic Usage

### Creating a Container

```ts
import { Container, provide } from '@navios/di'

// Default container
const container = new Container()

// With options
const configured = new Container({
  providers: [provide(MailerToken, SesMailer)],
  strict: false,
  logger: console,
})
```

| Option      | Type              | Default | Meaning                                                                                               |
| ----------- | ----------------- | ------- | ----------------------------------------------------------------------------------------------------- |
| `providers` | `Provider[]`      | none    | Providers that replace or supply the defaults registered on tokens. Create them with `provide()`.     |
| `strict`    | `boolean`         | `false` | Use only the providers given to this container and ignore the defaults registered with `@Injectable`. |
| `logger`    | `Console \| null` | `null`  | Receives warnings, for example when `invalidate()` is given an unknown instance.                      |

### Getting Service Instances

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
console.log(userService.getUsers()) // ['Alice', 'Bob']
```

### Type-Safe Service Resolution

The return type is inferred from the class or the token. Args are type-checked against the schema.

```ts
// Class: Promise<UserService>
const userService = await container.get(UserService)

// Token with a schema: args are required and checked
const config = await container.get(ConfigToken, {
  apiUrl: 'https://api.example.com',
  timeout: 5000,
})

// Bound and factory tokens: no args
const boundConfig = await container.get(BoundConfigToken)
const factoryConfig = await container.get(FactoryConfigToken)

// Factory class: the type returned by create()
const connection = await container.get(DatabaseConnectionFactory)
```

### Synchronous Resolution

`getSync()` builds and returns the instance without a promise:

```ts
const userService = container.getSync(UserService)
```

It throws a `DIError` with code `AsyncInitRequired` when the service or one of its dependencies has an asynchronous initialiser that has not finished. The build keeps running in the background, so after `await container.ready()` the same call succeeds.

`tryGetSync()` never constructs anything. It returns an instance that is already built, or `null`:

```ts
const existing = container.tryGetSync<UserService>(UserService)
```

## Providers

`@Injectable()` and `@Factory()` attach a default provider to a token. A container can replace the provider of any token, or supply one for a token without a default.

### provide()

```ts
import { Container, InjectableScope, provide } from '@navios/di'

const container = new Container({
  providers: [
    // A class. It keeps the scope it was registered with.
    provide(MailerToken, SesMailer),

    // A class with an explicit scope
    provide(CacheToken, { class: MemoryCache, scope: InjectableScope.Transient }),

    // A value
    provide(ClockToken, { value: fakeClock }),

    // A function. It receives the factory context and the validated args.
    provide(ConfigToken, {
      factory: async (ctx, args) => {
        const env = await ctx.inject(EnvironmentService)
        return loadConfig(env, args)
      },
    }),
  ],
})
```

The first argument of `provide()` is an `InjectionToken` or a class registered with `@Injectable()` or `@Factory()`. Passing a class that is not registered throws `ClassNotInjectable`. The implementation class does not have to be registered itself.

### container.provide()

`container.provide(token, impl)` does the same on an existing container. It must be called before the token is first resolved in that container; afterwards it throws.

```ts
const container = new Container()
container.provide(UserRepository, InMemoryUserRepository)

const repository = await container.get(UserRepository) // InMemoryUserRepository
```

### Lookup order

For a token, the container uses the first of:

1. an instance already stored for the token, including one added with `addInstance()`
2. a provider given to this container (`providers` or `provide()`)
3. the default provider registered on the token, unless the container is `strict`

When none exists, resolution fails with `FactoryNotFound`.

### addInstance()

`addInstance()` stores a ready value for a token:

```ts
const RequestIdToken = InjectionToken.create<string>('RequestId')

container.addInstance(RequestIdToken, 'boot')
const id = await container.get(RequestIdToken) // 'boot'
```

On the root container the value is a singleton. A token whose args are required cannot be used directly; pass a bound token instead:

```ts
container.addInstance(InjectionToken.bound(ConfigToken, { apiUrl: '/api' }), configInstance)
```

Adding a second instance for the same token and args throws; invalidate the first one before replacing it.

## Decorating Instances

`decorate()` wraps every instance of a token. The function runs after the instance is constructed and initialised and before it is stored, so no other service ever sees the undecorated instance.

```ts
container.decorate(Greeter, (instance, info) => {
  // info.token is the token, info.args are the validated args
  const wrapped = Object.create(instance) as Greeter
  wrapped.greet = () => `${instance.greet()}!`
  return wrapped
})
```

Several decorators for one token run in the order in which they were added. Register decorators before the token is first resolved; instances that already exist are not decorated again.

## Advanced Usage

### Service Invalidation

`invalidate()` destroys an instance. Services that depend on it are destroyed first, then the instance itself, then the transients it injected. The next `get()` builds a new instance.

```ts
@Injectable()
class CacheService {
  private cache = new Map<string, unknown>()

  set(key: string, value: unknown) {
    this.cache.set(key, value)
  }

  get(key: string) {
    return this.cache.get(key)
  }
}

const cache = await container.get(CacheService)
cache.set('user:123', { name: 'Alice' })

await container.invalidate(cache)

const fresh = await container.get(CacheService)
console.log(fresh.get('user:123')) // undefined
```

`onInvalidate()` calls a listener when the instance for a token and args is destroyed, whether by `invalidate()` or by `dispose()`. It returns a function that removes the listener.

```ts
const stop = container.onInvalidate(CacheService, undefined, () => {
  console.log('CacheService was destroyed')
})

// later
stop()
```

The second argument is the args of the instance to watch; pass `undefined` for a service without args.

### Waiting for Operations

`ready()` resolves when no service of the container is still being created:

```ts
void container.get(DatabaseService) // has an async onServiceInit
await container.ready()
```

### Injecting the Container

The container can be injected. A service always receives the root container:

```ts
@Injectable()
class Dispatcher {
  private readonly container = inject(Container)

  async handle(command: Command) {
    const handler = await this.container.get(command.handler)
    return handler.run(command)
  }
}
```

## Scopes

Request-scoped services cannot be resolved from the root container. Create a scope:

```ts
import { Container, Injectable, InjectableScope } from '@navios/di'

@Injectable({ scope: InjectableScope.Request })
class RequestLogger {}

const container = new Container()

{
  await using scope = container.createScope({ userId: 456 })
  const logger = await scope.get(RequestLogger)
}

// Without `await using`
const scope = container.createScope()
try {
  const logger = await scope.get(RequestLogger)
} finally {
  await scope.dispose()
}
```

Resolving a request-scoped service from the root container fails:

```ts
await container.get(RequestLogger)
// DIError (ScopeMismatchError): Scope mismatch: RequestLogger is request-scoped and cannot be
// resolved from the root container. Resolve it from a scope created with
// container.createScope(), and do not inject it into a singleton.
```

Scopes are described in [Scoped Containers](./request-contexts.md).

## Best Practices

### 1. Create one container per application

```ts
// app.mts
const container = new Container()

const app = await container.get(Application)
await app.start()
```

### 2. Use a fresh container per test

```ts
let container: Container

beforeEach(() => {
  container = new Container({
    providers: [provide(DatabaseService, FakeDatabaseService)],
  })
})

afterEach(async () => {
  await container.dispose()
})
```

### 3. Handle errors by code

```ts
import { DIError, DIErrorCode } from '@navios/di'

try {
  const service = await container.get(UserService)
} catch (error) {
  if (error instanceof DIError && error.code === DIErrorCode.FactoryNotFound) {
    // nothing provides one of the tokens
  }
  throw error
}
```

### 4. Dispose scopes

Use `await using` or a `finally` block so that request-scoped instances are destroyed even when the work fails.

### 5. Clean up on shutdown

```ts
process.on('SIGTERM', async () => {
  await container.dispose()
  process.exit(0)
})
```

`dispose()` waits for services that are still being created and then destroys every instance in reverse creation order. A destroy hook that throws does not stop the others. The container can be used again afterwards; it starts empty.

## API Reference

### Constructor

```ts
new Container(options?: ContainerOptions)

interface ContainerOptions {
  providers?: Provider[]
  strict?: boolean
  logger?: Console | null
}
```

### Methods

#### `get(token, args?): Promise<T>`

Resolves an instance, waiting for asynchronous initialisers.

#### `getSync(token, args?): T`

Resolves an instance synchronously. Throws `AsyncInitRequired` when an asynchronous initialiser is pending.

#### `tryGetSync<T>(token, args?): T | null`

Returns an instance that is already built, or `null`. Never constructs.

#### `provide<T>(token, impl: ProviderInput<T>): void`

Replaces or supplies the provider for a token in this container. Must be called before the token is first resolved here.

#### `decorate<T>(token, decorator: (instance: T, info: { token; args }) => T): void`

Wraps every instance of the token.

#### `addInstance<T>(token, instance: T): void`

Stores a ready value for a class, a token or a bound token.

#### `isRegistered(token): boolean`

Returns `true` when the token has an instance or a provider in this container.

#### `getProvider(token): ProviderRecord | undefined`

Returns the provider that would be used for the token. The record has `kind` (`'class'`, `'factory'`, `'function'` or `'value'`), `scope` and `target`.

#### `createScope(metadata?: Record<string, any>): ScopedContainer`

Creates a scope for request-scoped services.

#### `invalidate(service: unknown): Promise<void>`

Destroys an instance and the services that depend on it.

#### `onInvalidate(token, args, listener: () => void): () => void`

Calls `listener` when the instance for `token` and `args` held by this container is destroyed. Returns a function that removes the listener.

#### `ready(): Promise<void>`

Waits until no service is still being created.

#### `dispose(): Promise<void>`

Destroys every instance. `Container` also implements `Symbol.asyncDispose`.

## ScopedContainer API

Created with `container.createScope()`. `get`, `getSync`, `tryGetSync`, `addInstance`, `isRegistered`, `invalidate`, `onInvalidate`, `ready` and `dispose` have the same signatures as on `Container`.

### Additional methods

#### `getParent(): Container`

Returns the container that created the scope.

#### `getMetadata(key: string): any | undefined`

#### `setMetadata(key: string, value: any): void`

Read and write the metadata passed to `createScope()`.

#### `[Symbol.asyncDispose](): Promise<void>`

Calls `dispose()`, which makes `await using` work.

## Error Handling

Every error raised by the container is a `DIError`. The `code` property is a `DIErrorCode`:

| Code                       | Raised when                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------- |
| `FactoryNotFound`          | nothing provides the token                                                                           |
| `ClassNotInjectable`       | a class that was never registered is used as a token                                                 |
| `ScopeMismatchError`       | a request-scoped service is reached from the root container                                          |
| `CircularDependency`       | services depend on each other through `inject()`                                                     |
| `ProviderConflict`         | a token is given a second, different default provider                                                |
| `TokenValidationError`     | args do not match the token's schema, or the schema validates asynchronously                         |
| `TokenSchemaRequiredError` | `addInstance()` is called with a token whose args are required                                       |
| `AsyncInitRequired`        | `getSync()` meets an unfinished asynchronous initialiser                                             |
| `InitializationError`      | a constructor, `create()` or `onServiceInit()` throws something that is not a `DIError`; see `cause` |
| `ContainerDisposed`        | a disposed scope is used                                                                             |
| `UnknownError`             | other misuse, for example `provide()` after the token was resolved                                   |
