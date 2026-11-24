---
title: Testing
---

# Testing

Because a builder talks to the network only through its HTTP client, tests replace the client. No request interception or global mocking is needed, and the full pipeline — input validation, response validation, error classification — still runs.

## A fake client

A client is an object with one method, so a fake is a few lines. This one answers from a list of routes and records what it was asked.

```ts title="test/fake-client.ts"
import type { AbstractRequestConfig, Client } from '@navios/builder'

type Reply = { status?: number; data?: unknown; headers?: Record<string, string> }

export function fakeClient(routes: Record<string, Reply | ((config: AbstractRequestConfig) => Reply)>) {
  const requests: AbstractRequestConfig[] = []

  const client: Client = {
    request: async <T>(config: AbstractRequestConfig) => {
      requests.push(config)
      const route = routes[`${config.method} ${config.url}`]
      if (!route) throw new Error(`No fake route for ${config.method} ${config.url}`)

      const reply = typeof route === 'function' ? route(config) : route
      return {
        data: reply.data as T,
        status: reply.status ?? 200,
        statusText: '',
        headers: reply.headers ?? {},
      }
    },
  }

  return { client, requests }
}
```

`config.url` has its URL parameters already bound, so routes are keyed by the real path: `'GET /users/42'`.

## Injecting it

Pass the fake as the client for one call. Nothing global changes, so tests can run in parallel.

```ts
import { expect, it } from 'vitest'

import { getUser } from '../src/api/users'
import { fakeClient } from './fake-client'

it('returns the user', async () => {
  const { client } = fakeClient({
    'GET /users/42': { data: { id: '42', name: 'Ada', email: 'ada@example.com' } },
  })

  const user = await getUser({ urlParams: { userId: '42' } }, { client })

  expect(user.name).toBe('Ada')
})
```

When the code under test calls endpoints itself and you cannot pass the second argument, replace the builder's client for the duration of the test:

```ts
import { afterEach, beforeEach } from 'vitest'

import { API } from '../src/api/api'

const original = API.getClient()

beforeEach(() => {
  API.provideClient(fakeClient({ /* routes */ }).client)
})

afterEach(() => {
  API.provideClient(original)
})
```

This mutates shared state, so keep such tests in files that do not run concurrently with each other.

## Asserting on what was sent

The recorded configs show the request after validation and transforms, which is what the server would receive.

```ts
it('sends the validated body', async () => {
  const { client, requests } = fakeClient({
    'POST /users': (config) => ({ status: 201, data: { id: '1', ...(config.data as object) } }),
  })

  await createUser({ data: { name: 'Ada', email: 'ada@example.com' } }, { client })

  expect(requests[0]).toMatchObject({
    method: 'POST',
    url: '/users',
    data: { name: 'Ada', email: 'ada@example.com' },
  })
})
```

## Testing failures

Use `.safe()` in tests. It turns every failure into a value you can assert on, with no `try` / `catch` and no risk of a test passing because nothing threw.

An error status:

```ts
it('reports a missing user', async () => {
  const { client } = fakeClient({
    'GET /users/42': { status: 404, data: { message: 'No such user' } },
  })

  const res = await getUser.safe({ urlParams: { userId: '42' } }, { client })

  expect(res.ok).toBe(false)
  expect(res.error?.status).toBe(404)
})
```

The error's `kind` is `http` when the endpoint declares a 404 in its `errorSchema`, and `http-unknown` when it does not.

Invalid input never reaches the client:

```ts
it('does not send invalid input', async () => {
  const { client, requests } = fakeClient({})

  const res = await createUser.safe({ data: { name: 'Ada', email: 'not-an-email' } }, { client })

  expect(res.error?.kind).toBe('request-validation')
  expect(requests).toHaveLength(0)
})
```

A server that breaks the contract:

```ts
it('rejects a malformed response', async () => {
  const { client } = fakeClient({
    'GET /users/42': { data: { id: 42 } },
  })

  const res = await getUser.safe({ urlParams: { userId: '42' } }, { client })

  expect(res.error?.kind).toBe('response-validation')
})
```

A transport failure is a client that rejects without a `response`:

```ts
it('reports a network failure', async () => {
  const client = { request: async () => { throw new TypeError('fetch failed') } }

  const res = await getUser.safe({ urlParams: { userId: '42' } }, { client })

  expect(res.error?.kind).toBe('network')
})
```

## What to test

Declarations themselves rarely need tests: the types are checked by the compiler and the validation is the schema library's. Tests earn their keep on the code around the calls — what your app does with a 409, how a form maps `issues` to fields, whether a retry happens.

For testing the server side of a shared contract, see the server's [Testing](/docs/server/essentials/testing) guide.
