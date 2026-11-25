---
title: HTTP client
---

# HTTP client

Builder does not make requests itself. It prepares a request, hands it to an HTTP client you provide, and interprets what comes back. This page covers what counts as a client, how to give one to a builder, and where cross-cutting concerns such as authentication belong.

## What a client is

A client is any object with a `request(config)` method that resolves to `{ data, status, statusText, headers }`.

```ts
import type { Client } from '@navios/builder'
```

The contract is deliberately loose:

- `request` may resolve **or** reject for a non-2xx status. Builder checks `status` itself.
- A rejection that carries a `response` property with a non-2xx status, as axios and `@navios/http` produce, is treated like a non-2xx response.
- A rejection that carries a `response` with a 2xx status means the client could not parse the body. It becomes kind `response-validation`, with the response's `data` as the error body.
- A rejection without `response` is a transport failure and becomes kind `network`, `timeout` or `aborted`.

`config` contains `method`, `url` (with URL parameters bound), `params`, `data`, `headers`, `signal`, `timeout`, `responseType`, and whatever the endpoint put in `clientOptions`.

## Choosing a client

**`@navios/http`** is a small client built on `fetch` with an axios-like API. It is what these docs use.

```ts
import { builder } from '@navios/builder'
import { create } from '@navios/http'

export const API = builder({
  client: create({ baseURL: 'https://api.example.com' }),
})
```

**axios** instances satisfy the contract as they are.

```ts
import axios from 'axios'

export const API = builder({
  client: axios.create({ baseURL: 'https://api.example.com' }),
})
```

**A `fetch` wrapper** is enough when you want no dependency. Because Builder checks the status, the wrapper does not need to throw on errors.

```ts
import type { Client } from '@navios/builder'

const baseURL = 'https://api.example.com'

const client: Client = {
  request: async (config) => {
    const query = new URLSearchParams(config.params as Record<string, string>).toString()
    const response = await fetch(`${baseURL}${config.url}${query ? `?${query}` : ''}`, {
      method: config.method,
      headers: { 'content-type': 'application/json', ...config.headers },
      body: config.data === undefined ? undefined : JSON.stringify(config.data),
      signal: config.signal,
    })
    return {
      data: await response.json(),
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    }
  },
}
```

A wrapper like this handles JSON only. To support uploads and the non-JSON response kinds it also needs to pass `FormData` through untouched and read the body according to `config.responseType`.

## Giving a builder its client

Pass the client when you create the builder. Three methods cover the other cases:

```ts
const API = builder({ client })

API.provideClient(other) // set or replace the client for every endpoint on this builder
API.getClient() // the current client; throws a NaviosError when none is set
API.withClient(other) // a new builder with the same configuration and another client
```

`provideClient` exists for apps that only know their client at start-up, for example after reading configuration. Declarations can be made before a client exists; a call made without one fails with kind `config`.

`withClient` does not affect endpoints already declared on the original builder. Only endpoints declared on the returned builder use the new client.

## A client for one call

The second argument of a call selects the client for that call only. The shared client is untouched.

```ts
await getUser({ urlParams: { userId: '42' } }, { client: requestScopedClient })
```

This is the tool for server-side rendering, where each incoming request needs its own cookies or token and a shared mutable client would leak them between users. `@navios/react-query` builds on it: see [SSR and prefetching](/docs/builder/react-query/ssr).

## Authentication

Credentials are a property of the connection, so they belong on the client rather than on each declaration. With `@navios/http` or axios, a request interceptor adds them:

```ts
const client = create({ baseURL: 'https://api.example.com' })

client.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export const API = builder({ client })
```

Refreshing an expired token works the same way, in a response interceptor that retries the request after obtaining a new token. Builder sees only the final outcome, so the retry is invisible to your endpoint code and to `onError`.

For a header that only one endpoint needs, use the endpoint's [`headers` option](/docs/builder/essentials/endpoints#headers-and-timeout).

## Several backends

Create one builder per backend. Each has its own client, and declarations import the builder they belong to.

```ts
export const API = builder({ client: create({ baseURL: 'https://api.example.com' }) })
export const billingAPI = builder({ client: create({ baseURL: 'https://billing.example.com' }) })
```
