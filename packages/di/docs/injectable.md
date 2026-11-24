# Injectable Decorator

The `@Injectable` decorator registers a class as a service that a container can build and inject.

## Basic Usage

### Simple Service Registration

```ts
import { Injectable } from '@navios/di'

@Injectable()
class UserService {
  getUsers() {
    return ['Alice', 'Bob', 'Charlie']
  }
}
```

### Service with Dependencies

```ts
import { inject, Injectable } from '@navios/di'

@Injectable()
class DatabaseService {
  async query(sql: string) {
    return [{ id: 1, name: 'Alice' }]
  }
}

@Injectable()
class UserService {
  private readonly db = inject(DatabaseService)

  async getUsers() {
    return this.db.query('SELECT * FROM users')
  }
}
```

## Configuration Options

`@Injectable` accepts `scope`, `token` and `schema`.

### Scope Configuration

```ts
import { Injectable, InjectableScope } from '@navios/di'

// Singleton (default): one instance per container
@Injectable({ scope: InjectableScope.Singleton })
class SingletonService {}

// Transient: a new instance for each injection
@Injectable({ scope: InjectableScope.Transient })
class TransientService {}

// Request: one instance per scope created with container.createScope()
@Injectable({ scope: InjectableScope.Request })
class RequestService {}
```

### Custom Injection Token

A class can be the default implementation of a token:

```ts
import { Injectable, InjectionToken } from '@navios/di'

interface UserRepository {
  findById(id: string): Promise<User | null>
}

const USER_REPOSITORY = InjectionToken.create<UserRepository>('UserRepository')

@Injectable({ token: USER_REPOSITORY })
class SqlUserRepository implements UserRepository {
  async findById(id: string) {
    return null
  }
}
```

Both `container.get(USER_REPOSITORY)` and `container.get(SqlUserRepository)` resolve the same instance, because the class uses the token as its own.

### One Default per Token

A token has at most one default implementation. Registering a second class for the same token throws at decoration time:

```ts
@Injectable({ token: USER_REPOSITORY })
class MongoUserRepository implements UserRepository {
  async findById(id: string) {
    return null
  }
}
// DIError (ProviderConflict): Token UserRepository already has a default provider
// (SqlUserRepository); MongoUserRepository cannot become a second default.
// Use provide(token, MongoUserRepository) on the container to replace it.
```

Register the alternative with a plain `@Injectable()` and bind it on the container:

```ts
import { Container, Injectable, provide } from '@navios/di'

@Injectable()
class MongoUserRepository implements UserRepository {
  async findById(id: string) {
    return null
  }
}

const container = new Container({
  providers: [provide(USER_REPOSITORY, MongoUserRepository)],
})
```

A class with the same name as the current default replaces it without an error. This is what happens when a module is evaluated again during hot reload.

### Registration without Decorators

`registerInjectable()` does what `@Injectable()` does and takes the same options. `@Injectable()` calls it, so both paths behave identically.

```ts
import { InjectableScope, registerInjectable } from '@navios/di'

class ReportBuilder {}

registerInjectable(ReportBuilder, { scope: InjectableScope.Transient })
```

It returns the token of the class.

## Injection Methods

All three functions must be called while an injectable class is being constructed: in a field initialiser or in the constructor. Calling them anywhere else throws.

### `inject`

`inject()` returns the instance. If the dependency does not exist yet, it is built immediately, inside the constructor that asked for it.

```ts
@Injectable()
class EmailService {
  sendEmail(to: string, subject: string) {
    return `Email sent to ${to}: ${subject}`
  }
}

@Injectable()
class NotificationService {
  private readonly emailService = inject(EmailService)

  notify(user: string, message: string) {
    return this.emailService.sendEmail(user, `Notification: ${message}`)
  }
}
```

`inject()` works for every scope. For a transient, each call returns its own instance:

```ts
@Injectable({ scope: InjectableScope.Transient })
class Counter {
  value = 0
}

@Injectable()
class Stats {
  private readonly hits = inject(Counter)
  private readonly misses = inject(Counter) // a different instance
}
```

Conditional calls are allowed:

```ts
@Injectable()
class Storage {
  private readonly backend = process.env.S3_BUCKET ? inject(S3Backend) : inject(DiskBackend)
}
```

### `optional`

`optional()` returns the instance, or `null` when nothing provides the token: no default provider, no provider on the container and no instance added with `addInstance()`.

```ts
const TRACER = InjectionToken.create<Tracer>('Tracer')

@Injectable()
class OrderService {
  private readonly tracer = optional(TRACER)

  placeOrder(order: Order) {
    this.tracer?.record('order.placed')
  }
}
```

`optional()` does not catch errors. If a provider exists and its constructor throws, the error propagates as it would with `inject()`.

### `asyncInject`

`asyncInject()` returns a promise of the instance. The dependency starts resolving after the current constructor has returned. Use it to break a circular dependency on purpose:

