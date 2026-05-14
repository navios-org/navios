# @navios/builder Specification

## Overview

`@navios/builder` is a type-safe HTTP API client builder for TypeScript. It provides a declarative way to define API endpoints with full Zod schema validation for requests, responses, and URL parameters.

**Package:** `@navios/builder`
**Version:** 2.0.0
**License:** MIT
**Peer Dependencies:** `zod` (^3.25.0 || ^4.0.0)

## Core Concepts

### Builder Pattern

The builder creates a centralized API definition that:
- Declares typed endpoints with request/response schemas
- Manages HTTP client lifecycle
- Handles error transformation and validation
- Supports multiple response types (JSON, streams, multipart)

### Type Safety

- URL parameters are extracted from `$paramName` syntax
- Request bodies are validated against Zod schemas
- Response data is validated and typed
- Query parameters support Zod schema validation

---

## API Reference

### `builder(config?: BuilderConfig): BuilderInstance`

Creates a new API builder instance.

```typescript
import { builder } from '@navios/builder'

const API = builder({
  defaults: { result: 'envelope' },
  onError: (event) => console.error(event.kind, event.endpoint, event.cause),
})
```

#### BuilderConfig

| Property | Type | Description |
|----------|------|-------------|
| `defaults` | `{ result?: 'data' \| 'envelope' }` | Default settings applied to every endpoint declared by this builder; per-endpoint values override |
| `onError` | `(event: BuilderErrorEvent) => void` | Unified error hook fired on every failure path. See `BuilderErrorEvent` below |

#### BuilderErrorEvent

Structured payload passed to `onError` on every error path (main builder, socket builder, eventsource builder):

| Field | Type | Notes |
|-------|------|-------|
| `kind` | `BuilderErrorKind` | Classifier; see below |
| `endpoint` | `{ method: HttpMethod; url: string } \| undefined` | The endpoint that triggered the failure (absent on socket / SSE) |
| `status` | `number \| undefined` | HTTP status (absent on `network` / `socket-*` / `event-source-*` failures) |
| `zodIssues` | `readonly $ZodIssue[] \| undefined` | Present when `kind === 'validation'` |
| `cause` | `unknown` | The original error/throwable |
| `body` | `unknown` | Raw response body (when available) |
| `topic` | `string \| undefined` | Socket topic (socket-builder events only) |
| `eventName` | `string \| undefined` | SSE event name (eventsource-builder events only) |
| `rawData` | `unknown` | Raw payload before validation (socket / SSE) |

`BuilderErrorKind` is the union of:

- `'http'`, `'http-unknown'`, `'validation'`, `'network'` — main builder
- `'socket-ack-timeout'`, `'socket-transport'` — socket builder
- `'event-source-transport'` — eventsource builder

The socket builder's removed callbacks (`onValidationError`, `onAckTimeout`) and the eventsource builder's removed callbacks (legacy `onError(error)`, `onValidationError`) all route through this unified hook now. Filter on `event.kind`.

---

### BuilderInstance Methods

#### `declareEndpoint(options)`

Declares a typed HTTP endpoint for JSON responses.

```typescript
const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: z.object({
    id: z.string(),
    name: z.string(),
  }),
})

// Usage
const user = await getUser({ urlParams: { userId: '123' } })
```

**Overloads:**

1. **GET/DELETE/HEAD/OPTIONS (no body)**
   ```typescript
   declareEndpoint<Config extends { method: 'GET' | 'DELETE' | 'HEAD' | 'OPTIONS' }>({
     method: Config['method']
     url: string
     querySchema?: ZodType
     responseSchema: ZodType
   })
   ```

2. **POST/PUT/PATCH (with body)**
   ```typescript
   declareEndpoint<Config extends { method: 'POST' | 'PUT' | 'PATCH' }>({
     method: Config['method']
     url: string
     querySchema?: ZodType
     requestSchema?: ZodType
     responseSchema: ZodType
   })
   ```

#### `declareStream(options)`

Declares an endpoint that returns binary data (Blob).

```typescript
const downloadFile = API.declareStream({
  method: 'GET',
  url: '/files/$fileId/download',
})

// Usage
const blob = await downloadFile({ urlParams: { fileId: '123' } })
```

**Options:**

| Property | Type | Description |
|----------|------|-------------|
| `method` | `HttpMethod` | HTTP method |
| `url` | `string` | Endpoint URL (supports `$paramName` syntax) |
| `querySchema` | `ZodType` | Optional query parameters schema |
| `requestSchema` | `ZodType` | Optional request body schema |

**Returns:** `Promise<Blob>`

#### `declareMultipart(options)`

Declares an endpoint for multipart/form-data uploads.

