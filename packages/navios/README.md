# @navios/http

A small HTTP client on top of `fetch`, with an API that follows axios. It is the client [`@navios/builder`](https://www.npmjs.com/package/@navios/builder) is used with in its documentation, and works on its own.

## Why?

- It is small and has no dependencies
- It uses `fetch` everywhere, so it behaves the same in browsers, Node.js, Bun and edge runtimes, and passes options such as `cache` and Next.js' `next` through
- Interceptors, `baseURL`, default headers and errors for error statuses work as you know them from axios

It is not a replacement for all of axios: there is no `transformRequest`, `auth`, proxy or upload progress.

## Installation

```bash
npm install @navios/http@next
```

The 2.0 alpha is published under the `next` tag. All `@navios` packages of a project must have the same alpha version, because an alpha may break between releases.

## Basic Usage

```ts
import navios from '@navios/http'

const response = await navios.get('https://example.com')
console.log(response.data)
```

The default export is a client without any configuration. `create` makes one with it:

```ts
import { create } from '@navios/http'

const client = create({
  baseURL: 'https://example.com/api',
  headers: { 'X-Custom-Header': 'foobar' },
})

const { data } = await client.get<User[]>('/users', { params: { page: 2 } })
```

## Interceptors

```ts
import { isHttpClientError } from '@navios/http'

client.interceptors.request.use((config) => {
  config.headers.authorization = `Bearer ${getToken()}`
})

client.interceptors.response.use(
  (response) => {
    console.log('Response status', response.status)
  },
  (error) => {
    if (isHttpClientError(error) && error.status === 401) {
      console.error('Unauthorized', error.config.url)
    }
    throw error
  },
)
```

- They run in the order they were added.
- Request interceptors run before `params` and `data` are serialized, so they can change both. They get a shallow copy of a plain object or array, so changing it in place does not change what the caller passed. `config.headers` lists names in lower case, and takes them in any.
- What an interceptor returns takes the place of the config or the response. Returning nothing keeps it.
- A rejected handler receives every failure before it: error statuses, network errors, and what another interceptor threw. What it returns becomes the result, so rethrow what you do not handle. A rejected handler of a request has to return a config.

## Errors

A response with an error status, a body that is not valid JSON, a network error, a timeout and an abort reject with an `HttpClientError`:

| Field      | Description                                                                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `response` | `{ data, status, statusText, headers }`, or `null` when none was received. `data` is parsed when the body is JSON, `application/problem+json` included |
| `status`   | The status of `response`                                                                                                                               |
| `code`     | Without a response: `ECONNABORTED` for a timeout, `ERR_CANCELED` for an abort, `ERR_BAD_OPTION_VALUE` for a request that could not be built            |
| `cause`    | The original error                                                                                                                                     |
| `config`   | The request, which can be sent again with `client.request(error.config)`                                                                               |

`isHttpClientError(error)` is the type guard. `error.toJSON()` contains neither headers nor bodies, so an error can be logged.

## Usage with @navios/builder

`@navios/builder` adds types and validation to a client:

```ts
import { builder } from '@navios/builder'
import { create } from '@navios/http'
import { z } from 'zod/v4'

const API = builder({
  client: create({ baseURL: 'https://api.example.com' }),
})

const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: z.object({
    id: z.string(),
    name: z.string(),
    email: z.email(),
  }),
})

const user = await getUser({ urlParams: { userId: '123' } })
user.name // string
```

For more information about using `@navios/http` with `@navios/builder`, see the [Builder documentation](https://navios.tech/docs/builder/).

## Testing

`@navios/http/testing` has a `fetch` that answers from mocks and records what it was asked.

```ts
import { create } from '@navios/http'
import { makeNaviosFakeAdapter } from '@navios/http/testing'

const fake = makeNaviosFakeAdapter()
const client = create({ baseURL: 'https://api.example.com', adapter: fake.fetch })

fake.mock('/users/1', 'GET', () => Response.json({ id: '1' }))
fake.mock('/users?page=2', 'GET', async () => Response.json([]))

await client.get('/users/1')

fake.requests[0].headers.get('authorization')
fake.reset()
```

- `mock(url, method, handler)`: `handler(url, init)` returns a `Response` or a promise of one. A `url` with a query answers only requests with exactly that query, in any order; one without answers the rest. With an origin it answers only that origin.
- `requests`: every request, with `url`, `path`, `query`, `method`, `headers` and `body`, also the ones no mock answered. Those reject.
- `reset()` forgets mocks and requests.

## API

### `create(config)`

Creates a client.

- `baseURL` - Put in front of every URL that has no scheme of its own, with exactly one slash between
- `headers` - Default headers: an object, `Headers` or entries
- `responseType` - Default response type: `json` (the default), `text`, `blob`, `arrayBuffer`, `formData`, `stream`
- `validateStatus` - Which statuses resolve. The default is 200 to 299
- `adapter` - A `fetch` to use instead of the global one, like the one from `undici`
- `FormData`, `URLSearchParams` - Implementations to use instead of the global ones

### `client.request(config)`

- `url` - URL for the request
- `method` - HTTP method
- `headers` - Headers, merged over the default ones without regard to case
- `params` - URL search parameters, as an object or `URLSearchParams`, merged into a query string the URL already has. Arrays repeat their key, dates are ISO strings, other objects JSON; `null` and `undefined` are left out
- `data` - Request body. A string is sent as it is, as `text/plain` unless a content type is set; `FormData`, `URLSearchParams`, `Blob`, buffers and streams are sent as they are; anything else is sent as JSON. `null` is no body unless the content type is JSON. Not sent for `GET` and `HEAD`
- `responseType` - With `json`, an empty body (a 204, for example) resolves with `data: undefined`; a body that is not JSON rejects with an error that carries the `response`
- `timeout` - Milliseconds after which the request is aborted. Combined with `signal` when both are given. It covers reading the body, except for a `stream`, where it ends with the headers. `Infinity` is no timeout
- `validateStatus`, `baseURL` - Override the ones of the client
- `signal` - `AbortSignal` to cancel the request
- `credentials` - `omit`, `same-origin`, `include`. `withCredentials: true` is short for `include`

Plus other `fetch` options.

### `client.get(url[, config])`, `client.delete`, `client.head`, `client.options`

### `client.post(url[, data[, config]])`, `client.put`, `client.patch`

### `client.defaults`

The configuration of the client. Changes apply to every later request.

```ts
client.defaults.headers['X-Tenant'] = 'acme'
delete client.defaults.headers['x-tenant'] // any case
```

### `client.interceptors.request`, `client.interceptors.response`

- `use(onFulfilled[, onRejected])` - Adds an interceptor and returns its id. Either can be `null`
- `eject(id)` - Removes it
- `clear()` - Removes all of them
