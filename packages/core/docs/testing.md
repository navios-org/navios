# Testing

There are three levels, from fastest to most realistic:

1. The whole application on the in-memory adapter, with no server and no socket.
2. The whole application on a real adapter, through `app.inject()`.
3. The application listening on an ephemeral port, called with `fetch`.

Services that do not involve HTTP are tested with a DI container alone.

## The in-memory adapter

`defineInMemoryEnvironment()` from `@navios/core/testing` is an adapter without a server. It runs the same compiled routes as a real adapter, so guards, validation, error mapping and request state behave the same.

```ts
import { NaviosFactory } from '@navios/core'
import { createTestClient, defineInMemoryEnvironment } from '@navios/core/testing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { NaviosApplication } from '@navios/core'

import { createUser, getUser } from '../src/api.mjs'
import { AppModule } from '../src/app.module.mjs'

describe('users', () => {
  let app: NaviosApplication<any>

  beforeEach(async () => {
    app = await NaviosFactory.create(AppModule, {
      adapter: defineInMemoryEnvironment(),
      logger: false,
    })
  })

  afterEach(async () => {
    await app.close()
  })

  it('returns a user', async () => {
    const call = createTestClient(app)

    const found = await call(getUser, { urlParams: { id: '1' } })
    expect(found.status).toBe(200)
    expect(found.body).toEqual({ id: '1', name: 'Ann' })

    const invalid = await call(createUser, { data: { name: '' } })
    expect(invalid.status).toBe(400)
    expect(invalid.headers['content-type']).toBe('application/problem+json')
  })
})
```

Create a new application for each test and close it afterwards. `close()` disposes the container, which keeps tests independent.

Limitations of the in-memory adapter:

- `app.listen()` throws; there is no server.
- A request body that is not a string is handed to the pipeline as is. A multipart endpoint is tested by passing an object with strings and `File` values as `data`; no multipart encoding or parsing takes place.
- A malformed JSON string body produces a 400 problem response with `source: 'body'`, as on the Fastify and Bun adapters.
- `ctx.signal` never aborts.
- A trailing slash is ignored: `/users/` matches the route `/users`. The Fastify and Bun adapters do not ignore it.

Routes are matched as on the Fastify and Bun adapters: a static segment is preferred to a URL parameter, whatever the order of registration. With `/users/$userId` and `/users/export` declared, `GET /users/export` reaches `/users/export`.

## `createTestClient`

`createTestClient(app, options?)` returns a function that calls a builder endpoint against the application in process.

```ts
const call = createTestClient(app, {
  headers: { authorization: 'Bearer test-token' }, // sent with every call
  prefix: '/api', // the path prefix of the routes under test
})

const response = await call(listUsers, { params: { limit: 5 }, headers: { 'x-trace': '1' } })
```

- Arguments are typed from the declaration: `urlParams`, `params` (query) and `data` (body), plus optional per-call `headers`.
- The result is a `TestResponse`: `status`, `headers`, `text` (the raw body) and `body` (the body parsed as JSON when the content type is JSON, otherwise `undefined`).
- The client builds the path from the declaration's `url` only. When the routes are mounted under a `globalPrefix` or module prefixes, pass the combined prefix as `prefix`.

Limitation: this is a thin typed wrapper over `app.inject()`. It is not the `@navios/builder` client: it does not validate the response against the declaration, does not type `body`, and does not throw on error statuses. Assert on `status` and `body` yourself.

## `app.inject`

`app.inject(request)` handles one request in process on whatever adapter the application uses. It initialises the application if needed.

```ts
const response = await app.inject({
  method: 'POST',
  url: '/api/users?notify=true',
  headers: { authorization: 'Bearer test-token' },
  body: { name: 'Bob' },
})

expect(response.status).toBe(201)
expect(response.body).toEqual({ id: '2', name: 'Bob' })
```

`body` is sent as JSON unless it is a string, `FormData`, `Blob` or stream. On Fastify this goes through `fastify.inject()`, so Fastify's own parsing, hooks and plugins take part.

## Over real HTTP

To include the network layer, listen on port 0 and use `fetch`:

```ts
const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
  logger: false,
})
const base = await app.listen({ port: 0, host: '127.0.0.1' })

const response = await fetch(`${base}/users/1`)
```

`listen` returns the base URL. On Bun the options are `{ port: 0, hostname: '127.0.0.1' }`.

## Replacing dependencies

Pass providers to the application. They win over everything declared in modules.

```ts
@Injectable()
class FakeMailer {
  sent: string[] = []
  send(to: string) {
    this.sent.push(to)
  }
}

const app = await NaviosFactory.create(AppModule, {
  adapter: defineInMemoryEnvironment(),
  logger: false,
  providers: [provide(Mailer, FakeMailer), provide(ApiKey, { value: 'test-key' })],
})

const mailer = (await app.get(Mailer)) as FakeMailer
```

Request state can be set up the same way a real request would: send the header your guard reads, or replace the guard's dependency with a fake.

## Testing services with a DI container

A service that does not need HTTP is tested with a container from `@navios/di`:

```ts
import { Container, inject, Injectable } from '@navios/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('Greeter', () => {
  let container: Container

  beforeEach(() => {
    container = new Container()
  })

  afterEach(async () => {
    await container.dispose()
  })

  it('greets', async () => {
    @Injectable()
    class Names {
      pick() {
        return 'Ann'
      }
    }

    @Injectable()
    class Greeter {
      private readonly names = inject(Names)
      greet() {
        return `Hello, ${this.names.pick()}`
      }
    }

    const greeter = await container.get(Greeter)
    expect(greeter.greet()).toBe('Hello, Ann')
  })
})
```

`TestContainer` from `@navios/di/testing` adds bindings and assertions:

```ts
import { TestContainer } from '@navios/di/testing'

const container = new TestContainer()
container.bind(Mailer).toValue(fakeMailer)
container.bind(Clock).toClass(FixedClock)
container.bind(ApiKey).toFactory(() => 'test-key')

const service = await container.get(SignupService)
container.expectResolved(Mailer)

await container.clear()
```

A `TestContainer` can also back an application: pass it as the `container` option of `NaviosFactory.create`. The `@navios/di` documentation describes the test containers in full.

## Testing a guard or a request value in isolation

Guards and request values take a `RequestContext`, which is built by the pipeline. The practical way to test one is through a small module on the in-memory adapter:

```ts
it('rejects a request without a token', async () => {
  @Controller()
  class ProbeController {
    @Endpoint(probe)
    async probe() {
      return { ok: true }
    }
  }

  @Module({ controllers: [ProbeController], guards: [AuthGuard] })
  class ProbeModule {}

  const app = await NaviosFactory.create(ProbeModule, {
    adapter: defineInMemoryEnvironment(),
    logger: false,
  })

  expect((await createTestClient(app)(probe)).status).toBe(401)
  await app.close()
})
```
