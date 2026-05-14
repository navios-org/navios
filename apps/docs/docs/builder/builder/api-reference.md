---
sidebar_position: 5
---

# API Reference

Complete API reference for `@navios/builder`.

## builder

Creates a new API builder instance.

```typescript
function builder(config?: BuilderConfig): BuilderInstance
```

### Parameters

- `config` (optional): Configuration options
  - `defaults?: { result?: 'data' | 'envelope' }` - Default settings applied to every endpoint; per-endpoint values override
  - `onError?: (event: BuilderErrorEvent) => void` - Unified error hook fired on every failure path. The event carries `kind`, `endpoint`, `status`, `zodIssues`, `cause`, `body`, plus optional `topic` / `eventName` / `rawData` on socket / SSE builders

### Returns

A `BuilderInstance` with methods to declare endpoints and manage the HTTP client.

### Example

```typescript
const API = builder({
  defaults: { result: 'envelope' },
  onError: (event) => {
    if (event.kind === 'validation') {
      console.error('Validation failed:', event.zodIssues)
    } else {
      console.error('Request failed:', event.endpoint, event.cause)
    }
  },
})
```

The v1 `useDiscriminatorResponse` flag and `onZodError` callback were removed in v2. Use per-endpoint `result: 'envelope'` (or `defaults: { result: 'envelope' }`) for the discriminator-mode replacement, and filter on `event.kind === 'validation'` inside the unified `onError`.

## BuilderInstance

The instance returned by `builder()`.

### Methods

#### declareEndpoint

Declares a typed HTTP endpoint for JSON responses.

```typescript
declareEndpoint<Config>(options: BaseEndpointConfig): EndpointFunction
```

**Options:**

- `method`: `'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'`
- `url`: `string` - Endpoint URL (supports `$paramName` syntax)
- `responseSchema`: `ZodType` - **Required** - Schema for response validation
- `requestSchema`: `ZodType` - **Optional** - Schema for request body (POST, PUT, PATCH)
- `querySchema`: `ZodType` - **Optional** - Schema for query parameters
- `errorSchema`: `ErrorSchemaRecord` - **Optional** - Map of HTTP status codes to Zod schemas for error responses
- `urlParamsSchema`: `ZodObject` - **Optional** - Schema for runtime validation of URL parameters
- `clientOptions`: `ClientOptions` - **Optional** - Per-endpoint client configuration (timeout, headers, etc.)

**Returns:** A function that makes the HTTP request and returns validated response data.

**Example:**

```typescript
const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

const user = await getUser({ urlParams: { userId: '123' } })
```

#### declareStream

Declares an endpoint that returns binary data (Blob).

```typescript
declareStream<Config>(options: BaseStreamConfig): StreamFunction
```

**Options:**

- `method`: `'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'`
- `url`: `string` - Endpoint URL (supports `$paramName` syntax)
- `requestSchema`: `ZodType` - **Optional** - Schema for request body
- `querySchema`: `ZodType` - **Optional** - Schema for query parameters
- `errorSchema`: `ErrorSchemaRecord` - **Optional** - Map of HTTP status codes to Zod schemas for error responses
- `urlParamsSchema`: `ZodObject` - **Optional** - Schema for runtime validation of URL parameters
- `clientOptions`: `ClientOptions` - **Optional** - Per-endpoint client configuration

**Returns:** A function that makes the HTTP request and returns a `Blob`.

**Example:**

```typescript
const downloadFile = API.declareStream({
  method: 'GET',
  url: '/files/$fileId/download',
})

const blob = await downloadFile({ urlParams: { fileId: '123' } })
```

#### declareMultipart

Declares an endpoint for multipart/form-data uploads.

```typescript
declareMultipart<Config>(options: BaseEndpointConfig): MultipartFunction
```

**Options:**

- `method`: `'POST' | 'PUT' | 'PATCH'`
- `url`: `string` - Endpoint URL (supports `$paramName` syntax)
- `responseSchema`: `ZodType` - **Required** - Schema for response validation
- `requestSchema`: `ZodType` - **Optional** - Schema for request body (should include File instances)
- `querySchema`: `ZodType` - **Optional** - Schema for query parameters
- `errorSchema`: `ErrorSchemaRecord` - **Optional** - Map of HTTP status codes to Zod schemas for error responses
- `urlParamsSchema`: `ZodObject` - **Optional** - Schema for runtime validation of URL parameters
- `clientOptions`: `ClientOptions` - **Optional** - Per-endpoint client configuration

