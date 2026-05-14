# Navios Builder

`Navios Builder` is a helper library on top of `zod` to provide a more declarative way to create an API client with type safety and validation. It allows you to define your API endpoints, request and response schemas, and automatically generates the necessary code to make API requests.

## Why?

- **Type Safety**: By using Zod schemas, you can ensure that the data you receive from your API matches the expected structure. This helps catch errors early in the development process.
- **Validation**: Zod provides powerful validation capabilities, allowing you to define complex validation rules for your data. This ensures that the data you work with is always valid and meets your requirements.
- **Integration with @navios/http**: @navios/http is a powerful HTTP client that simplifies API requests. By combining it with Zod, you can create a robust and type-safe API client.
- **Declarative API**: The API is designed to be declarative, allowing you to define your API endpoints and their schemas in a clear and concise manner. This makes it easy to understand and maintain your API client.
- **Discriminated Union Support**: The package supports discriminated unions, allowing you to handle different response types based on a common property. This is useful for APIs that return different data structures based on the request.
- **Error Schema Support**: Define different Zod schemas for different HTTP error status codes with type-safe discrimination using `isErrorStatus()` and `isErrorResponse()` helpers.
- **URL Parameter Validation**: Validate URL parameters at runtime using Zod schemas with `urlParamsSchema` option.
- **Customizable**: The package allows you to customize the behavior of the API client, such as using a custom client.
- **Error Handling**: The package provides built-in error handling capabilities, allowing you to handle API errors gracefully and provide meaningful feedback to users.

## Installation

```bash
npm install --save @navios/builder zod
```

or

```bash
yarn add @navios/builder zod
```

## Usage

```ts
import { builder } from '@navios/builder'
import { create } from '@navios/http'

// or
import { create } from 'axios'
import { z } from 'zod/v4'

const API = builder({
  useDiscriminatorResponse: true,
})

const client = create({
  baseURL: 'https://example.com/api/',
})

// We can provide the client to the API
API.provideClient(client)

const GetUserResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
})

const getUser = API.declareEndpoint({
  method: 'get',
  url: 'user',
  responseSchema: GetUserResponseSchema,
})
```

Or a more complex example with the request schema:

```ts
import { builder } from '@navios/builder'

import { z } from 'zod/v4'

import { GetUsersResponseSchema } from './schemas/GetUsersResponseSchema.js'

const API = builder({
  useDiscriminatorResponse: true,
})

const UpdateUserRequestSchema = z.object({
  id: z.number(),
  name: z.string(),
})

const UpdateUserResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('success'),
    data: GetUsersResponseSchema,
  }),
  z.object({
    status: z.literal('error'),
    error: z.string(),
  }),
])

const updateUser = API.declareEndpoint({
  method: 'PUT',
  url: 'user/$userId',
  requestSchema: UpdateUserRequestSchema,
  responseSchema: UpdateUserResponseSchema,
})

// In another file you can set the API client

// Use @navios/http client or axios
const client = create({
  baseURL: 'https://example.com/api/',
  headers: {
    Authorization: 'Bearer token',
  },
})

API.provideClient(client)

// Usage

const result = await updateUser({
  urlParams: {
    userId: 1,
  },
  data: {
    id: 1,
    name: 'John Doe',
  },
})

if (result.status === 'success') {
  console.log(result.data)
} else {
  console.error(result.error)
}
```

## API

### `builder`

`builder` is a function that creates an API object. It accepts an object with the following properties:

- `useDiscriminatorResponse` - if `true`, the error response will be checked by the original responseSchema. Default is `false`.

The function returns an API object with the following methods:

#### `declareEndpoint` - creates an endpoint with the specified options.

```ts
declareEndpoint({
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS',
  url: string,
  responseSchema: z.ZodSchema<unknown>, // Required
  // optional
  requestSchema: z.ZodSchema<unknown>, // Only for POST, PUT, PATCH methods
  querySchema: z.ZodSchema<unknown>, // For query parameters
  errorSchema: Record<number, z.ZodSchema<unknown>>, // Map status codes to schemas
  urlParamsSchema: z.ZodObject<unknown>, // Validate URL params at runtime
  clientOptions: ClientOptions, // Per-endpoint configuration
})
```

Returns a function that makes the HTTP request. The function accepts:

- `urlParams`: Object with URL parameter values (when URL contains `$paramName`)
- `data`: Request body data (when `requestSchema` is provided)
- `params`: Query parameters (when `querySchema` is provided)
- `headers`: Additional headers
- `signal`: AbortSignal for request cancellation

