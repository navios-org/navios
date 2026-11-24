---
title: Testing
---

# Testing

A Navios application can be tested at three levels, from fastest to most realistic:

1. The whole application on the in-memory adapter, with no server and no socket.
2. The whole application on a real adapter, through `app.inject()`.
3. The application listening on an ephemeral port, called with `fetch`.

Start with the first. It runs the same compiled routes as a real adapter, so guards, validation, error mapping and request state behave the same. A service that does not involve HTTP is tested with a DI container alone; see [Testing](/docs/di/guides/testing) in the DI docs.

The examples use Vitest. Nothing here depends on it.

## The in-memory adapter

`defineInMemoryEnvironment()` from `@navios/core/testing` is an adapter without a server. `createTestClient(app)` returns a function that calls a declaration against the application in process.

```ts title="users.spec.mts"
import { NaviosFactory } from '@navios/core'
import { createTestClient, defineInMemoryEnvironment } from '@navios/core/testing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { NaviosApplication } from '@navios/core'

// AppModule, getUser and createUser come from the Quick start
import { AppModule } from './app.module.mjs'
import { createUser, getUser } from './users.mjs'

describe('users', () => {
  let app: NaviosApplication

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

    const found = await call(getUser, { urlParams: { userId: '1' } })

    expect(found.status).toBe(200)
    expect(found.body).toEqual({ id: '1', name: 'Ada', email: 'ada@example.com' })
  })

  it('rejects an invalid body', async () => {
    const call = createTestClient(app)

    const invalid = await call(createUser, { data: { name: 'Grace', email: 'nope' } })

    expect(invalid.status).toBe(400)
    expect(invalid.headers['content-type']).toBe('application/problem+json')
    expect(invalid.body).toMatchObject({ source: 'body' })
  })
})
```

Create a new application for each test and close it afterwards. `close()` disposes the container, which keeps tests independent.

What the in-memory adapter does not do:

- `app.listen()` throws; there is no server.
- A request body that is not a string is handed to the pipeline as is. A multipart endpoint is tested by passing an object with strings and `File` values as `data`; no multipart encoding or parsing takes place.
- `ctx.signal` never aborts.

## The test client

```ts
const call = createTestClient(app, {
  headers: { 'x-api-key': 'secret' }, // sent with every call
  prefix: '/api', // the path prefix of the routes under test
})

const response = await call(listUsers, { params: { limit: 5 }, headers: { 'x-trace': '1' } })
```

- Arguments are typed from the declaration: `urlParams`, `params` (query) and `data` (body), plus optional per-call `headers`.
- The result is a `TestResponse`: `status`, `headers`, `text` (the raw body) and `body` (the body parsed as JSON when the content type is JSON, otherwise `undefined`).
- The client builds the path from the declaration's `url` only. When the routes are mounted under a `globalPrefix` or [module prefixes](/docs/server/essentials/modules#prefixes), pass the combined prefix as `prefix`.

:::info
The test client is a thin typed wrapper over `app.inject()`, not the `@navios/builder` client. It does not validate the response against the declaration, does not type `body`, and does not throw on error statuses. Assert on `status` and `body` yourself.
:::

## Injecting requests

`app.inject(request)` handles one request in process on whatever adapter the application uses, and initialises the application if needed. Use it for a request no declaration describes, or to exercise a real adapter without a socket.

```ts
const response = await app.inject({
  method: 'POST',
  url: '/users',
  headers: { 'x-api-key': 'secret' },
  body: { name: 'Grace', email: 'grace@example.com' },
})

expect(response.status).toBe(201)
expect(response.body).toMatchObject({ name: 'Grace' })
```

`url` is a path with an optional query string. `body` is sent as JSON unless it is a string, `FormData`, `Blob` or stream. On Fastify the request goes through Fastify's own `inject()`, so Fastify's parsing, hooks and plugins take part.

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

`listen` resolves to the base URL with the port that was assigned. On Bun the options are `{ port: 0, hostname: '127.0.0.1' }`.

## Replacing dependencies

Pass providers to the application. They win over everything declared in modules.

```ts
import { Injectable, provide } from '@navios/core'

@Injectable()
class EmptyUsers extends UsersService {
  override findById() {
    return null
  }
}

const app = await NaviosFactory.create(AppModule, {
  adapter: defineInMemoryEnvironment(),
  logger: false,
  providers: [provide(UsersService, EmptyUsers)],
})

const response = await createTestClient(app)(getUser, { urlParams: { userId: '1' } })
expect(response.status).toBe(404)
```

A token that holds a value is replaced with `provide(Token, { value })`. To inspect a service after a request, resolve it from the application: `await app.get(UsersService)` returns the instance the controller used.

For state that a guard normally establishes, send what the guard reads (a header, a cookie) or replace the service the guard depends on. That exercises the guard instead of bypassing it.

## Testing a guard alone

A guard takes a `RequestContext`, which only the pipeline builds. The practical way to test one in isolation is a small module on the in-memory adapter with a single probe route:

```ts
// ApiKeyGuard comes from Guards and interceptors
const probe = API.declareEndpoint({
  method: 'GET',
  url: '/probe',
  responseSchema: z.object({ ok: z.boolean() }),
})

it('rejects a request without an API key', async () => {
  @Controller()
  class ProbeController {
    @Endpoint(probe)
    probe() {
      return { ok: true }
    }
  }

  @Module({ controllers: [ProbeController], guards: [ApiKeyGuard] })
  class ProbeModule {}

  const app = await NaviosFactory.create(ProbeModule, {
    adapter: defineInMemoryEnvironment(),
    logger: false,
  })
  const call = createTestClient(app)

  expect((await call(probe)).status).toBe(401)
  expect((await call(probe, { headers: { 'x-api-key': 'secret' } })).status).toBe(200)

  await app.close()
})
```

The same shape tests an interceptor, an error mapper or a [request value](/docs/server/guides/request-state): attach it to the probe module and assert on the response.
