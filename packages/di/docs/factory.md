# Factory Decorator

The `@Factory` decorator registers a factory class. When the class is resolved, the container instantiates it, calls its `create()` method and returns what `create()` returns. The factory object itself is not the service.

## Basic Usage

### Simple Factory

```ts
import { Container, Factory } from '@navios/di'

@Factory()
class DatabaseConnectionFactory {
  create() {
    return {
      host: 'localhost',
      port: 5432,
      connected: true,
    }
  }
}

const container = new Container()
const connection = await container.get(DatabaseConnectionFactory)
console.log(connection) // { host: 'localhost', port: 5432, connected: true }
```

`create()` may be synchronous or return a promise. A synchronous factory can be resolved with `getSync()` and injected with `inject()` like any other service.

### Factory with Configuration

A factory registered for a token with a schema receives the validated args as the second argument of `create()`:

```ts
import { Container, Factory, InjectionToken } from '@navios/di'
import { z } from 'zod'

import type { FactoryContext } from '@navios/di'

const emailConfigSchema = z.object({
  provider: z.enum(['smtp', 'sendgrid']),
  apiKey: z.string(),
})

interface EmailService {
  sendEmail(to: string, subject: string): Promise<string>
}

const EMAIL_SERVICE = InjectionToken.create<EmailService, typeof emailConfigSchema>(
  'EmailService',
  emailConfigSchema,
)

@Factory({ token: EMAIL_SERVICE })
class EmailServiceFactory {
  create(ctx: FactoryContext, config: z.output<typeof emailConfigSchema>): EmailService {
    return {
      sendEmail: async (to, subject) => `Sent via ${config.provider} to ${to}: ${subject}`,
    }
  }
}

const container = new Container()
const emailService = await container.get(EMAIL_SERVICE, {
  provider: 'sendgrid',
  apiKey: 'sg_123',
})
```

Each distinct args value has its own result.

## Factory vs Injectable

### Injectable Service

The container returns an instance of the class:

```ts
@Injectable()
class EmailService {
  sendEmail(to: string, subject: string) {
    return `Email sent to ${to}: ${subject}`
  }
}

const emailService = await container.get(EmailService) // an EmailService
```

### Factory Service

The container returns the result of `create()`:

```ts
@Factory()
class EmailServiceFactory {
  create() {
    return {
      sendEmail: (to: string, subject: string) => `Email sent to ${to}: ${subject}`,
    }
  }
}

const emailService = await container.get(EmailServiceFactory) // the object returned by create()
```

Use a factory when the value is not a class instance of your own, for example a client from a third-party library, or when it has to be built asynchronously.

## Factory Options

`@Factory` accepts `scope` and `token`:

```ts
import { Factory, InjectableScope } from '@navios/di'

@Factory({ scope: InjectableScope.Transient })
class RandomIdFactory {
  create() {
    return { id: crypto.randomUUID() }
  }
}

const first = await container.get(RandomIdFactory)
const second = await container.get(RandomIdFactory)
console.log(first === second) // false
```

With the default singleton scope `create()` runs once per container, and once per args value for a token with a schema.

A token has one default provider. A second `@Factory({ token })` or `@Injectable({ token })` for the same token throws `ProviderConflict`; bind the alternative with `provide()` instead.

### Registration without Decorators

`registerFactory()` does what `@Factory()` does:

```ts
import { registerFactory } from '@navios/di'

class ClockFactory {
  create() {
    return { now: () => Date.now() }
  }
}

registerFactory(ClockFactory)
```

## Dependencies

`inject()` works in `create()` and in factory functions as well, up to their first `await`. When the injected service has an asynchronous `onServiceInit` that has not finished, the factory is stopped at that call and runs again once the service is ready, so inject first and do work with side effects afterwards.

A factory class can inject dependencies in field initialisers, like an injectable class:

```ts
import { Factory, inject, Injectable } from '@navios/di'

@Injectable()
class ConfigService {
  getDatabaseUrl() {
    return 'postgres://localhost:5432/app'
  }
}

@Factory()
class DatabaseClientFactory {
  private readonly config = inject(ConfigService)

  async create() {
    const client = new DatabaseClient(this.config.getDatabaseUrl())
    await client.connect()
    return client
  }
}
```

## Factory Context

`create()` receives a `FactoryContext` as its first argument:

```ts
interface FactoryContext {
  inject: <T = any>(token: AnyInjectableType, args?: unknown) => Promise<T>
  container: IContainer
  addDestroyListener: (listener: () => void | Promise<void>) => void
}
```

