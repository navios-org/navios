# Navios Builder

`@navios/builder` is a declarative, type-safe API client builder. Schemas come from `zod` or any other [Standard Schema](https://standardschema.dev) library. You describe each endpoint once — method, URL, schemas — and get back a typed function that validates what it sends and what it receives.

## Why?

- **Type safety**: arguments, response data and error bodies are all inferred from your schemas and the URL template.
- **Validation**: input is validated before a request is sent; responses are validated before your code sees them.
- **One error type**: every failed call produces an `EndpointError` with a `kind` you can switch on. Throw it (`endpoint()`) or receive it as a value (`endpoint.safe()`).
- **Typed error bodies**: map HTTP status codes to schemas with `errorSchema` and narrow with `error.kind` / `error.status`.
- **Any schema library**: every schema slot accepts a Standard Schema v1 implementation — Zod, Valibot, ArkType and others — and libraries can be mixed.
- **Any HTTP client**: `@navios/http`, `axios`, or a ten-line `fetch` wrapper.
- **More than JSON**: multipart uploads, and blob / text / stream / empty responses, from the same `declareEndpoint`.
- **Shared contracts**: the same declarations drive `@navios/core` controllers and `@navios/react-query` hooks.

## Installation

```bash
npm install --save @navios/builder zod
```

or

```bash
yarn add @navios/builder zod
```

`zod` is an optional peer dependency and the library used throughout this README; the builder itself does not import it. See [Schema libraries](#schema-libraries) for using another one.

## Usage

```ts
import { builder } from '@navios/builder'
import { create } from '@navios/http'
import { z } from 'zod/v4'

const API = builder({
  client: create({ baseURL: 'https://example.com/api' }),
})

const userSchema = z.object({
  id: z.number(),
  name: z.string(),
})

const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

const updateUser = API.declareEndpoint({
  method: 'PUT',
  url: '/users/$userId',
  querySchema: z.object({ notify: z.boolean().optional() }),
  requestSchema: z.object({ name: z.string() }),
  responseSchema: userSchema,
})

const user = await getUser({ urlParams: { userId: 1 } })

const updated = await updateUser({
  urlParams: { userId: 1 },
  data: { name: 'John Doe' },
})
```

## Calling an endpoint

Every endpoint can be called in two ways. Both run the same pipeline and produce the same error for the same failure.

```ts
// Throws an EndpointError on any failure
const user = await getUser({ urlParams: { userId: 1 } })

// Never throws: resolves to a SafeResult
const res = await getUser.safe({ urlParams: { userId: 1 } })
if (res.ok) {
  res.data // typed from responseSchema
  res.response // { status, statusText, headers }
} else {
  res.error // EndpointError
  res.response // ResponseMeta | null
}
```

Call arguments:

- `urlParams` — values for the `$name` placeholders in the URL (required when the URL has any)
- `params` — query parameters (when `querySchema` is declared)
- `data` — request body (when `requestSchema` is declared)
- `headers`, `timeout`, `signal` — per-call request options

The arguments object is optional when nothing in it is required, and `params` / `data` are optional when their schema has no required fields:

```ts
const listUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({ page: z.number().optional() }),
  responseSchema: z.array(userSchema),
})

await listUsers()
await listUsers({ params: { page: 2 } })
```

A second argument selects the HTTP client for a single call — useful for per-request clients in SSR:

```ts
await getUser({ urlParams: { userId: 1 } }, { client: requestScopedClient })
```

`getUser.config` is the options object the endpoint was declared with.

## Declaring endpoints

```ts
API.declareEndpoint({
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS',
  url: string, // '$name' marks a URL parameter

  responseSchema, // required for JSON responses, unless `responses` is given
  responses, // { [status]: schema | null } per-status success schemas
  requestSchema, // request body
  querySchema, // query parameters (an object schema)
  urlParamsSchema, // runtime validation of URL parameters (an object schema)
  errorSchema, // { [status]: schema } for typed error bodies

  body: 'json' | 'multipart', // default 'json'
  response: 'json' | 'blob' | 'text' | 'stream' | 'void', // default 'json'

  headers, // sent with every call; per-call headers are merged over them
  timeout, // milliseconds; a per-call timeout wins
  clientOptions, // client-specific keys, e.g. { withCredentials: true }
  validateResponse, // false skips the runtime parse of the response
})
```

### URL parameters

A parameter is `$` followed by a letter or underscore, then letters, digits or underscores. The same rule is applied by the type system and at runtime, so `/users/$user_id` and `/files/$id.json` both work as you would expect. Values are URL-encoded.

`urlParamsSchema` adds runtime validation and lets you narrow the parameter types. Its keys must be exactly the parameter names in the URL — a mismatch throws a `NaviosError` when the endpoint is declared. (The declaration-time check needs the schema's keys, so it runs for schemas that expose `.shape`, i.e. Zod objects.)

```ts
const getPost = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId/posts/$postId',
  urlParamsSchema: z.object({
    userId: z.uuid(),
    postId: z.coerce.number().int().positive(),
  }),
  responseSchema: postSchema,
})
```

### File upload

`body: 'multipart'` converts `data` to `FormData`. `File` values (and arrays of them) are appended as files, dates as ISO strings, other objects as JSON.

```ts
const uploadAvatar = API.declareEndpoint({
  method: 'POST',
  url: '/users/$userId/avatar',
  body: 'multipart',
  requestSchema: z.object({
    file: z.instanceof(File),
    caption: z.string().optional(),
  }),
  responseSchema: z.object({ url: z.string() }),
})

await uploadAvatar({ urlParams: { userId: 1 }, data: { file } })
```

### Non-JSON responses

```ts
// Blob — file downloads
const downloadFile = API.declareEndpoint({
  method: 'GET',
  url: '/files/$fileId',
  response: 'blob',
})

// string
const getReadme = API.declareEndpoint({ method: 'GET', url: '/readme', response: 'text' })

// ReadableStream<Uint8Array>
const tailLogs = API.declareEndpoint({ method: 'GET', url: '/logs', response: 'stream' })

// undefined — 204 and other empty replies
const deleteFile = API.declareEndpoint({
  method: 'DELETE',
  url: '/files/$fileId',
  response: 'void',
})
```

`responseSchema` is required for `'json'` — unless the endpoint declares `responses` — and unused for the other kinds.

### Per-status responses

When the success body depends on the status, declare `responses` in place of `responseSchema`. A schema validates and types the body for its status; `null` marks a status without a body.

```ts
const saveUser = API.declareEndpoint({
  method: 'PUT',
  url: '/users/$userId',
  requestSchema: z.object({ name: z.string() }),
  responses: {
    200: userSchema, // existing user updated
    201: z.object({ id: z.number(), created: z.literal(true) }), // user created
    204: null, // nothing to return
  },
})

// { id: number; name: string } | { id: number; created: true } | undefined
const data = await saveUser({ urlParams: { userId: 1 }, data: { name: 'Ada' } })

// safe() exposes the status that came back
const res = await saveUser.safe({ urlParams: { userId: 1 }, data: { name: 'Ada' } })
if (res.ok && res.response.status === 201) {
  // created
}
```

The result type is the union of every entry (`null` contributes `undefined`). A 2xx status that is not listed, or a body that does not match the schema of its status, fails the call with kind `response-validation`.

### Headers, timeout and client options

```ts
const exportReport = API.declareEndpoint({
  method: 'POST',
  url: '/reports/export',
  requestSchema: exportSchema,
  responseSchema: reportSchema,
  headers: { 'X-Feature': 'reports' },
  timeout: 30_000,
  clientOptions: { withCredentials: true },
})

// Per-call values win over the endpoint's
await exportReport({ data, timeout: 60_000, headers: { 'X-Trace': traceId } })
```

`clientOptions` is merged into the request config for keys your HTTP client understands. It cannot override the keys the builder owns (`method`, `url`, `params`, `data`, `headers`, `signal`, `timeout`, `responseType`).

### `validateResponse: false`

For high-volume reads against a trusted server, skip the runtime parse. The result is then typed as the schema's input, since transforms and defaults are not applied:

```ts
const listFeedItems = API.declareEndpoint({
  method: 'GET',
  url: '/feed',
  responseSchema: feedItemsSchema,
  validateResponse: false,
})
```

## Errors

A failed call produces one `EndpointError` (`extends NaviosError extends Error`). It is thrown by `endpoint()`, returned as `result.error` by `endpoint.safe()`, and passed to the builder's `onError` hook.

| `kind`                | Meaning                                                                                                                                               | `status` / `body`            |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `http`                | Non-2xx status with an `errorSchema` entry; the body parsed                                                                                           | status, parsed schema output |
| `http-unknown`        | Non-2xx status with no `errorSchema` entry                                                                                                            | status, raw body             |
| `request-validation`  | `urlParams`, `params` or `data` failed its schema — nothing was sent                                                                                  | —                            |
| `response-validation` | A 2xx body failed `responseSchema` / its `responses` entry, a 2xx status is missing from `responses`, or an error body failed its `errorSchema` entry | status, raw body             |
| `network`             | No response was received                                                                                                                              | —                            |
| `timeout`             | The request timed out                                                                                                                                 | —                            |
| `aborted`             | The request was cancelled through its `AbortSignal`                                                                                                   | —                            |
| `config`              | The call could not be made: no client, or a missing URL parameter                                                                                     | —                            |

Other fields: `endpoint` (`{ method, url }`), `response` (`ResponseMeta | null`), `issues` (`readonly SchemaIssue[]` — `{ message, path? }` — for the validation kinds), `cause` (the original thrown value; the `ZodError` when a Zod schema rejected the value), and `toJSON()` for logging and serialization.

### Typed error bodies

```ts
import { isEndpointError, isHttpError } from '@navios/builder'

import type { EndpointErrorType } from '@navios/builder'

const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
  errorSchema: {
    404: z.object({ message: z.string() }),
    409: z.object({ conflictWith: z.string() }),
  },
})

const res = await getUser.safe({ urlParams: { userId: 1 } })
if (!res.ok) {
  const { error } = res
  if (error.kind === 'http' && error.status === 404) {
    error.body.message // typed from errorSchema[404]
  } else if (error.kind === 'http-unknown') {
    error.status // number
    error.body // unknown
  }
}

// In a catch block the value is unknown — use the guards
try {
  await getUser({ urlParams: { userId: 1 } })
} catch (error) {
  if (isHttpError<typeof getUser.config.errorSchema, 404>(error, 404)) {
    error.body.message
  } else if (isEndpointError(error) && error.kind === 'aborted') {
    // cancelled — nothing to report
  } else {
    throw error
  }
}

// The full typed union for one endpoint
type GetUserError = EndpointErrorType<typeof getUser>
```

`error.body` is exactly what the matching schema produced; the builder never adds fields to it.

### `onError`

`onError` is a telemetry hook. It is called once per failed call with the same `EndpointError` instance the caller receives. An exception thrown inside it is caught and logged.

```ts
const API = builder({
  client,
  onError: (error) => {
    logger.warn(error.toJSON())
  },
})
```

### Response metadata

`res.response` and `error.response` are `ResponseMeta` objects (`status`, `statusText`, and a `Headers` instance). Three helpers read common headers and accept `null`:

```ts
import { getCookie, getHeader, getRetryAfterMs } from '@navios/builder'

const res = await getUser.safe({ urlParams: { userId: 1 } })

const etag = getHeader(res.response, 'etag') // string | null
const session = getCookie(res.response, 'sid') // string | null, from Set-Cookie
const retryMs = getRetryAfterMs(res.response) // number | null
```

## Schema libraries

Every schema slot — `requestSchema`, `querySchema`, `urlParamsSchema`, `responseSchema`, `errorSchema`, `responses` — accepts any [Standard Schema](https://standardschema.dev) v1 implementation: Zod, Valibot, ArkType and others. The builder exports the interface as `Schema<Input, Output>`.

- Call arguments are typed from a schema's input type; results and error bodies from its output type. `InferSchemaInput<S>` and `InferSchemaOutput<S>` extract them for any library.
- Schemas that validate asynchronously are supported.
- Libraries can be mixed: each slot is validated on its own.
- A rejected value produces the same `EndpointError` (`request-validation` / `response-validation`) with `issues: readonly SchemaIssue[]`. For a Zod schema `error.cause` is the original `ZodError`; for other libraries it is `undefined`.

A library's schemas are passed as they are. Written by hand, a Standard Schema looks like this:

```ts
import type { Schema } from '@navios/builder'

const slugSchema: Schema<{ slug: string }> = {
  '~standard': {
    version: 1,
    vendor: 'my-app',
    validate: (value) => {
      const slug = (value as { slug?: unknown } | null)?.slug
      return typeof slug === 'string' && /^[a-z0-9-]+$/.test(slug)
        ? { value: { slug } }
        : { issues: [{ message: 'Expected a lower-case slug', path: ['slug'] }] }
    },
  },
}

const renameProject = API.declareEndpoint({
  method: 'PUT',
  url: '/projects/$projectId/slug',
  requestSchema: slugSchema, // hand-written
  responseSchema: z.object({ id: z.string(), slug: z.string() }), // Zod
})

const res = await renameProject.safe({
  urlParams: { projectId: 1 },
  data: { slug: 'Not A Slug' },
})
if (!res.ok && res.error.kind === 'request-validation') {
  res.error.issues // [{ message: 'Expected a lower-case slug', path: ['slug'] }]
}
```

Where Zod is still required:

- `@navios/core` controllers and OpenAPI generation read Zod schemas directly. Endpoints shared with the server must use Zod in every slot; `@navios/core` exports `ZodBaseEndpointOptions` and `ZodEndpointOptions`, the option types narrowed to Zod.
- The declaration-time `urlParamsSchema` check (see [URL parameters](#url-parameters)).

## HTTP client

```ts
const API = builder({ client })

API.provideClient(client) // set or replace the client at start-up
API.getClient() // the current client; throws NaviosError when none is set
API.withClient(other) // a new builder with the same config and another client
```

A client is any object with a `request(config)` method that returns `{ data, status, statusText, headers }`:

- `request` may resolve **or** reject for a non-2xx response; the builder checks `status` itself.
- A rejection that carries a `response` property (the axios / `@navios/http` convention) is handled like a non-2xx response.
- A rejection without `response` is classified as `network`, `timeout` or `aborted`.

So a thin `fetch` wrapper is a valid client:

```ts
import type { Client } from '@navios/builder'

const client: Client = {
  request: async (config) => {
    const query = new URLSearchParams(config.params as Record<string, string>).toString()
    const response = await fetch(
      `https://example.com/api${config.url}${query ? `?${query}` : ''}`,
      {
        method: config.method,
        headers: { 'content-type': 'application/json', ...config.headers },
        body: config.data === undefined ? undefined : JSON.stringify(config.data),
        signal: config.signal,
      },
    )
    return {
      data: await response.json(),
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    }
  },
}
```

## Type helpers

```ts
import type {
  EndpointConfig,
  EndpointErrorType,
  EndpointParams,
  EndpointResult,
} from '@navios/builder'

type Args = EndpointParams<typeof getUser> // call arguments
type User = EndpointResult<typeof getUser> // resolved data
type Failure = EndpointErrorType<typeof getUser> // typed EndpointError union
type Config = EndpointConfig<typeof getUser> // declared options
```

## WebSocket Support

`@navios/builder` includes WebSocket and Socket.IO support through the `@navios/builder/socket` export. This provides type-safe, bidirectional messaging validated by any Standard Schema (the examples use Zod).

### Quick Start

```ts
import { declareWebSocket, socketBuilder } from '@navios/builder/socket'
import { io } from 'socket.io-client'
import { z } from 'zod'

// Create builder
const socket = socketBuilder()

// Provide Socket.IO client
socket.provideClient(io('ws://localhost:3000'))

// Define typed send/subscribe handlers
const sendMessage = socket.defineSend({
  topic: 'chat.message',
  payloadSchema: z.object({ text: z.string() }),
})

const onMessage = socket.defineSubscribe({
  topic: 'chat.message',
  payloadSchema: z.object({ text: z.string(), from: z.string() }),
})

// Use handlers
sendMessage({ text: 'Hello!' })

const unsubscribe = onMessage((msg) => {
  console.log(`${msg.from}: ${msg.text}`)
})
```

### Errors

Every failure is a `SocketError` (`extends NaviosError`). Send handlers throw it or reject with it, and the builder's `onError` hook receives the same instance.

```ts
import { isSocketError, socketBuilder } from '@navios/builder/socket'

const socket = socketBuilder({
  onError: (error) => {
    // error.kind: 'validation' | 'ack-timeout' | 'transport'
    report(error.kind, error.topic, error.issues ?? error.cause)
  },
})

try {
  await createRoom({ name: 'My Room' })
} catch (error) {
  if (isSocketError(error) && error.kind === 'ack-timeout') {
    // no acknowledgement arrived in time
  }
}
```

| Field     | Description                                                                    |
| --------- | ------------------------------------------------------------------------------ |
| `kind`    | `'validation'`, `'ack-timeout'` or `'transport'`                               |
| `topic`   | Topic the handler was defined with                                             |
| `url`     | Connection URL, when the client exposes one (`declareWebSocket` handles do)    |
| `issues`  | `readonly SchemaIssue[]`, for `validation`                                     |
| `rawData` | The value that failed validation                                               |
| `cause`   | The schema library's error (a `ZodError` for Zod) or the value a handler threw |

An exception thrown inside `onError` is caught and logged; it never interrupts message handling.

### Using with Native WebSocket

You can also use native WebSocket connections:

```ts
import { declareWebSocket } from '@navios/builder/socket'
import { z } from 'zod'

const chatSocket = declareWebSocket({
  url: 'wss://api.example.com/ws/chat/$roomId',
  querySchema: z.object({ token: z.string() }),
  urlParamsSchema: z.object({ roomId: z.string().uuid() }),
})

const handle = chatSocket({
  urlParams: { roomId: 'abc-123' },
  params: { token: 'my-auth-token' },
})

socket.provideClient(handle)
```

For detailed documentation, see the [WebSocket Guide](/docs/builder/builder/advanced/websocket).

## Server-Sent Events (SSE) Support

`@navios/builder` includes Server-Sent Events support through the `@navios/builder/eventsource` export. This provides type-safe, unidirectional event streaming validated by any Standard Schema (the examples use Zod).

### Quick Start

```ts
import { declareEventSource, eventSourceBuilder } from '@navios/builder/eventsource'
import { z } from 'zod'

// Create builder
const sse = eventSourceBuilder()

// Define typed event handlers
const onMessage = sse.defineEvent({
  eventName: 'message',
  payloadSchema: z.object({
    text: z.string(),
    from: z.string(),
    timestamp: z.number(),
  }),
})

// Declare connection
const chatEvents = declareEventSource({
  url: '/events/$roomId',
  urlParamsSchema: z.object({ roomId: z.string() }),
})

// Connect and provide client
const handle = chatEvents({ urlParams: { roomId: '123' } })
sse.provideClient(handle)

// Subscribe to events
const unsubscribe = onMessage((msg) => {
  console.log(`${msg.from}: ${msg.text}`)
})
```

### Errors

An event that fails `payloadSchema` is skipped, and a handler that throws does not stop the other handlers. Both are reported to the builder's `onError` hook as an `EventSourceError` (`extends NaviosError`).

```ts
import { eventSourceBuilder } from '@navios/builder/eventsource'

const sse = eventSourceBuilder({
  onError: (error) => {
    // error.kind: 'validation' | 'transport'
    report(error.kind, error.eventName, error.issues ?? error.cause)
  },
})
```

| Field       | Description                                                                    |
| ----------- | ------------------------------------------------------------------------------ |
| `kind`      | `'validation'` or `'transport'`                                                |
| `eventName` | Event the handler was defined for                                              |
| `url`       | Connection URL, when the client exposes one (`declareEventSource` handles do)  |
| `issues`    | `readonly SchemaIssue[]`, for `validation`                                     |
| `rawData`   | The event data that failed validation                                          |
| `cause`     | The schema library's error (a `ZodError` for Zod) or the value a handler threw |

`isEventSourceError(value)` is the matching type guard. An exception thrown inside `onError` is caught and logged.

For detailed documentation, see the [EventSource Guide](/docs/builder/builder/advanced/eventsource).