```typescript
const uploadFile = API.declareMultipart({
  method: 'POST',
  url: '/files',
  requestSchema: z.object({
    file: z.instanceof(File),
    name: z.string(),
  }),
  responseSchema: z.object({
    id: z.string(),
    url: z.string(),
  }),
})

// Usage
const result = await uploadFile({
  data: {
    file: selectedFile,
    name: 'document.pdf',
  },
})
```

**Features:**
- Automatic FormData construction
- File object serialization
- Array field support
- Nested object handling

#### `provideClient(client: Client)`

Registers the HTTP client for making requests.

```typescript
import { create } from '@navios/http'

const client = create({ baseURL: 'https://api.example.com' })
API.provideClient(client)
```

#### `getClient(): Client`

Returns the registered HTTP client.

---

## URL Parameters

URL parameters are defined using `$paramName` syntax and automatically extracted:

```typescript
const endpoint = API.declareEndpoint({
  method: 'GET',
  url: '/organizations/$orgId/users/$userId',
  responseSchema: userSchema,
})

// TypeScript enforces both parameters
await endpoint({
  urlParams: {
    orgId: 'org-123',
    userId: 'user-456',
  },
})
```

### Type Extraction

The library extracts parameter names at the type level:

```typescript
type ParsePathParams<'/users/$userId/posts/$postId'> = 'userId' | 'postId'
```

---

## Request Arguments

### EndpointFunctionArgs

The generated endpoint function accepts an object with:

| Property | Type | Description |
|----------|------|-------------|
| `urlParams` | `Record<string, string>` | URL path parameters (if URL has `$params`) |
| `params` | `z.infer<QuerySchema>` | Query parameters (if `querySchema` defined) |
| `data` | `z.infer<RequestSchema>` | Request body (if `requestSchema` defined) |

```typescript
// Full example with all argument types
const updateUser = API.declareEndpoint({
  method: 'PUT',
  url: '/users/$userId',
  querySchema: z.object({ notify: z.boolean().optional() }),
  requestSchema: z.object({ name: z.string() }),
  responseSchema: userSchema,
})

await updateUser({
  urlParams: { userId: '123' },
  params: { notify: true },
  data: { name: 'John Doe' },
})
```

---

## Error Handling

### NaviosError

Custom error class for request failures.

```typescript
import { NaviosError } from '@navios/builder'

try {
  await endpoint()
} catch (error) {
  if (error instanceof NaviosError) {
    console.error(error.message)
    console.error(error.cause) // Original error
  }
}
```

### Discriminated Union Responses

Schemas that encode a discriminator inside the success body still work as expected — `responseSchema` may be any Zod type:

```typescript
const responseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('success'), data: userSchema }),
  z.object({ status: z.literal('error'), message: z.string() }),
])

const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema,
})

const result = await getUser({ urlParams: { userId: '123' } })
if (result.status === 'success') {
  console.log(result.data) // Typed as User
} else {
  console.error(result.message) // Typed as string
}
```

For HTTP-level error discrimination, declare `errorSchema` and opt the endpoint into `result: 'envelope'` (see below).

### Error Callbacks

```typescript
const API = builder({
  onError: (event) => {
    if (event.kind === 'validation') {
      console.error('Validation failed:', event.zodIssues)
    } else {
      reportToSentry(event.cause)
    }
  },
})
```

---

## Envelope Mode (`result: 'envelope'`)

Per-endpoint opt-in mode that swaps the default "parsed body, throw on error" return shape for a single typed value carrying the parsed body, a discriminated error, and response metadata. Envelope endpoints never throw.

### `result` option

Set on `declareEndpoint`, `declareMultipart`, and `declareStream`, or via `builder({ defaults: { result: 'envelope' } })` to make envelope the default.

| Value | Return type | Throws on error |
|-------|-------------|-----------------|
| `'data'` (default) | `z.output<ResponseSchema>` | Yes |
| `'envelope'` | `ResponseEnvelope<TData, EnvelopeError<ErrorSchema>>` | No |

### `ResponseEnvelope<TData, TError>`

Discriminated union of success and error branches:

```typescript
interface ResponseMeta {
  status: number
  statusText: string
  headers: Headers
}

interface ResponseEnvelopeOk<TData> {
  readonly ok: true
  readonly data: TData
  readonly error: null
  readonly response: ResponseMeta
}

interface ResponseEnvelopeErr<TError> {
  readonly ok: false
  readonly data: null
  readonly error: TError
  readonly response: ResponseMeta | null  // null on network failure
}

type ResponseEnvelope<TData, TError> =
  | ResponseEnvelopeOk<TData>
  | ResponseEnvelopeErr<TError>
```

### `EnvelopeError` variants

Tagged union keyed on `kind`:

| Kind | Fields | When |
|------|--------|------|
| `'http'` | `status: keyof ErrorSchema & number`, `body: z.output<ErrorSchema[status]> & { status }` | Response status matched an `errorSchema` entry and parsed cleanly |
| `'http-unknown'` | `status: number`, `body: unknown` | HTTP non-2xx with no matching `errorSchema` entry |
| `'validation'` | `status: number`, `issues: readonly $ZodIssue[]`, `body: unknown` | Body failed `responseSchema` (or matched `errorSchema`) parse |
| `'network'` | `cause: unknown` | Request never produced a response (DNS, abort, timeout) |

When `errorSchema` is not declared, the `http` variant drops out of the union; all HTTP errors surface as `http-unknown`.

### Type guards

```typescript
function isHttpError<E, S extends keyof E & number>(
  error: unknown,
  status?: S,
): error is HttpErrorVariant<E> & { status: S }

function isUnknownHttpError(error: unknown): error is UnknownHttpErrorVariant

function isValidationError(error: unknown): error is ValidationErrorVariant

function isNetworkError(error: unknown): error is NetworkErrorVariant

function isEnvelopeError(error: unknown): error is EnvelopeError
```

`isHttpError(error, status)` narrows both `kind` and `status`, which in turn narrows `body` to the matching `errorSchema` entry.

### Header helpers

| Helper | Signature | Returns |
|--------|-----------|---------|
| `getHeader` | `(meta: ResponseMeta \| null, name: string)` | `string \| null` |
| `getCookie` | `(meta: ResponseMeta \| null, name: string)` | `string \| null` (parsed from `Set-Cookie`) |
| `getRetryAfterMs` | `(meta: ResponseMeta \| null)` | `number \| null` (seconds or HTTP-date converted to ms) |

All accept `ResponseMeta | null`, so they are safe to call on the error branch.

### `classifyError`

The internal classifier used by envelope-mode handlers; exported for parity with custom dispatchers and tests.

```typescript
function classifyError<E extends ErrorSchemaRecord | undefined = undefined>(
  error: unknown,
  errorSchema: E,
): EnvelopeError<E>
```

### `validateResponse`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `validateResponse` | `boolean` | `true` | When `false`, skip `responseSchema.parse()` at runtime. Static type is still taken from `responseSchema`. |

### `defaults` on `BuilderConfig`

| Property | Type | Description |
|----------|------|-------------|
| `defaults.result` | `'data' \| 'envelope'` | Default `result` mode for every endpoint declared by this builder. Per-endpoint `result` overrides. |

### Removed in v2

| Removed | Replacement |
|---------|-------------|
| `builder({ useDiscriminatorResponse: true })` | Per-endpoint `result: 'envelope'` (or `defaults: { result: 'envelope' }`) |
| `onZodError(error, response, originalError)` callback | `onError(event)` with `event.kind === 'validation'` |
| `isErrorStatus(result, status)` | `isHttpError(error, status)` on an envelope-mode error |
| `isErrorResponse(result)` | `isEnvelopeError(error)` or `isHttpError(error)` |
| `__status` injection on parsed error bodies | `error.status` on the typed `EnvelopeError` variants |
| `UnknownResponseError` class | Envelope `http-unknown` variant |
| `InferErrorSchemaOutputWithStatus<T>` type | `EnvelopeError<T>` |
| `UseDiscriminator` generic on `BuilderInstance` / `EndpointHandler` / `StreamHandler` | None — generic dropped |
| Legacy types `BaseEndpointConfig`, `BaseStreamConfig`, `AnyEndpointConfig`, `AnyStreamConfig`, `StreamOptions` | `EndpointOptions`, `StreamOptions` |
| `AbstractEndpoint<Config>`, `AbstractStream<Config>` | `EndpointHandler<Options>`, `StreamHandler<Options>` |
| `[key: string]: any` index signature on `AbstractRequestConfig` | Typed `timeout`, `responseType`, `clientOptions` slots |

### Removed in v2 (round 2)

| Removed | Replacement |
|---------|-------------|
| Socket `onValidationError` callback | `onError(event)` with `event.kind === 'validation'` (uses `event.topic`) |
| Socket `onAckTimeout` callback | `onError(event)` with `event.kind === 'socket-ack-timeout'` |
| EventSource legacy `onError(error)` | `onError(event: BuilderErrorEvent)` (now a structured event) |
| EventSource `onValidationError` callback | `onError(event)` with `event.kind === 'validation'` (uses `event.eventName`) |
| `RequestArgs<Url, QuerySchema, RequestSchema, UrlParamsSchema, IsServer>` | `ClientRequestArgs<Options>` (uses `z.input`) or `ServerRequestArgs<Options>` (uses `z.output`); the `IsServer` boolean generic is gone |

See [`docs/plans/2026-05-14-builder-response-envelope-design.md`](../docs/plans/2026-05-14-builder-response-envelope-design.md) for the full design rationale.

---

## Advanced Usage

### Endpoint Configuration Access