- `ctx.inject()` resolves a dependency asynchronously. The dependency is tracked, so invalidating it also invalidates the value the factory produced.
- `ctx.container` is the container or scope the value is being built in.
- `ctx.addDestroyListener()` registers cleanup for the produced value. A value returned by a factory has no `onServiceDestroy()` hook of its own; this is the way to release its resources.

```ts
import { Factory } from '@navios/di'

import type { FactoryContext } from '@navios/di'

@Factory()
class DatabaseClientFactory {
  async create(ctx: FactoryContext) {
    const config = await ctx.inject<ConfigService>(ConfigService)
    const client = new DatabaseClient(config.getDatabaseUrl())
    await client.connect()

    ctx.addDestroyListener(async () => {
      await client.close()
    })

    return client
  }
}
```

## Function Providers

When a factory is only needed in one container, a function provider avoids the class. It receives the same context and the validated args:

```ts
import { Container, InjectionToken, provide } from '@navios/di'

const CLOCK = InjectionToken.create<{ now(): number }>('Clock')

const container = new Container({
  providers: [provide(CLOCK, { factory: () => ({ now: () => Date.now() }) })],
})
```

The function may return a promise. A `scope` can be given next to `factory`; the default is the token's scope, or singleton.

## Real-World Examples

### HTTP Client Factory

```ts
import { Container, Factory, InjectionToken } from '@navios/di'
import { z } from 'zod'

import type { FactoryContext } from '@navios/di'

const httpConfigSchema = z.object({
  baseUrl: z.string(),
  timeout: z.number().default(5000),
})

interface HttpClient {
  get<T>(path: string): Promise<T>
}

const HTTP_CLIENT = InjectionToken.create<HttpClient, typeof httpConfigSchema>(
  'HttpClient',
  httpConfigSchema,
)

@Factory({ token: HTTP_CLIENT })
class HttpClientFactory {
  create(ctx: FactoryContext, config: z.output<typeof httpConfigSchema>): HttpClient {
    return {
      async get<T>(path: string) {
        const response = await fetch(`${config.baseUrl}${path}`, {
          signal: AbortSignal.timeout(config.timeout),
        })
        return (await response.json()) as T
      },
    }
  }
}

const container = new Container()
const api = await container.get(HTTP_CLIENT, { baseUrl: 'https://api.example.com' })
const sameApi = await container.get(HTTP_CLIENT, { baseUrl: 'https://api.example.com' })
const other = await container.get(HTTP_CLIENT, { baseUrl: 'https://other.example.com' })

console.log(api === sameApi) // true
console.log(api === other) // false
```

The factory receives the output of the schema, so `config.timeout` is `5000` here.

### Connection Pool Factory

```ts
@Factory()
class ConnectionPoolFactory {
  private readonly config = inject(ConfigService)

  async create(ctx: FactoryContext) {
    const pool = new Pool({ connectionString: this.config.getDatabaseUrl(), max: 10 })
    await pool.query('SELECT 1')

    ctx.addDestroyListener(() => pool.end())

    return pool
  }
}

@Injectable()
class UserRepository {
  private readonly pool = inject(ConnectionPoolFactory)

  async findAll() {
    const result = await this.pool.query('SELECT * FROM users')
    return result.rows
  }
}
```

`UserRepository` injects the pool with `inject()`. Because `create()` is asynchronous, the first build of `UserRepository` waits for the pool and constructs `UserRepository` again; see [How a Class is Constructed](./injectable.md#how-a-class-is-constructed).

## Best Practices

### 1. Use factories for values you do not own

Wrap third-party clients, pools and handles in a factory. Use `@Injectable()` for your own classes.

### 2. Register cleanup with `addDestroyListener`

Anything opened in `create()` should be closed in a destroy listener.

### 3. Use tokens for interface-based factories

Register the factory with `@Factory({ token })` and inject the token, so consumers do not depend on the factory class.

### 4. Let errors propagate

An error thrown by `create()` is wrapped in a `DIError` with code `InitializationError` and the original error in `cause`. The failed result is not cached; the next resolution calls `create()` again.

## API Reference

### Factory Options

```ts
interface FactoryOptions {
  scope?: InjectableScope
  token?: InjectionToken<any, any>
}
```

### Factory Method Signature

```ts
interface Factorable<T> {
  create(ctx?: FactoryContext): Promise<T> | T
}

interface FactorableWithArgs<T, A extends InjectionTokenSchemaType> {
  create(ctx?: FactoryContext, ...args: [InferOutput<A>]): Promise<T> | T
}
```

### Registration Function

- `registerFactory(target, options?: { scope?, token? }): InjectionToken`