```ts
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

Await the promise in a method, not in `onServiceInit()`. A service that awaits it while it is still initialising waits for the dependency; if the dependency injects the service back, that is a cycle again and both fail with `CircularDependency`.

There is no other reason to prefer it over `inject()`.

## How a Class is Constructed

Resolution is synchronous first:

- A constructor runs once. Each `inject()` call returns a real, initialised instance.
- A dependency that is missing is built on the spot. If its `onServiceInit()` returns nothing or a non-promise value, it is ready at once.
- If a dependency has an `onServiceInit()` that returns a promise which has not settled, the current construction cannot finish. The container discards this construction pass, waits for the dependency and constructs the class again. This replay happens only on the first build of the class. On later builds the container remembers which dependencies the class asks for, waits for them first and constructs once.

Two rules follow from the replay:

1. Keep constructors and field initialisers free of side effects. They may run a second time on the first build.
2. Do not read properties of an injected service in the constructor. In a discarded pass, a dependency that is not ready is a placeholder that throws when it is accessed. Use `onServiceInit()`, where every dependency is initialised.

```ts
@Injectable()
class ReportService implements OnServiceInit {
  private readonly db = inject(DatabaseService) // has an async onServiceInit
  private tables: string[] = []

  async onServiceInit() {
    this.tables = await this.db.listTables()
  }
}
```

Transients injected during a discarded pass are reused by the replay, so a transient is not constructed twice either.

## Advanced Patterns

### Service with Configuration Schema

A `schema` makes the class take validated args. Each distinct args value has its own instance.

```ts
import { Container, inject, Injectable } from '@navios/di'
import { z } from 'zod'

const databaseConfigSchema = z.object({
  host: z.string(),
  port: z.number(),
})

@Injectable({ schema: databaseConfigSchema })
class DatabaseConfig {
  constructor(public readonly config: z.output<typeof databaseConfigSchema>) {}

  getConnectionString() {
    return `${this.config.host}:${this.config.port}`
  }
}

const container = new Container()
const config = await container.get(DatabaseConfig, { host: 'localhost', port: 5432 })

@Injectable()
class DatabaseService {
  private readonly config = inject(DatabaseConfig, { host: 'localhost', port: 5432 })
}
```

The schema can come from any Standard Schema library and must validate synchronously. `schema` and `token` cannot be used together; attach the schema to the token instead (see [Injection Tokens](./injection-tokens.md)).

### Service with Lifecycle Hooks

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

See [Service Lifecycle](./lifecycle.md).

## Scopes and Injection

| Consumer scope | May inject                                      |
| -------------- | ----------------------------------------------- |
| Singleton      | Singleton, Transient                            |
| Request        | Singleton, Request, Transient                   |
| Transient      | whatever the service that injects it may inject |

A singleton that injects a request-scoped service fails with `ScopeMismatchError`, also when a transient sits between them. The scope of a service never changes automatically. See [Scopes](./scopes.md#scope-rules).

## Error Handling

### Common Errors

```ts
// Not registered
class Plain {}
await container.get(Plain)
// DIError (ClassNotInjectable): Class Plain is not decorated with @Injectable.

// A token without a provider
const TOKEN = InjectionToken.create<Service>('Service')
await container.get(TOKEN)
// DIError (FactoryNotFound): Factory Service not found

// A constructor that throws
@Injectable()
class Broken {
  constructor() {
    throw new Error('boom')
  }
}
await container.get(Broken)
// DIError (InitializationError): Service Broken initialization failed: boom
```

An `InitializationError` keeps the original error in `cause`. When services are nested, the error of the innermost failing service propagates unchanged. A failed service is not cached; the next `get()` constructs it again.

## Best Practices

### 1. Use `inject` by default

```ts
@Injectable()
class UserService {
  private readonly db = inject(DatabaseService)
  private readonly mailer = inject(MailerToken)
}
```

### 2. Prefer singletons for stateless services

```ts
@Injectable()
class PriceCalculator {
  total(items: Item[]) {
    return items.reduce((sum, item) => sum + item.price, 0)
  }
}
```

### 3. Use injection tokens for interfaces

```ts
interface PaymentProcessor {
  processPayment(amount: number): Promise<string>
}

const PAYMENT_PROCESSOR = InjectionToken.create<PaymentProcessor>('PaymentProcessor')

@Injectable({ token: PAYMENT_PROCESSOR })
class StripePaymentProcessor implements PaymentProcessor {
  async processPayment(amount: number) {
    return `Processed $${amount} via Stripe`
  }
}
```

### 4. Do work in `onServiceInit`, not in the constructor

```ts
@Injectable()
class SearchIndex implements OnServiceInit {
  private readonly db = inject(DatabaseService)

  async onServiceInit() {
    await this.rebuild()
  }

  private async rebuild() {}
}
```

## API Reference

### Injectable Options

```ts
interface InjectableOptions {
  scope?: InjectableScope
  token?: InjectionToken<any, any>
  schema?: InjectionTokenSchemaType // any Standard Schema
}
```

### InjectableScope Enum

```ts
enum InjectableScope {
  Singleton = 'Singleton',
  Transient = 'Transient',
  Request = 'Request',
}
```

### Injection Methods

- `inject<T>(token, args?): T`
- `optional<T>(token, args?): T | null`
- `asyncInject<T>(token, args?): Promise<T>`

### Registration Functions

- `registerInjectable(target, options?): InjectionToken`
- `getInjectableToken(target): InjectionToken` - the token of a registered class; throws `ClassNotInjectable` otherwise
