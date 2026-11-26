---
title: Developing against mocks
---

# Developing against mocks

When the UI is built while the backend is still being written, declare the endpoints against the contract you agreed on and answer them from mocks until the server is ready. The mock client from `@navios/builder/mock` answers per endpoint. Everything the app calls is the real declaration: when the backend ships, you delete the mock and nothing else changes.

## Set it up

Create one mock client for the app, and put it in front of the real HTTP client when the app starts:

```ts title="api/mocks.ts"
import { createMockClient } from '@navios/builder/mock'

export const mocks = createMockClient({ delay: [150, 600] })
```

```ts title="main.ts"
import axios from 'axios'

import { API } from './api/api'
import { mocks } from './api/mocks'

API.provideClient(mocks.wrap(axios.create({ baseURL: '/api/' })))
```

`wrap(client)` returns a client that answers the endpoints that have a mock and sends every other request to `client`. The mocks are declared before the real client exists, which is why the client is wrapped rather than passed to `createMockClient`. `createMockClient({ fallback })` does the same when the real client is at hand.

`delay` adds latency to every mocked response, a fixed number of milliseconds or a random one in a `[min, max]` range, so loading states show while you work.

## Mock an endpoint

```ts title="api/chats.ts"
import { z } from 'zod/v4'

import { API } from './api'
import { mocks } from './mocks'

const chatSchema = z.object({ id: z.string(), title: z.string(), createdAt: z.iso.datetime() })

export const listChats = API.declareEndpoint({
  method: 'GET',
  url: '/chats',
  querySchema: z.object({ archived: z.boolean().optional() }),
  responseSchema: z.array(chatSchema),
})

mocks.on(listChats, ({ params }) => [
  { id: '1', title: params?.archived ? 'Old chat' : 'Welcome', createdAt: '2026-11-01T09:00:00Z' },
])
```

The handler receives the call's arguments, typed from the declaration, and returns the body. Mocks are matched by endpoint, not by URL, so `/users/$userId` and `/users/me` never answer for each other.

What a mock returns goes through the endpoint's whole pipeline, as a server's reply would:

- It is typed as the **input** of `responseSchema`, what the server sends. A schema that turns an ISO string into a `Date` expects the string.
- It is **validated**. A mock that no longer matches the contract fails with kind `response-validation`, the way the real server would if it drifted.
- A JSON body is **copied through `JSON`**, so the app never gets a value no server could send, and never shares an object with the mock.

A mock may be `async`. Throwing from it fails the call with kind `network`, for trying out offline states.

## Other statuses and headers

The second argument has `respond(status, body?, init?)`. The body is typed from the endpoint's `errorSchema` or `responses` entry for that status:

```ts
mocks.on(getUser, ({ urlParams }, { respond }) =>
  urlParams.userId === 'missing'
    ? respond(404, { message: 'No such user' })
    : { id: String(urlParams.userId), name: 'Ada' },
)

mocks.on(downloadReport, (_, { respond }) =>
  respond(200, new Blob(['id,name\n1,Ada'], { type: 'text/csv' }), {
    headers: { 'content-disposition': 'attachment; filename="users.csv"' },
  }),
)
```

A plain return is sent with status 200, with the first 2xx status of `responses` when the endpoint declares them, and with 204 for `response: 'void'`. The second argument also holds `request`, the request config the builder built, and the call's `signal`; a delayed mock stops waiting when the call is aborted.

## With React Query

Queries and mutations of `@navios/react-query` carry their endpoint, so they are mocked as they are:

```ts
export const listChats = client.query({
  method: 'GET',
  url: '/chats',
  responseSchema: z.array(chatSchema),
})

mocks.on(listChats, () => [{ id: '1', title: 'Welcome', createdAt: '2026-11-01T09:00:00Z' }])
```

## When the backend ships

Delete the `mocks.on(...)` line. The endpoint's calls go to the real client from then on. `mocks.has(endpoint)` tells whether one is still mocked, for a "mocked" badge in a dev toolbar.

Mocked responses never reach the HTTP client, so its interceptors do not run for them: answer in the shape the app sees after them. A UI whose interceptors turn snake_case into camelCase mocks in camelCase.

Registering a mock next to its declaration is the quickest while a backend is pending, and it ships with the app. To keep mocks out of the production bundle, register them in modules that only the development build imports:

```ts title="main.ts"
if (import.meta.env.DEV) {
  await import('./api/mocks.dev')
}
```

## In tests

Without a fallback, a request no mock answers fails, so a test notices a call it did not expect. `calls()` lists what the mocks answered, `once` answers a single call, and `reset()` clears everything:

```ts
import { createMockClient } from '@navios/builder/mock'
import { afterEach, expect, it } from 'vitest'

const mocks = createMockClient()
afterEach(() => mocks.reset())

it('answers the first call with an outage, then the user', async () => {
  mocks.once(getUser, (_, { respond }) => respond(503))
  mocks.on(getUser, () => ({ id: '42', name: 'Ada' }))

  const first = await getUser.safe({ urlParams: { userId: '42' } }, { client: mocks })
  const second = await getUser({ urlParams: { userId: '42' } }, { client: mocks })

  expect(first.error?.status).toBe(503)
  expect(second.name).toBe('Ada')
  expect(mocks.calls(getUser)).toHaveLength(2)
})
```

[Testing](/docs/builder/guides/testing) shows the other ways to replace the client.