**Returns:** A function that automatically converts the request data to `FormData` and makes the HTTP request.

**Example:**

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

const result = await uploadFile({
  data: {
    file: selectedFile,
    name: 'document.pdf',
  },
})
```

#### provideClient

Sets the HTTP client for the API.

```typescript
provideClient(client: Client): void
```

**Parameters:**

- `client`: An HTTP client instance that implements the `Client` interface

**Example:**

```typescript
import { create } from '@navios/http'

const client = create({ baseURL: 'https://api.example.com' })
API.provideClient(client)
```

#### getClient

Gets the current HTTP client.

```typescript
getClient(): Client
```

**Returns:** The configured HTTP client.

**Throws:** `NaviosError` if no client has been provided.

**Example:**

```typescript
const client = API.getClient()
// Use client directly if needed
```

## Endpoint Function

The function returned by `declareEndpoint()`, `declareStream()`, or `declareMultipart()`.

### Parameters

The endpoint function accepts an object with:

- `urlParams?`: `Record<string, string>` - URL path parameters (when URL has `$params`)
- `params?`: `z.infer<QuerySchema>` - Query parameters (when `querySchema` defined)
- `data?`: `z.infer<RequestSchema>` - Request body (when `requestSchema` defined)
- `headers?`: `Record<string, string>` - Additional headers
- `signal?`: `AbortSignal` - AbortSignal for request cancellation

### Returns

- `declareEndpoint`: `Promise<z.output<ResponseSchema>>`
- `declareStream`: `Promise<Blob>`
- `declareMultipart`: `Promise<z.output<ResponseSchema>>`

### Example

```typescript
const updateUser = API.declareEndpoint({
  method: 'PUT',
  url: '/users/$userId',
  querySchema: z.object({ notify: z.boolean().optional() }),
  requestSchema: z.object({ name: z.string() }),
  responseSchema: userSchema,
})

const user = await updateUser({
  urlParams: { userId: '123' },
  params: { notify: true },
  data: { name: 'John Doe' },
  headers: { 'X-Custom-Header': 'value' },
  signal: abortController.signal,
})
```

## Endpoint Configuration

Each endpoint function has a `config` property that exposes its configuration:

```typescript
const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

console.log(getUser.config)
// {
//   method: 'GET',
//   url: '/users/$userId',
//   responseSchema: ZodObject { ... }
// }
```

## Types

### BuilderConfig

```typescript
interface BuilderConfig {
  defaults?: { result?: 'data' | 'envelope' }
  onError?: (event: BuilderErrorEvent) => void
}
```

### BuilderErrorEvent

Structured event passed to `onError`:

```typescript
interface BuilderErrorEvent {
  kind: BuilderErrorKind
  endpoint?: { method: HttpMethod; url: string }
  status?: number
  zodIssues?: readonly $ZodIssue[]
  cause: unknown
  body?: unknown
  topic?: string       // socket builder only
  eventName?: string   // eventsource builder only
  rawData?: unknown    // socket / SSE raw payload
}

type BuilderErrorKind =
  | 'http'
  | 'http-unknown'
  | 'validation'
  | 'network'
  | 'socket-ack-timeout'
  | 'socket-transport'
  | 'event-source-transport'
```

### EndpointOptions

```typescript
interface EndpointOptions {
  method: HttpMethod
  url: string
  responseSchema: ZodType
  requestSchema?: ZodType
  querySchema?: ZodType
  errorSchema?: ErrorSchemaRecord
  urlParamsSchema?: ZodObject
  clientOptions?: ClientOptions
  result?: 'data' | 'envelope'
  validateResponse?: boolean
}
```

The v1 `BaseEndpointConfig`, `BaseStreamConfig`, `AnyEndpointConfig`, `AnyStreamConfig`, `StreamOptions` (legacy), `AbstractEndpoint`, `AbstractStream` types were removed in v2. Use `EndpointOptions`, `StreamOptions`, and `EndpointHandler<Options>` / `StreamHandler<Options>`.

### ErrorSchemaRecord

```typescript
type ErrorSchemaRecord = Record<number, ZodType>
```

Maps HTTP status codes to Zod schemas for error responses. Use with `result: 'envelope'` to flow typed error variants through the envelope `error` channel.

### ClientOptions

```typescript
interface ClientOptions {
  timeout?: number
  headers?: Record<string, string>
  transformRequest?: {
    skipFields?: string[]
    skipPaths?: string[]
  }
  transformResponse?: {
    skipFields?: string[]
    skipPaths?: string[]
  }
  [key: string]: unknown
}
```

Per-endpoint configuration options passed through to the HTTP client.

### HttpMethod

```typescript
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'
```

### Client

```typescript
interface Client {
  request<T>(config: AbstractRequestConfig): Promise<AbstractResponse<T>>
}

