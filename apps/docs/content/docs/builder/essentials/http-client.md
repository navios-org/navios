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
- A rejection without `response` is a transport failure and becomes kind `network`, `timeout` or `aborted`. That includes an error thrown by one of the client's own interceptors, which arrives as `network` with the error as `cause`.

`config` contains `method`, `url` (with URL parameters bound), `params`, `data`, `headers`, `signal`, `timeout`, `responseType`, and whatever the endpoint put in `clientOptions`.

`request` also receives a second argument, `{ endpoint, args }`: the declaration of the calling endpoint (the same object as `handler.config`) and the arguments as the caller passed them. A client that only sends requests ignores it. It lets a client answer per endpoint, as [the mock client](/docs/builder/guides/mocking) does.

## Choosing a client

**`@navios/http`** is a small client built on `fetch` with an axios-like API. It is what these docs use.

```ts
import { builder } from '@navios/builder'
import { create } from '@navios/http'

export const API = builder({
  client: create({ baseURL: 'https://api.example.com' }),
})
```

[The Navios HTTP client](#the-navios-http-client) below describes it.

**axios** instances satisfy the contract as they are, without a cast.

```ts
import axios from 'axios'

export const API = builder({
  client: axios.create({ baseURL: 'https://api.example.com' }),
})
```

**A `fetch` wrapper** is enough when you want no dependency. Because Builder checks the status, the wrapper does not need to throw on errors. This one supports everything a declaration can ask for:

```ts title="client.ts"
import type { AbstractRequestConfig, Client } from '@navios/builder'

const baseURL = 'https://api.example.com'

export const client: Client = {
  async request<T>(config: AbstractRequestConfig) {
    const url = new URL(baseURL + config.url)
    for (const [name, value] of Object.entries(config.params ?? {})) {
      for (const item of [value].flat()) {
        if (item !== undefined && item !== null) url.searchParams.append(name, toText(item))
      }
    }

    // Builder has already encoded strings and built FormData: the rest is JSON
    const { data } = config
    const isJson = data !== undefined && typeof data !== 'string' && !(data instanceof FormData)
    const headers = new Headers(config.headers)
    if (isJson && !headers.has('content-type')) headers.set('content-type', 'application/json')

    const signals = [config.signal, config.timeout && AbortSignal.timeout(config.timeout)]
    const response = await fetch(url, {
      method: config.method,
      headers,
      body: isJson ? JSON.stringify(data) : (data as string | FormData | undefined),
      signal: AbortSignal.any(signals.filter((signal) => signal instanceof AbortSignal)),
    })
    return {
      data: (await readBody(response, config.responseType)) as T,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    }
  },
}

function toText(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

async function readBody(response: Response, responseType?: string): Promise<unknown> {
  if (response.ok && responseType === 'blob') return response.blob()
  if (response.ok && responseType === 'stream') return response.body
  const text = await response.text()
  if (response.ok && responseType === 'text') return text
  try {
    return JSON.parse(text)
  } catch {
    return text || undefined // empty, or not JSON after all
  }
}
```

## What a client receives

The wrapper above shows what a client of your own has to take care of:

- **`params`** is a plain object. Leave out `undefined` and `null`, and repeat the key for each item of an array. A Navios server expects dates as ISO strings and objects as JSON.
- **`data`** is `undefined`, a `FormData` (for `body: 'multipart'`) or the body itself. A string is always sent as it is: for a JSON endpoint Builder has encoded it. Everything else is JSON, also `0`, `false` and `null`.
- **`headers`** hold a `content-type` only when the body is a primitive or the declaration has one. Set `application/json` for the rest, and nothing for `FormData`.
- **`responseType`** is `'blob'`, `'stream'` or `'text'`, and absent for JSON. It is `'text'` for `response: 'void'` as well. An empty JSON body, such as a 204, must not fail the call.
- **Error bodies** are JSON whatever `responseType` says. A Navios server sends them as `application/problem+json`.

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

## The Navios HTTP client

`create(config)` from `@navios/http` returns a client with `request`, `get`, `post`, `put`, `patch`, `delete`, `head` and `options`, `interceptors`, `defaults` and `create`. It has no dependencies, runs wherever `fetch` does, and passes `fetch` options such as `cache` and Next.js' `next` through. The API follows axios; it is not a replacement for all of it. There are no `transformRequest`, `auth`, upload progress or proxy options.

| `create` option   | Description                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| `baseURL`         | Put in front of every URL that has no scheme of its own, with exactly one slash between             |
| `headers`         | Sent with every request. Names are matched without regard to case, and a request's headers win      |
| `adapter`         | A `fetch` to use instead of the global one, for example undici's                                    |
| `responseType`    | `'json'` (default), `'text'`, `'blob'`, `'arrayBuffer'`, `'formData'` or `'stream'`                 |
| `validateStatus`  | Which statuses resolve. Default: 200 to 299                                                         |
| `timeout`         | Milliseconds after which a request is aborted. Default: no timeout                                  |
| `credentials`     | `'omit'`, `'same-origin'` or `'include'`. `withCredentials: true` is short for `'include'`          |
| `URLSearchParams` | A class to write `params` with instead of the global one                                            |

Other `fetch` options, such as `cache`, `mode` and `redirect`, can be set on the client too. Every option is a default: a request's own value wins, and `client.defaults` holds them, so `client.defaults.timeout = 5000` applies to every later request.

`client.create(config)` returns a new client that starts from the `defaults` of `client` as they are at that moment, with `config` merged over them and headers merged by name. Interceptors are not copied. `create` imported from the package starts without defaults.

```ts
const client = create({ baseURL: 'https://api.example.com', headers: { 'X-App': 'web' } })
const uploads = client.create({ timeout: 60_000 }) // same baseURL and headers
```

The methods of the package's default client are also named exports: `get`, `post`, `put`, `patch`, `del` (for `delete`), `head` and `options`. They use no `baseURL`, so they take full URLs.

A request also takes `params`, `data`, `signal`, `timeout`, `credentials` and `withCredentials: true`, which is short for `credentials: 'include'`. A string in `data` is sent as it is, as `text/plain` unless a content type is set; `FormData`, `URLSearchParams`, `Blob`, buffers and streams are sent as they are; everything else is JSON. `null` is no body unless the content type is JSON. `timeout` covers reading the body, except for a stream, where it ends with the headers; `Infinity` is no timeout.

Interceptors run in the order they were added. That differs from axios for request interceptors, which axios runs in reverse, the one added last first. Request interceptors run before `params` and `data` are serialised, so they can change both, also in place: they get a shallow copy of a plain object or array. `config.headers` and `client.defaults.headers` list names in lower case, and take them in any. Response interceptors run after the body was read. What an interceptor returns takes the place of the config or the response, and returning nothing keeps it. A rejected handler receives every failure before it, including network errors and what a request interceptor threw. One of a request has to return a config or throw.

Every failure of the client itself is an `HttpClientError` with `response` (or `null`), `status`, `code`, `cause` and `config`. `isHttpClientError(error)` is the type guard. `config` can be sent again, which is how a token is refreshed:

```ts
import { create, isHttpClientError } from '@navios/http'

const baseURL = 'https://api.example.com'
const client = create({ baseURL })
const retry = create({ baseURL }) // without the interceptor, so a second 401 is final

client.interceptors.response.use(null, async (error) => {
  if (!isHttpClientError(error) || error.status !== 401) throw error
  const authorization = `Bearer ${await refreshToken()}`
  return retry.request({
    ...error.config,
    headers: { ...error.config.headers, authorization },
  })
})
```

`error.toJSON()` leaves out headers and bodies, so an error can be logged without leaking credentials.
