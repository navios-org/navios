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
  - `useDiscriminatorResponse?: boolean` - Parse error responses using the same schema (for discriminated unions). Default: `false`
  - `onError?: (error: unknown) => void` - Global error callback
  - `onZodError?: (error: ZodError, response?, originalError?) => void` - Zod validation error callback

### Returns

A `BuilderInstance` with methods to declare endpoints and manage the HTTP client.

### Example

```typescript
const API = builder({
  useDiscriminatorResponse: true,
  onError: (error) => console.error(error),
  onZodError: (zodError) => console.error('Validation failed:', zodError.errors),
})
```

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
  useDiscriminatorResponse?: boolean
  onError?: (error: unknown) => void
  onZodError?: (error: ZodError, response?: any, originalError?: unknown) => void
}
```

### BaseEndpointConfig

```typescript
interface BaseEndpointConfig {
  method: HttpMethod
  url: string
  responseSchema: ZodType
  requestSchema?: ZodType
  querySchema?: ZodType
}
```

### BaseStreamConfig

```typescript
interface BaseStreamConfig {
  method: HttpMethod
  url: string
  requestSchema?: ZodType
  querySchema?: ZodType
}
```

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