interface AbstractRequestConfig {
  method: string
  url: string
  data?: any
  params?: any
  headers?: Record<string, string>
  responseType?: 'json' | 'blob'
}

interface AbstractResponse<T> {
  data: T
  status: number
  headers: Record<string, string>
}
```

## Errors

### NaviosError

Base error class for all Builder errors.

```typescript
class NaviosError extends Error {
  constructor(message: string, cause?: unknown)
  cause?: unknown
}
```

**Example:**

```typescript
import { NaviosError } from '@navios/builder'

try {
  await getUser({ urlParams: { userId: '123' } })
} catch (error) {
  if (error instanceof NaviosError) {
    console.error('Navios Error:', error.message)
    console.error('Original error:', error.cause)
  }
}
```

### Unknown HTTP errors (envelope mode)

In envelope mode, an error response whose status doesn't match any `errorSchema` key is surfaced as the `http-unknown` variant on `envelope.error` rather than thrown. The v1 `UnknownResponseError` class was removed.

```typescript
const { data, error } = await getUser({ urlParams: { userId: '123' } })

if (error && error.kind === 'http-unknown') {
  console.error('Unhandled status:', error.status, error.body)
}
```

## Type Guards

### isHttpError

Narrows an envelope `error` to the typed HTTP variant for a specific status (or any status if you omit the second arg).

```typescript
function isHttpError(error: EnvelopeError, status?: number): boolean
```

**Example:**

```typescript
import { isHttpError } from '@navios/builder'

const { data, error } = await getUser({ urlParams: { userId: '123' } })

if (isHttpError(error, 404)) {
  // error.body is narrowed to the 404 schema
  console.log('Not found:', error.body)
}
```

### isValidationError / isNetworkError / isUnknownHttpError

Narrow an envelope `error` to the corresponding variant.

```typescript
function isValidationError(error: EnvelopeError): boolean
function isNetworkError(error: EnvelopeError): boolean
function isUnknownHttpError(error: EnvelopeError): boolean
```

The v1 `isErrorStatus` / `isErrorResponse` guards and `__status` injection were removed in v2.

## Low-Level API

### createHandler

Create a custom handler with full control.

```typescript
function createHandler(options: {
  options: BaseEndpointConfig
  context: BuilderContext
  transformRequest?: (request: any) => any
  transformResponse?: (data: any) => any
}): HandlerFunction
```

### createEndpoint

Create a custom endpoint handler.

```typescript
function createEndpoint(
  options: BaseEndpointConfig,
  context: BuilderContext,
  transforms?: {
    transformRequest?: (request: any) => any
    transformResponse?: (data: any) => any
  }
): EndpointFunction
```

### makeConfig

Create request configuration manually.

```typescript
function makeConfig(
  args: EndpointFunctionArgs,
  options: BaseEndpointConfig,
  method: HttpMethod,
  url: string
): AbstractRequestConfig
```

### bindUrlParams

Bind URL parameters to a URL pattern.

```typescript
function bindUrlParams(url: string, params: Record<string, string>): string
```

**Example:**

```typescript
import { bindUrlParams } from '@navios/builder'

const url = bindUrlParams('/users/$userId/posts/$postId', {
  userId: '123',
  postId: '456',
})
// Returns: '/users/123/posts/456'
```

## Type Utilities

### UrlParams

Extracts URL parameter object type from a URL string.

```typescript
type UrlParams<Url extends string> = {
  [K in ExtractUrlParams<Url>]: string
}
```

### UrlHasParams

Checks if a URL has parameters.

```typescript
type UrlHasParams<Url extends string> = boolean
```

## Compatible Clients

Builder works with any HTTP client that implements the `Client` interface:

- `@navios/http` (recommended)
- `axios`
- Custom clients implementing the `Client` interface

## See Also

- [Getting Started](/docs/builder/builder/getting-started) - Quick start guide
- [Defining Endpoints](/docs/builder/builder/guides/defining-endpoints) - How to declare endpoints
- [Best Practices](/docs/builder/builder/best-practices) - Best practices and patterns