Each declared endpoint exposes its configuration:

```typescript
const getUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  responseSchema: z.array(userSchema),
})

console.log(getUsers.config)
// { method: 'GET', url: '/users', responseSchema: ... }
```

### Custom Handler Creation

For advanced use cases, use the low-level handler creation functions:

```typescript
import { createHandler, createEndpoint } from '@navios/builder'

const handler = createHandler({
  options: endpointConfig,
  context: builderContext,
  transformRequest: (request) => {
    // Modify request before sending
    return request
  },
  transformResponse: (data) => {
    // Transform response data
    return data
  },
})
```

### Request Configuration

Use `makeConfig` for manual request configuration:

```typescript
import { makeConfig, bindUrlParams } from '@navios/builder'

const config = makeConfig(
  { urlParams: { id: '123' }, data: { name: 'John' } },
  endpointOptions,
  'POST',
  '/users/$id'
)
```

---

## Client Interface

The builder works with any HTTP client implementing:

```typescript
interface Client {
  request<T>(config: AbstractRequestConfig): Promise<AbstractResponse<T>>
}

interface AbstractRequestConfig {
  method: string
  url: string
  data?: unknown
  params?: unknown
  headers?: Record<string, string>
  responseType?: 'json' | 'blob'
  timeout?: number
  clientOptions?: ClientOptions
  signal?: AbortSignal
}

interface AbstractResponse<T> {
  data: T
  status: number
  headers: Record<string, string>
}
```

Note: v2 dropped the `[key: string]: any` index signature from `AbstractRequestConfig`. Custom adapter-specific fields belong inside the typed `clientOptions` slot.

### Compatible Clients

- `navios` (recommended)
- `axios`
- Custom fetch wrappers

---

## TypeScript Types

### Exported Types

```typescript
// HTTP Methods
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'

// Endpoint / stream options (unified)
type EndpointOptions = {
  method: HttpMethod
  url: string
  querySchema?: ZodType
  requestSchema?: ZodType
  responseSchema: ZodType
  errorSchema?: ErrorSchemaRecord
  urlParamsSchema?: ZodObject
  clientOptions?: ClientOptions
  result?: 'data' | 'envelope'
  validateResponse?: boolean
}

// Handler types
type EndpointHandler<Options extends EndpointOptions>
type StreamHandler<Options extends StreamOptions>

// Request argument types
type NaviosZodRequest<Options> = {
  urlParams?: Record<string, string>
  params?: z.infer<Options['querySchema']>
  data?: z.infer<Options['requestSchema']>
}

// Envelope types
type ResponseEnvelope<TData, TError>
type ResponseEnvelopeOk<TData>
type ResponseEnvelopeErr<TError>
type ResponseMeta = { status: number; statusText: string; headers: Headers }
type EnvelopeError<E = undefined>  // tagged union of variants
type HttpErrorVariant<E>
type UnknownHttpErrorVariant
type ValidationErrorVariant
type NetworkErrorVariant

// Error hook event
type BuilderErrorEvent

// Type utilities
type UrlParams<Url extends string>  // Extracts URL parameter object type
type UrlHasParams<Url extends string>  // Boolean check for URL parameters
```

Removed in v2: `BaseEndpointConfig`, `BaseStreamConfig`, `AnyEndpointConfig`, `AnyStreamConfig`, `StreamOptions` (legacy), `AbstractEndpoint`, `AbstractStream`, `InferErrorSchemaOutputWithStatus`.

---

## Integration with @navios/react-query

The builder integrates with TanStack Query through `@navios/react-query`:

```typescript
import { useQuery } from '@navios/react-query'
import { getUser } from './api'

function UserProfile({ userId }) {
  const { data, isLoading } = useQuery(getUser, {
    urlParams: { userId },
  })

  if (isLoading) return <Loading />
  return <div>{data.name}</div>
}
```

---

## Best Practices

### 1. Centralize API Definitions

```typescript
// api/endpoints/users.ts
export const getUser = API.declareEndpoint(...)
export const updateUser = API.declareEndpoint(...)

// api/index.ts
export * from './endpoints/users'
export { API }
```

### 2. Use Zod Schema Reuse

```typescript
const userSchema = z.object({
  id: z.string(),
  name: z.string(),
})

const getUserResponse = userSchema
const listUsersResponse = z.array(userSchema)
const createUserRequest = userSchema.omit({ id: true })
```

### 3. Handle Errors Consistently

```typescript
const API = builder({
  onError: (event) => {
    if (event.cause instanceof NaviosError) {
      toast.error(event.cause.message)
    }
  },
})
```

### 4. Type Endpoint Parameters

```typescript
// Let TypeScript infer parameter types
const endpoint = API.declareEndpoint({...})
type EndpointArgs = Parameters<typeof endpoint>[0]
```
