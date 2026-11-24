# Navios DI

A type-safe dependency injection library for TypeScript. Navios DI uses decorators to register classes, resolves dependencies synchronously whenever it can, and supports singletons, transients, request-scoped services, factories, injection tokens and service lifecycle hooks.

## Features

- **Type-safe**: resolved types are inferred from classes and tokens
- **Decorator-based**: `@Injectable()` and `@Factory()` register a class; `registerInjectable()` and `registerFactory()` do the same without decorator syntax
- **Sync-first resolution**: a constructor runs once and `inject()` returns the real instance, including transients
- **Explicit providers**: replace an implementation with `provide()` instead of a global registry or priorities
- **Scopes**: singleton, transient and request scope, with `createScope()` for a unit of work
- **Lifecycle hooks**: `onServiceInit()` and `onServiceDestroy()`
- **Injection tokens**: interface-based resolution, with args validated by any Standard Schema library
- **Circular dependency detection**: reported with the full path, in production as well
- **Testing utilities**: `TestContainer` and `UnitTestContainer`
- **No runtime dependencies**: resolution does not use `AsyncLocalStorage`, and there is a single build for every platform

## Installation

```bash
npm install @navios/di
# or
yarn add @navios/di
```

A schema library is needed only if you give tokens args. Any library that implements [Standard Schema](https://standardschema.dev) works, for example zod, valibot or arktype.

## Quick Start

### Basic Usage

```ts
import { Container, inject, Injectable } from '@navios/di'

@Injectable()
class DatabaseService {
  async connect() {
    return 'Connected to database'
  }
}

@Injectable()
class UserService {
  private readonly db = inject(DatabaseService)

  async getUsers() {
    const connection = await this.db.connect()
    return `Users from ${connection}`
  }
}

const container = new Container()
const userService = await container.get(UserService)
console.log(await userService.getUsers()) // "Users from Connected to database"
```

## Core Concepts

### Container

The `Container` holds singletons and creates scopes.

```ts
import { Container, provide } from '@navios/di'

const container = new Container()

// Resolve an instance, waiting for asynchronous initialisers
const service = await container.get(MyService)

// Resolve synchronously; throws if an asynchronous initialiser is still pending
const same = container.getSync(MyService)

// Destroy an instance and everything that depends on it
await container.invalidate(service)

// Wait for services that are still initialising
await container.ready()

// Destroy every instance
await container.dispose()
```

A container accepts options:

```ts
const container = new Container({
  providers: [provide(Mailer, FakeMailer)], // replace or supply providers
  strict: false, // true: ignore providers registered with @Injectable
  logger: console, // optional, default null
})
```

Each `Container` has its own instances. Two containers never share a singleton, so a fresh `Container` is all the isolation a test needs.

### Scopes (ScopedContainer)

Request-scoped services live in a scope created with `createScope()`. A scope has its own request-scoped instances and resolves singletons from its parent container.

```ts
import { Container, Injectable, InjectableScope } from '@navios/di'

@Injectable({ scope: InjectableScope.Request })
class RequestLogger {}

const container = new Container()

const scope = container.createScope({ userId: 456 })
const logger = await scope.get(RequestLogger)

scope.setMetadata('correlationId', 'abc-123')
const correlationId = scope.getMetadata('correlationId')

// Destroys every request-scoped instance of this scope
await scope.dispose()
```

`ScopedContainer` implements `Symbol.asyncDispose`, so a scope can be disposed automatically:

```ts
{
  await using scope = container.createScope()
  const logger = await scope.get(RequestLogger)
} // scope.dispose() has run here
```

### Injectable Decorator

The `@Injectable` decorator registers a class:

```ts
import { Injectable, InjectableScope, InjectionToken } from '@navios/di'

// Singleton (default)
@Injectable()
class SingletonService {}

// Transient: a new instance for each injection
@Injectable({ scope: InjectableScope.Transient })
class TransientService {}

// Request: one instance per scope
@Injectable({ scope: InjectableScope.Request })
class RequestService {}

// Default implementation of a token
interface Mailer {
  send(to: string): Promise<void>
}
const MailerToken = InjectionToken.create<Mailer>('Mailer')

@Injectable({ token: MailerToken })
class SmtpMailer implements Mailer {
  async send(to: string) {}
}
```

A token has at most one default implementation. A second `@Injectable({ token })` with a different class throws a `DIError` with code `ProviderConflict` when the class is decorated. To use another implementation, bind it on the container with `provide()` (see [Providers](#providers)).

### Injection Methods

All three functions are called in a field initialiser or in the constructor of an injectable class.

#### `inject`

Returns the instance. Use it by default.

```ts
@Injectable()
class EmailService {
  sendEmail(message: string) {
    return `Email sent: ${message}`
  }
}

@Injectable()
class NotificationService {
  private readonly emailService = inject(EmailService)

  notify(message: string) {
    return this.emailService.sendEmail(message)
  }
}
```

`inject()` builds a missing dependency immediately, inside the constructor that asked for it. It works for every scope. Injecting a transient gives each call its own instance:

```ts
@Injectable({ scope: InjectableScope.Transient })
class Buffer {}

@Injectable()
class Pipeline {
  private readonly input = inject(Buffer)
  private readonly output = inject(Buffer) // a different instance
}
```

A constructor runs once. The one exception is the first build of a class whose dependency has an `onServiceInit()` that returns a promise which has not settled yet. The container then discards that construction pass, waits for the dependency and constructs the class again. Later builds of the same class wait for such dependencies first and construct once. Keep constructors free of side effects and do not read properties of injected services in the constructor; use `onServiceInit()` for that.

#### `asyncInject`

Returns a promise of the instance. The dependency starts resolving after the current constructor has returned, which makes it the way to break a circular dependency on purpose.

```ts
@Injectable()
class ServiceA {
  private readonly b = asyncInject(ServiceB)

  async run() {
    const b = await this.b
    return b.value()
  }
}

@Injectable()
class ServiceB {
  private readonly a = inject(ServiceA)

  value() {
    return 'b'
  }
}
```

#### `optional`

Returns the instance, or `null` when nothing provides the token. Every other failure propagates, for example a constructor that throws.

```ts
@Injectable()
class FeatureService {
  private readonly analytics = optional(AnalyticsToken)

  track(event: string) {
    this.analytics?.track(event)
  }
}
```

### Factory Decorator

A factory class produces the value for its token in `create()`:

```ts
import { Factory } from '@navios/di'

import type { FactoryContext } from '@navios/di'

@Factory()
class DatabaseConnectionFactory {
  async create(ctx: FactoryContext) {
    const config = await ctx.inject(ConfigService)
    const connection = { host: config.host, connected: true }
    ctx.addDestroyListener(() => {
      connection.connected = false
    })
    return connection
  }
}

const connection = await container.get(DatabaseConnectionFactory)
console.log(connection) // { host: 'localhost', connected: true }
```

`@Factory` accepts `scope` and `token`. A factory class may also use `inject()` in field initialisers.

### Service Lifecycle

```ts
import { Injectable } from '@navios/di'

import type { OnServiceDestroy, OnServiceInit } from '@navios/di'

@Injectable()
class DatabaseService implements OnServiceInit, OnServiceDestroy {
  private connection: Connection | null = null

  async onServiceInit() {
    this.connection = await connectToDatabase()
  }

  async onServiceDestroy() {
    await this.connection?.close()
  }
}
```

`onServiceInit()` runs after construction. An instance is never handed to another service or returned from `get()` before its `onServiceInit()` has finished. `onServiceDestroy()` runs when the instance is invalidated or its container or scope is disposed. Instances are destroyed in reverse creation order, dependents first.

### Injection Tokens

Tokens decouple a dependency from its implementation. A token is identified by the token object itself; its name is used only in messages.

#### Basic token

```ts
import { Container, Injectable, InjectionToken } from '@navios/di'

interface Clock {
  now(): number
}

const ClockToken = InjectionToken.create<Clock>('Clock')

@Injectable({ token: ClockToken })
class SystemClock implements Clock {
  now() {
    return Date.now()
  }
}

const clock = await new Container().get(ClockToken)
```

#### Token with args

A schema makes the token take args. The args are validated when the token is resolved, and each distinct args value has its own instance.

```ts
import { Container, Injectable, InjectionToken } from '@navios/di'
import { z } from 'zod'

const configSchema = z.object({
  apiUrl: z.string(),
  timeout: z.number(),
})

const ConfigToken = InjectionToken.create<ConfigService, typeof configSchema>(
  'Config',
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

Any Standard Schema works in place of zod. The schema must validate synchronously; a schema whose validation returns a promise is rejected with `TokenValidationError`.

#### Bound token

```ts
const ProductionConfig = InjectionToken.bound(ConfigToken, {
  apiUrl: 'https://api.prod.com',
  timeout: 10000,
})

const config = await container.get(ProductionConfig)
```

#### Factory token

```ts
const DynamicConfig = InjectionToken.factory(ConfigToken, async (ctx) => {
  const env = await ctx.inject(EnvironmentService)
  return {
    apiUrl: env.apiUrl,
    timeout: env.timeout,
  }
})

const config = await container.get(DynamicConfig)
```

The factory runs at most once per root container. The value is stored on the container, so two containers compute it separately.

### Injectable with Schema

A class can take validated args without a separate token:

```ts
import { Container, Injectable } from '@navios/di'
import { z } from 'zod'

const databaseConfigSchema = z.object({
  host: z.string(),
  port: z.number(),
})

@Injectable({ schema: databaseConfigSchema })
class DatabaseConfig {
  constructor(public readonly config: z.output<typeof databaseConfigSchema>) {}
}

const container = new Container()
const config = await container.get(DatabaseConfig, { host: 'localhost', port: 5432 })
```

Inside another service, pass the args to `inject()`:

```ts
@Injectable()
class DatabaseService {
  private readonly dbConfig = inject(DatabaseConfig, { host: 'localhost', port: 5432 })
}
```

`schema` and `token` cannot be combined in one `@Injectable`; put the schema on the token instead.

## Advanced Usage

### Providers

`@Injectable()` and `@Factory()` give a token its default provider. A container can replace the provider of any token, or supply one for a token that has no default, with `provide()`:

```ts
import { Container, InjectableScope, provide } from '@navios/di'

const container = new Container({
  providers: [
    provide(MailerToken, SesMailer), // a class
    provide(ClockToken, { value: fakeClock }), // a value
    provide(CacheToken, { class: MemoryCache, scope: InjectableScope.Transient }),
    provide(ConfigToken, { factory: (ctx, args) => loadConfig(args) }),
  ],
})

// The same on an existing container, before the token is first resolved there
container.provide(UserRepository, InMemoryUserRepository)
```

The first argument is a token or a registered class. A class implementation keeps the scope it was registered with unless `scope` is given. The lookup order is: the container's own providers, then the token's default. With `strict: true` the defaults are ignored and only the container's own providers are used.

### Decorating Instances

`container.decorate()` wraps every instance of a token after it is constructed and initialised and before anything else can see it:

```ts
container.decorate(Greeter, (instance, { token, args }) => {
  const wrapped = Object.create(instance) as Greeter
  wrapped.greet = () => `${instance.greet()}!`
  return wrapped
})
```

### Scope Rules

A service is always built in its declared scope. A singleton is built against the root container even when it is requested through a scope, so it cannot depend on a request-scoped service. This is an error, not an automatic change of scope:

```ts
@Injectable({ scope: InjectableScope.Request })
class RequestContext {}

@Injectable()
class Singleton {
  private readonly ctx = inject(RequestContext)
}

await container.get(Singleton)
// DIError (ScopeMismatchError): Scope mismatch: RequestContext is request-scoped and cannot
// be resolved from the root container (Singleton -> RequestContext). ...
```

The same applies through a transient (`Singleton -> Transient -> Request`) and to `container.get()` of a request-scoped service on the root container. To fix it, make the consumer request-scoped, or resolve the request-scoped service from the scope where it is needed and pass the value in as a method argument.

### Circular Dependency Detection

A cycle made of `inject()` calls fails with the path:

```ts
@Injectable()
class ServiceA {
  private readonly b = inject(ServiceB)
}

@Injectable()
class ServiceB {
  private readonly a = inject(ServiceA)
}

await container.get(ServiceA)
// DIError (CircularDependency): Circular dependency detected: ServiceA -> ServiceB -> ServiceA
```

Break the cycle by replacing one side with `asyncInject()`. Cycles between services that are being built concurrently are detected as well, so resolution never hangs.

### Error Handling

Every error raised by the container is a `DIError` with a `code`:

```ts
import { DIError, DIErrorCode } from '@navios/di'

try {
  await container.get(UserService)
} catch (error) {
  if (error instanceof DIError) {
    switch (error.code) {
      case DIErrorCode.FactoryNotFound:
        // nothing provides the token
        break
      case DIErrorCode.ScopeMismatchError:
        // a request-scoped service was reached from the root container
        break
      case DIErrorCode.CircularDependency:
        break
      case DIErrorCode.InitializationError:
        console.error(error.cause) // the error thrown by the constructor or onServiceInit
        break
    }
  }
}
```

An error thrown by a constructor or by `onServiceInit()` is wrapped in a `DIError` with code `InitializationError`; the original error is in `cause`. A failed service is not cached, so the next `get()` tries again.

### Service Invalidation

```ts
const service = await container.get(UserService)

const stop = container.onInvalidate(UserService, undefined, () => {
  console.log('UserService was destroyed')
})

// Destroys the services that depend on it, then the service itself
await container.invalidate(service)

// A new instance is built on the next access
const fresh = await container.get(UserService)

stop() // remove the listener
```

## API Reference

### Container

- `new Container(options?: { providers?: Provider[]; strict?: boolean; logger?: Console | null })`
- `get(token, args?): Promise<T>` - resolve an instance, waiting for asynchronous initialisers
- `getSync(token, args?): T` - resolve synchronously; throws `AsyncInitRequired` if an asynchronous initialiser is pending
- `tryGetSync<T>(token, args?): T | null` - return an instance that is already built, never construct
- `provide(token, impl): void` - replace or supply a provider; must be called before the token is first resolved
- `decorate(token, fn): void` - wrap every instance of a token
- `addInstance(token, instance): void` - store a ready value for a token
- `isRegistered(token): boolean` - whether the token can be resolved in this container
- `getProvider(token): ProviderRecord | undefined` - the provider that would be used
- `createScope(metadata?): ScopedContainer` - create a scope for request-scoped services
- `invalidate(service): Promise<void>` - destroy an instance and its dependents
- `onInvalidate(token, args, listener): () => void` - listen for the destruction of an instance
- `ready(): Promise<void>` - wait for services that are still initialising
- `dispose(): Promise<void>` - destroy every instance

### ScopedContainer

Created with `container.createScope()`. It has `get`, `getSync`, `tryGetSync`, `addInstance`, `isRegistered`, `invalidate`, `onInvalidate`, `ready` and `dispose` with the same meaning as on `Container`, and in addition:

- `getParent(): Container`
- `getMetadata(key): any | undefined`
- `setMetadata(key, value): void`
- `[Symbol.asyncDispose]()` - calls `dispose()`

After `dispose()`, `get` and `getSync` fail with a `DIError` with code `ContainerDisposed`.

### Decorators and registration

- `@Injectable(options?: { scope?, token?, schema? })`
- `@Factory(options?: { scope?, token? })`
- `registerInjectable(target, options?)` and `registerFactory(target, options?)` - the same without decorator syntax; both return the token
- `provide(tokenOrClass, impl): Provider`
- `getInjectableToken(target): InjectionToken`

### Injection Methods

- `inject(token, args?): T`
- `asyncInject(token, args?): Promise<T>`
- `optional(token, args?): T | null`

### Injection Tokens

- `InjectionToken.create<T>(name)`
- `InjectionToken.create<T, S>(name, schema)`
- `InjectionToken.create<T>(name, { scope?, schema? })`
- `InjectionToken.bound(token, value)`
- `InjectionToken.factory(token, factory)`

### Lifecycle Interfaces

- `OnServiceInit` - `onServiceInit(): Promise<void> | void`
- `OnServiceDestroy` - `onServiceDestroy(): Promise<void> | void`

## Testing

A fresh `Container` per test is isolated from every other container. For most tests, replace dependencies with `provide()`:

```ts
import { Container, provide } from '@navios/di'

const container = new Container({
  providers: [provide(DatabaseService, FakeDatabaseService)],
})
```

### TestContainer

`TestContainer` extends `Container` with a fluent binding API, assertion helpers, method call tracking and dependency graph inspection. `bind()` uses the same mechanism as `provide()`.

```ts
import { TestContainer } from '@navios/di/testing'

describe('UserService', () => {
  let container: TestContainer

  beforeEach(() => {
    container = new TestContainer()
  })

  afterEach(async () => {
    await container.clear()
  })

  it('should create user', async () => {
    // Bind to a value
    container.bind(DatabaseService).toValue({
      save: vi.fn().mockResolvedValue({ id: '1' }),
    })

    // Or bind to a class
    container.bind(MailerToken).toClass(FakeMailer)

    // Or bind to a factory
    container.bind(ConfigToken).toFactory(() => ({ apiKey: 'test' }))

    const userService = await container.get(UserService)
    const user = await userService.create({ name: 'John' })

    expect(user.id).toBe('1')

    // Assertion helpers
    container.expectResolved(UserService)
    container.expectSingleton(UserService)

    // Method call tracking
    container.recordMethodCall(UserService, 'create', [{ name: 'John' }], user)
    container.expectCalled(UserService, 'create')
    container.expectCalledWith(UserService, 'create', [{ name: 'John' }])
    container.expectCallCount(UserService, 'create', 1)

    // Dependency graph inspection
    const graph = container.getDependencyGraph()
  })
})
```

### UnitTestContainer

`UnitTestContainer` is a strict container: only the services listed in `providers` can be resolved, and method calls on them are tracked through a proxy.

```ts
import { DIError } from '@navios/di'
import { UnitTestContainer } from '@navios/di/testing'

describe('UserService unit tests', () => {
  let container: UnitTestContainer

  beforeEach(() => {
    container = new UnitTestContainer({
      providers: [
        { token: UserService, useClass: MockUserService },
        { token: ConfigToken, useValue: { apiUrl: 'test' } },
        { token: ApiClient, useFactory: () => new MockApiClient() },
      ],
    })
  })

  afterEach(async () => {
    await container.dispose()
  })

  it('should track method calls automatically', async () => {
    const service = await container.get(UserService)
    await service.findUser('123')

    container.expectCalled(UserService, 'findUser')
    container.expectCalledWith(UserService, 'findUser', ['123'])
    container.expectNotCalled(UserService, 'deleteUser')
  })

  it('should throw on unregistered dependencies', async () => {
    await expect(container.get(UnregisteredService)).rejects.toThrow(DIError)
  })

  it('should auto-mock unregistered dependencies', async () => {
    container.enableAutoMocking()
    const mock = await container.get(UnregisteredService)
    container.expectAutoMocked(UnregisteredService)
    container.disableAutoMocking()
  })
})
```

## Best Practices

1. **Use `inject` by default.** It returns the real instance for every scope.
2. **Use `asyncInject` only to break a cycle.**
3. **Use `optional` for dependencies that may have no provider.** It does not hide errors of a provider that exists.
4. **Keep constructors free of side effects.** Put work that uses dependencies in `onServiceInit()`.
5. **Implement lifecycle hooks** for resources that must be opened and closed.
6. **Use injection tokens** for configuration and interface-based dependencies.
7. **Replace implementations with `provide()`**, not by registering a second default.
8. **Never inject a request-scoped service into a singleton.** Make the consumer request-scoped.
9. **Dispose scopes**, with `await using` or in a `finally` block.

## Legacy Decorator Support

If you cannot use Stage 3 (native ES) decorators, for example in a TypeScript project that has `experimentalDecorators` enabled, with certain bundler configurations, or with Bun, use the legacy-compatible decorators:

```ts
import { Container, inject } from '@navios/di'
import { Factory, Injectable } from '@navios/di/legacy-compat'

@Injectable()
class UserService {
  private readonly db = inject(DatabaseService)
}

const container = new Container()
const userService = await container.get(UserService)
```

### TypeScript Configuration for Legacy Decorators

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

## Documentation

Guides for each topic are in the [docs](./docs/README.md) directory. To upgrade from 1.x, read the [migration guide](./docs/migration.md).

## License

MIT