The function returns a Promise that resolves to the parsed response data (validated by `responseSchema`).

#### `declareStream` - creates a stream endpoint for downloading files.

```ts
declareStream({
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS',
  url: string,
  // optional
  requestSchema: z.ZodSchema<unknown>, // Only for POST, PUT, PATCH methods
  querySchema: z.ZodSchema<unknown>, // For query parameters
})
```

Returns a function that makes the HTTP request and returns a `Blob`.

#### `declareMultipart` - creates a multipart/form-data endpoint for file uploads.

```ts
declareMultipart({
  method: 'POST' | 'PUT' | 'PATCH',
  url: string,
  responseSchema: z.ZodSchema<unknown>, // Required
  // optional
  requestSchema: z.ZodSchema<unknown>, // Should include File instances
  querySchema: z.ZodSchema<unknown>, // For query parameters
})
```

Returns a function that automatically converts the request data to `FormData` and makes the HTTP request.

#### `provideClient` - sets the HTTP client for the API.

```ts
provideClient(client) // client is an instance of axios or @navios/http client
```

The client must implement the `Client` interface with a `request` method that accepts `AbstractRequestConfig` and returns `Promise<AbstractResponse<T>>`.

#### `getClient` - gets the current HTTP client.

```ts
getClient() // Returns the current client or throws NaviosError if not set
```

## Advanced Features

### Error Schema

Define different response schemas for different HTTP error status codes:

```ts
import { builder, isErrorResponse, isErrorStatus } from '@navios/builder'

const API = builder({ useDiscriminatorResponse: true })

const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: z.object({
    id: z.string(),
    name: z.string(),
  }),
  errorSchema: {
    400: z.object({ error: z.string(), field: z.string() }),
    404: z.object({ error: z.literal('Not Found') }),
    500: z.object({ error: z.string() }),
  },
})

const result = await getUser({ urlParams: { userId: '123' } })

// Use type guards to narrow the type
if (isErrorStatus(result, 404)) {
  console.log('Not found:', result.error) // TypeScript knows this is the 404 schema
} else if (isErrorResponse(result)) {
  console.log('Error:', result.__status, result.error)
} else {
  console.log('User:', result.name) // TypeScript knows this is the success response
}
```

When `useDiscriminatorResponse` is `true` and `errorSchema` is defined:

- Error responses matching a status code in `errorSchema` are parsed and returned (not thrown)
- Error responses include a `__status` property with the HTTP status code
- Unmatched status codes throw `UnknownResponseError`

### URL Parameter Validation

Validate URL parameters at runtime using Zod schemas:

```ts
const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId/posts/$postId',
  responseSchema: postSchema,
  urlParamsSchema: z.object({
    userId: z.string().uuid(), // Must be a valid UUID
    postId: z.coerce.number().int().positive(), // Coerced to positive integer
  }),
})

// This will throw a validation error if userId is not a valid UUID
await getUser({
  urlParams: {
    userId: '550e8400-e29b-41d4-a716-446655440000',
    postId: '42',
  },
})
```

### Per-Endpoint Client Options

Configure timeout, headers, and transformation options per endpoint:

```ts
const createUser = API.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema: userCreateSchema,
  responseSchema: userSchema,
  clientOptions: {
    timeout: 30000, // 30 second timeout
    headers: {
      'X-Custom-Header': 'value',
    },
    transformRequest: {
      skipFields: ['rawData'], // Skip transformation for these fields
      skipPaths: ['metadata.custom'], // Skip transformation for nested paths
    },
    transformResponse: {
      skipFields: ['rawResponse'],
    },
  },
})
```

## Envelope mode (`result: 'envelope'`)

### Why

Opting an endpoint into envelope mode swaps the "parsed body or thrown error" return shape for a single value that carries the parsed body, a typed error, and the response metadata (status code, status text, headers). Reading a pagination cursor, an `ETag`, a `Retry-After`, or a typed `errorSchema` body becomes a destructuring expression rather than a `try`/`catch` plus a side-trip to the raw HTTP client. Envelope endpoints never throw — every failure is surfaced as a value on `error`.

### Quick example

