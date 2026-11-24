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
  - `client?: Client` - HTTP client used by every endpoint declared on this builder. Can also be supplied later with `provideClient`, or per call with `{ client }`
  - `onError?: (error: EndpointError) => void` - Called once for every failed call with the same `EndpointError` the caller receives. An exception thrown inside the hook is caught and logged; it never changes the outcome of the call

### Returns

A `BuilderInstance` with methods to declare endpoints and manage the HTTP client.

### Example

```typescript
import { builder } from '@navios/builder'
import { create } from '@navios/http'

const API = builder({
  client: create({ baseURL: 'https://api.example.com' }),
  onError: (error) => {
    console.error(error.kind, error.endpoint.method, error.endpoint.url)
  },
})
```

## BuilderInstance

The instance returned by `builder()`.

### declareEndpoint

Declares a typed HTTP endpoint.

```typescript
declareEndpoint<const Options extends BaseEndpointOptions>(
  options: Options & RequireResponseSchema<Options>,
): EndpointHandler<Options>
```

**Options:**

| Option             | Type                                                          | Description                                                                                         |
| ------------------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `method`           | `'GET' \| 'POST' \| 'PUT' \| 'DELETE' \| 'PATCH' \| 'HEAD' \| 'OPTIONS'` | **Required.** HTTP method                                                                |
| `url`              | `string`                                                      | **Required.** URL template; `$paramName` marks a URL parameter                                      |
| `responseSchema`   | `Schema`                                                      | Schema for a JSON response. **Required** unless `responses` is given or `response` is `'blob'`, `'text'`, `'stream'` or `'void'` |
| `responses`        | `Record<number, Schema \| null>`                              | Per-status success schemas; takes the place of `responseSchema`. `null` marks a status without a body. See [SuccessSchemaRecord](#successschemarecord) |
| `requestSchema`    | `Schema`                                                      | Schema for the request body                                                                         |
| `querySchema`      | `Schema`                                                      | Schema for query parameters (an object schema)                                                      |
| `urlParamsSchema`  | `Schema`                                                      | Schema for URL parameters (an object schema). Its keys must be exactly the URL's parameter names    |
| `errorSchema`      | `Record<number, Schema>`                                      | Schemas for error bodies, by HTTP status code                                                       |
| `body`             | `'json' \| 'multipart'`                                       | Encoding of the request body. `'multipart'` converts `data` to `FormData`. Default `'json'`         |
| `response`         | `'json' \| 'blob' \| 'text' \| 'stream' \| 'void'`            | What the endpoint resolves to. Default `'json'`                                                     |
| `headers`          | `Record<string, string>`                                      | Headers sent with every call. Per-call `headers` are merged over these                              |
| `timeout`          | `number`                                                      | Timeout in milliseconds. A per-call `timeout` wins                                                  |
| `clientOptions`    | `Record<string, unknown>`                                     | Client-specific options merged into the request config. Cannot override builder-owned keys          |
| `validateResponse` | `boolean`                                                     | `false` skips the runtime parse of the response; the result is typed as the schema's input. Default `true`         |

A [`Schema`](#schema) is any [Standard Schema](https://standardschema.dev) v1 implementation: Zod, Valibot, ArkType and others. Each slot takes its own schema, so libraries can be mixed within one endpoint.

**Returns:** an [`EndpointHandler`](#endpoint-handler).

**Throws:** `NaviosError` when `urlParamsSchema` keys do not match the URL's parameters. The check runs for schemas that expose their keys as `.shape` (Zod objects); other schemas are validated on each call only.

**Examples:**

```typescript
// JSON endpoint
const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
  errorSchema: { 404: z.object({ message: z.string() }) },
})

// File upload
const uploadFile = API.declareEndpoint({
  method: 'POST',
  url: '/files',
  body: 'multipart',
  requestSchema: z.object({ file: z.instanceof(File) }),
  responseSchema: z.object({ id: z.string() }),
})

// File download
const downloadFile = API.declareEndpoint({
  method: 'GET',
  url: '/files/$fileId',
  response: 'blob',
})

// No response body (204)
const deleteFile = API.declareEndpoint({
  method: 'DELETE',
  url: '/files/$fileId',
  response: 'void',
})

// A different body per success status
const saveUser = API.declareEndpoint({
  method: 'PUT',
  url: '/users/$userId',
  requestSchema: z.object({ name: z.string() }),
  responses: {
    200: userSchema,
    201: z.object({ id: z.string(), created: z.literal(true) }),
    204: null,
  },
})
```

### provideClient

Sets or replaces the HTTP client used by every endpoint declared on this builder. Meant for application start-up.

```typescript
provideClient(client: Client): void
```

```typescript
API.provideClient(create({ baseURL: 'https://api.example.com' }))
```

### getClient

Returns the configured HTTP client.

```typescript
getClient(): Client
```

**Throws:** `NaviosError` if no client has been provided.

### withClient

Returns a new builder with the same configuration and a different client. Endpoints declared on the returned builder use that client; endpoints already declared on this builder are not affected.

```typescript
withClient(client: Client): BuilderInstance
```

```typescript
const adminAPI = API.withClient(adminClient)
```

## Endpoint Handler

The function returned by `declareEndpoint()`.

```typescript
type EndpointHandler<Options> = {
  (args, options?: EndpointCallOptions): Promise<Data>
  safe(args, options?: EndpointCallOptions): Promise<SafeResult<Data, Error>>
  config: Options
}
```

### Arguments

The first argument is an object with:

- `urlParams` - URL path parameters. Present when the URL has `$params`; typed `string | number` each, or from the input type of `urlParamsSchema`
- `params` - Query parameters, the input type of `querySchema`. Present when `querySchema` is declared
- `data` - Request body, the input type of `requestSchema`. Present when `requestSchema` is declared
- `headers?`: `Record<string, string>` - Merged over the endpoint's `headers`
- `timeout?`: `number` - Milliseconds; wins over the endpoint's `timeout`
- `signal?`: `AbortSignal | null` - For request cancellation

The input type of a schema is what it accepts before validation (`z.input` for Zod, [`InferSchemaInput`](#schema) in general); the output type is what it produces (`z.output`, `InferSchemaOutput`).

`params` and `data` are optional when their schema has no required fields. The whole argument object is optional when nothing in it is required.

The second argument is optional:

- `client?`: `Client` - HTTP client for this call only

### Return Value

| `response` option  | `endpoint(args)` resolves to    |
| ------------------ | ------------------------------- |
| `'json'` (default) | The output type of `responseSchema`; with `responses`, the union of every entry's output type, where a `null` entry contributes `undefined` |
| `'blob'`           | `Blob`                          |
| `'text'`           | `string`                        |
| `'stream'`         | `ReadableStream<Uint8Array>`    |
| `'void'`           | `undefined`                     |

`endpoint(args)` rejects with an [`EndpointError`](#endpointerror) on any failure. `endpoint.safe(args)` never rejects and resolves to a [`SafeResult`](#saferesult).

### config

The options object the endpoint was declared with.

```typescript
getUser.config.method // 'GET'
getUser.config.url // '/users/$userId'
```

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
  timeout: 10000,
  signal: abortController.signal,
})

const result = await updateUser.safe(
  { urlParams: { userId: '123' }, data: { name: 'John Doe' } },
  { client: requestClient },
)
```

## SafeResult

What `endpoint.safe()` resolves to.

```typescript
type SafeResult<TData, TError> =
  | { ok: true; data: TData; error: null; response: ResponseMeta }
  | { ok: false; data: null; error: TError; response: ResponseMeta | null }

interface ResponseMeta {
  status: number
  statusText: string
  headers: Headers
}
```

`response` is `null` on a failure where no response was received (network failure, abort, timeout, request validation, missing client).

## Errors

### EndpointError

The single error type for a failed endpoint call. It is thrown by `endpoint(args)`, returned as `result.error` by `endpoint.safe(args)`, and passed to the builder's `onError` hook.

```typescript
class EndpointError extends NaviosError {
  readonly kind: EndpointErrorKind
  readonly endpoint: { method: HttpMethod; url: string }
  readonly status?: number
  readonly body?: unknown
  readonly response: ResponseMeta | null
  readonly issues?: readonly SchemaIssue[]
  readonly cause?: unknown

  toJSON(): object
}
```

- `endpoint` - Method and URL template of the endpoint that failed
- `status` - HTTP status, when a response was received
- `body` - The schema output for kind `http`, the raw response body for `http-unknown` and `response-validation`
- `response` - Response metadata, or `null` when no response was received
- `issues` - [`SchemaIssue`](#schema) objects (`{ message, path? }`), for `request-validation` and `response-validation`
- `cause` - The original thrown value. For a validation failure of a Zod schema it is the `ZodError`; for other schema libraries it is `undefined`
- `toJSON()` - Plain-object form without `cause` and with headers flattened to a record

### EndpointErrorKind

```typescript
type EndpointErrorKind =
  | 'http'
  | 'http-unknown'
  | 'request-validation'
  | 'response-validation'
  | 'network'
  | 'timeout'
  | 'aborted'
  | 'config'
```

| Kind                  | Meaning                                                                             |
| --------------------- | ----------------------------------------------------------------------------------- |
| `http`                | Non-2xx status that matched `errorSchema`; `body` is the parsed schema output       |
| `http-unknown`        | Non-2xx status with no schema; `body` is the raw payload                            |
| `request-validation`  | `urlParamsSchema`, `querySchema` or `requestSchema` rejected the input. No request was sent |
| `response-validation` | A 2xx body failed `responseSchema` or its `responses` entry, a 2xx status is not listed in `responses`, or an error body failed its `errorSchema` entry |
| `network`             | No response was received and the request was not cancelled                          |
| `timeout`             | The request timed out                                                               |
| `aborted`             | The request was cancelled through its `AbortSignal`                                 |
| `config`              | The call could not be made: no client was provided, or a required URL parameter is missing |

### EndpointErrorOf

The typed view of `EndpointError` for an error schema: a discriminated union in which narrowing on `kind` and `status` narrows `body`. Every member is an `EndpointError` instance at runtime.

```typescript
type EndpointErrorOf<E extends ErrorSchemaRecord | undefined = undefined>
```

This is the error type of `endpoint.safe()`. To get it from an endpoint, use [`EndpointErrorType`](#endpoint-type-helpers).

```typescript
const result = await getUser.safe({ urlParams: { userId: '123' } })

if (!result.ok && result.error.kind === 'http' && result.error.status === 404) {
  result.error.body // typed from errorSchema[404]
}
```

### NaviosError

Base class of everything Builder throws. `EndpointError` extends it; a bare `NaviosError` is thrown for mistakes in a declaration and by `getClient()` when no client is set.

```typescript
class NaviosError extends Error {
  constructor(message: string, options?: { cause?: unknown })
}
```

## Type Guards

### isEndpointError

```typescript
function isEndpointError(error: unknown): error is EndpointError
```

```typescript
import { isEndpointError } from '@navios/builder'

try {
  await getUser({ urlParams: { userId: '123' } })
} catch (error) {
  if (isEndpointError(error) && error.kind === 'aborted') return
  throw error
}
```

### isHttpError

Checks for the `http` kind: the server answered with a status declared in `errorSchema` and the body parsed. With a `status` argument it also checks the status, which narrows `body` to the matching schema output.

```typescript
function isHttpError<E extends ErrorSchemaRecord, S extends keyof E & number>(
  error: unknown,
  status?: S,
): error is HttpEndpointError<E> & { status: S }
```

```typescript
import { isHttpError } from '@navios/builder'

try {
  await getUser({ urlParams: { userId: '123' } })
} catch (error) {
  if (isHttpError<typeof getUser.config.errorSchema, 404>(error, 404)) {
    console.log('Not found:', error.body.message)
  }
}
```

## Response Helpers

Helpers for reading response metadata. All accept `ResponseMeta | null`.

```typescript
function getHeader(meta: ResponseMeta | null, name: string): string | null
function getCookie(meta: ResponseMeta | null, name: string): string | null
function getRetryAfterMs(meta: ResponseMeta | null): number | null
```

- `getHeader` - Reads one header (case-insensitive)
- `getCookie` - Reads one cookie value from the response's `Set-Cookie` headers
- `getRetryAfterMs` - Parses `Retry-After` (seconds or an HTTP date) into milliseconds

```typescript
const result = await getUser.safe({ urlParams: { userId: '123' } })
const etag = getHeader(result.response, 'etag')
```

## Request Utilities

### bindUrlParams

Binds URL parameters to a URL template. Values are URL-encoded.

```typescript
function bindUrlParams(
  url: string,
  params: { urlParams?: Record<string, unknown> },
  urlParamsSchema?: Schema,
): string
```

```typescript
import { bindUrlParams } from '@navios/builder'

const url = bindUrlParams('/users/$userId/posts/$postId', {
  urlParams: { userId: '123', postId: '456' },
})
// Returns: '/users/123/posts/456'
```

**Throws:** `Error` when a parameter is missing. When `urlParamsSchema` rejects the values: the `ZodError` for a Zod schema, a `NaviosError` for any other schema. The helper is synchronous, so a schema that validates asynchronously throws a `NaviosError` here.

### getUrlParamNames

Lists the parameter names in a URL template, in order of first appearance.

```typescript
function getUrlParamNames(url: string): string[]
```

```typescript
getUrlParamNames('/users/$user_id/files/$name.json') // ['user_id', 'name']
```

### makeConfig

Creates the request configuration handed to the HTTP client.

```typescript
function makeConfig(
  request: { params?; data?; headers?; timeout?; signal? },
  options: BaseEndpointOptions,
  finalUrl: string,
): AbstractRequestConfig
```

**Throws:** when the query or body fails its schema: the `ZodError` for a Zod schema, a `NaviosError` for any other schema. Like `bindUrlParams`, it does not support schemas that validate asynchronously. (Endpoints themselves do: they validate before calling these helpers.)

### createHandler

The function behind `declareEndpoint`. Loosely typed; see [Custom Handlers](/docs/builder/builder/advanced/custom-handlers#createhandler).

```typescript
function createHandler(options: BaseEndpointOptions, context: BuilderContext): handler
```

## Types

### BuilderConfig

```typescript
interface BuilderConfig {
  client?: Client
  onError?: (error: EndpointError) => void
}
```

### BaseEndpointOptions / EndpointOptions

`BaseEndpointOptions` is the options object accepted by `declareEndpoint`. `EndpointOptions` is the same with a required `responseSchema`.

```typescript
interface BaseEndpointOptions {
  method: HttpMethod
  url: string
  responseSchema?: Schema
  responses?: SuccessSchemaRecord
  requestSchema?: Schema
  querySchema?: Schema
  urlParamsSchema?: Schema
  errorSchema?: ErrorSchemaRecord
  body?: 'json' | 'multipart'
  response?: 'json' | 'blob' | 'text' | 'stream' | 'void'
  headers?: Record<string, string>
  timeout?: number
  clientOptions?: ClientOptions
  validateResponse?: boolean
}
```

### ZodBaseEndpointOptions / ZodEndpointOptions

`BaseEndpointOptions` and `EndpointOptions` with every schema slot narrowed to Zod (`ZodType`, and `ZodObject` for `querySchema` and `urlParamsSchema`). They are exported by `@navios/core`, not by the builder: controllers and OpenAPI generation read Zod schemas directly, so the server constrains its endpoints with these types. Use them for your own helpers that need the same guarantee:

```typescript
import type { EndpointHandler } from '@navios/builder'
import type { ZodEndpointOptions } from '@navios/core'

function describe<Options extends ZodEndpointOptions>(endpoint: EndpointHandler<Options>) {
  return endpoint.config.responseSchema.description
}
```

An endpoint declared with a schema from another library is not assignable to them.

### Schema

The schema type every slot accepts: the [Standard Schema](https://standardschema.dev) v1 interface. The builder declares it itself and has no runtime dependency on a schema library.

```typescript
interface Schema<Input = unknown, Output = Input> {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: string
    readonly validate: (value: unknown) => SchemaResult<Output> | Promise<SchemaResult<Output>>
    readonly types?: { readonly input: Input; readonly output: Output }
  }
}

type SchemaResult<Output> =
  | { readonly value: Output; readonly issues?: undefined }
  | { readonly issues: readonly SchemaIssue[] }

interface SchemaIssue {
  readonly message: string
  readonly path?: readonly (PropertyKey | { readonly key: PropertyKey })[]
}

type InferSchemaInput<S> // the type a schema accepts
type InferSchemaOutput<S> // the type a schema produces
```

`validate` may return a promise; endpoints await it. Zod's issues satisfy `SchemaIssue` and keep their extra fields (`code`, `expected`, ...) at runtime.

See [Other Schema Libraries](/docs/builder/builder/guides/schemas#other-schema-libraries).

### SuccessSchemaRecord

```typescript
type SuccessSchemaRecord = Record<number, Schema | null>
```

The type of the `responses` option: success status codes mapped to the schema for that status, or `null` for a status without a body. `InferSuccessOutput<R>` is the union the endpoint resolves to.

### ErrorSchemaRecord

```typescript
type ErrorSchemaRecord = Record<number, Schema>
```

Maps HTTP status codes to schemas for error responses.

### ClientOptions

```typescript
interface ClientOptions {
  [key: string]: unknown
}
```

Client-specific options for one endpoint (for example axios `withCredentials`). They are merged into the request config handed to the HTTP client. Keys the builder owns — `method`, `url`, `params`, `data`, `headers`, `signal`, `timeout`, `responseType` — cannot be overridden from here.

### HttpMethod

```typescript
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'
```

### Client

```typescript
interface Client {
  request<T = unknown>(config: AbstractRequestConfig): Promise<AbstractResponse<T>>
}

interface AbstractRequestConfig {
  method?: HttpMethod
  url: string
  params?: Record<string, unknown> | URLSearchParams
  data?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal | null
  timeout?: number
  responseType?: 'json' | 'text' | 'blob' | 'arrayBuffer' | 'formData' | 'stream'
  [key: string]: unknown
}

interface AbstractResponse<T> {
  data: T
  status: number
  statusText: string
  headers: Record<string, string> | Headers
}
```

`request` may resolve or reject for a non-2xx response; the builder checks `status` itself. A rejection carrying a `response` property is handled like a non-2xx response; a rejection without it is classified as `network`, `timeout` or `aborted`. See [HTTP Client Setup](/docs/builder/builder/guides/http-client#contract).

### Endpoint Type Helpers

Extract types from a declared endpoint:

```typescript
type Args = EndpointParams<typeof getUser> // call arguments
type Data = EndpointResult<typeof getUser> // resolved data
type Failure = EndpointErrorType<typeof getUser> // typed EndpointError union
type Config = EndpointConfig<typeof getUser> // declared options
```

The same derivations are available from an options type:

| Type                               | Description                                              |
| ---------------------------------- | -------------------------------------------------------- |
| `EndpointHandler<Options>`         | The handler type for an options object                   |
| `ClientRequestArgs<Options>`       | Call arguments (schema input types)                      |
| `ServerRequestArgs<Options>`       | Arguments as a server handler sees them (schema output types, URL params are `string`) |
| `InferEndpointReturn<Options>`     | Resolved data                                            |
| `InferEndpointError<Options>`      | Typed error                                              |
| `InferEndpointSafeResult<Options>` | What `safe()` resolves to                                |

### URL Types

```typescript
// Union of parameter names in a URL template
type Names = ParsePathParams<'/users/$userId/posts/$postId'> // 'userId' | 'postId'

// Whether a URL template has parameters
type Has = UrlHasParams<'/users/$userId'> // true

// Object type for the parameters
type Params = UrlParams<'/users/$userId'> // { userId: string | number }
```

## Compatible Clients

Builder works with any HTTP client that implements the `Client` interface:

- `@navios/http` (recommended)
- `axios`
- Custom clients, including a thin `fetch` wrapper

## See Also

- [Getting Started](/docs/builder/builder/getting-started) - Quick start guide
- [Defining Endpoints](/docs/builder/builder/guides/defining-endpoints) - How to declare endpoints
- [Error Handling](/docs/builder/builder/guides/error-handling) - The error model
- [Best Practices](/docs/builder/builder/best-practices) - Best practices and patterns