```typescript
import { builder, isHttpError } from '@navios/builder'

import { z } from 'zod/v4'

const API = builder()

const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: z.object({ id: z.string(), name: z.string() }),
  errorSchema: {
    404: z.object({ error: z.literal('Not Found') }),
    401: z.object({ error: z.string() }),
  },
  result: 'envelope',
})

const { data, error, response } = await getUser({ urlParams: { userId: '1' } })

if (error) {
  if (isHttpError(error, 404)) {
    // error.body is typed as the 404 schema output
    console.warn('missing user', error.body.error)
  }
  return
}

// data is typed as { id: string; name: string }
// response is ResponseMeta (status / statusText / headers)
console.log(`got ${data.name} as status ${response.status}`)
console.log('etag:', response.headers.get('etag'))
```

### The four error variants

Envelope `error` is a discriminated union keyed on `kind`:

```typescript
import {
  isEnvelopeError,
  isHttpError,
  isNetworkError,
  isUnknownHttpError,
  isValidationError,
} from '@navios/builder'

if (isHttpError(error, 404)) {
  // kind: 'http' — status matched errorSchema, body is the parsed schema output
} else if (isUnknownHttpError(error)) {
  // kind: 'http-unknown' — HTTP non-2xx with no matching errorSchema entry; body is unknown
} else if (isValidationError(error)) {
  // kind: 'validation' — response status was handled but Zod failed; carries issues + raw body
} else if (isNetworkError(error)) {
  // kind: 'network' — request never produced a response (DNS, abort, timeout, ...)
}

// or just check it is any envelope error:
if (isEnvelopeError(error)) {
  // narrowed to EnvelopeError union
}
```

`isHttpError(error, status)` narrows both `kind` and `status`, which in turn narrows `body` to the matching `errorSchema` entry.

### Builder-level default

To make envelope mode the default for every endpoint declared by a builder, set `defaults.result`:

```typescript
const API = builder({
  defaults: { result: 'envelope' },
})

// inherits result: 'envelope'
const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: UserSchema,
})

// per-endpoint override still wins
const ping = API.declareEndpoint({
  method: 'GET',
  url: '/ping',
  responseSchema: z.literal('pong'),
  result: 'data',
})
```

### Header helpers

`response.headers` is a native `Headers` instance. Three thin helpers cover the common cases without having to remember the casing:

```typescript
import { getCookie, getHeader, getRetryAfterMs } from '@navios/builder'

const etag = getHeader(response, 'etag') // string | null
const session = getCookie(response, 'sid') // string | null (parsed from Set-Cookie)
const retryMs = getRetryAfterMs(response) // number | null (seconds or HTTP-date -> ms)
```

All helpers accept `ResponseMeta | null`, so they are safe to call on an error envelope where `response` may be absent.

### Migration from `useDiscriminatorResponse`

```typescript
// Before
import { builder, isErrorResponse, isErrorStatus } from '@navios/builder'

const API = builder({ useDiscriminatorResponse: true })

const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: UserSchema,
  errorSchema: { 404: NotFoundSchema },
})

const result = await getUser({ urlParams: { userId: '1' } })
if (isErrorStatus(result, 404)) {
  console.log(result.error)
} else if (isErrorResponse(result)) {
  console.log(result.__status)
} else {
  console.log(result.name)
}

// After
import { builder, isHttpError } from '@navios/builder'

const API = builder()

const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: UserSchema,
  errorSchema: { 404: NotFoundSchema },
  result: 'envelope',
})

const { data, error } = await getUser({ urlParams: { userId: '1' } })
if (isHttpError(error, 404)) {
  console.log(error.body)
} else if (!error) {
  console.log(data.name)
}
```

`useDiscriminatorResponse`, `isErrorStatus`, and `isErrorResponse` are deprecated and will be removed in the next major. The legacy mode still works (and `isErrorStatus` / `isErrorResponse` still discriminate it) for one major version.

### `validateResponse: false`

For trusted servers where the runtime Zod parse on the success body is overhead, set `validateResponse: false` per endpoint. The inferred static type is still taken from `responseSchema`, but the response body is returned as-is without a `parse()` call.

```typescript
const listFeedItems = API.declareEndpoint({
  method: 'GET',
  url: '/feed',
  responseSchema: FeedItemArraySchema, // still used for the TYPE
  validateResponse: false, // but not for runtime parsing
})
```

This is independent of envelope mode and can be combined with it.

## WebSocket Support

`@navios/builder` includes full WebSocket and Socket.IO support through the `@navios/builder/socket` export. This provides type-safe, bidirectional messaging with Zod schema validation.

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

`@navios/builder` includes Server-Sent Events support through the `@navios/builder/eventsource` export. This provides type-safe, unidirectional event streaming with Zod schema validation.

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

For detailed documentation, see the [EventSource Guide](/docs/builder/builder/advanced/eventsource).
