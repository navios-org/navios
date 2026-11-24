---
title: '@navios/builder API'
---

# @navios/builder API

Every public export of `@navios/builder` and its two realtime entry points, with signatures. This page is for looking things up; the guides explain when to use each piece.

| Entry point                   | Contents                                                  |
| ----------------------------- | --------------------------------------------------------- |
| `@navios/builder`             | HTTP endpoints, errors, schema and client types           |
| `@navios/builder/socket`      | [Socket entry point](#socket-entry-point)                 |
| `@navios/builder/eventsource` | [EventSource entry point](#eventsource-entry-point)       |

## builder and BuilderConfig

```ts
function builder(config?: BuilderConfig): BuilderInstance
```

Creates a builder. See [Quick start](/docs/builder/quick-start).

| `BuilderConfig` field | Type                             | Description                                                                                         |
| --------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------- |
| `client`              | `Client`                         | HTTP client used by every endpoint of this builder. Optional; can be supplied later or per call     |
| `onError`             | `(error: EndpointError) => void` | Called once per failed call with the error the caller receives. Exceptions inside it are caught and logged |

## BuilderInstance

| Member            | Signature                                                    | Description                                                                                   |
| ----------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `declareEndpoint` | `(options) => EndpointHandler<Options>`                      | Declares an endpoint. Options are listed [below](#endpoint-options)                           |
| `provideClient`   | `(client: Client) => void`                                   | Sets or replaces the client for every endpoint of this builder                                |
| `getClient`       | `() => Client`                                               | Returns the current client; throws `NaviosError` when none was provided                       |
| `withClient`      | `(client: Client) => BuilderInstance`                        | Returns a new builder with the same config and another client. Existing endpoints are unaffected |

See [HTTP client](/docs/builder/essentials/http-client).

## Endpoint options

The object passed to `declareEndpoint`. Every schema slot accepts any [Standard Schema](https://standardschema.dev). Unknown keys are compile errors.

| Option             | Type                                                 | Default  | Description                                                                                                     |
| ------------------ | ---------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| `method`           | `HttpMethod`                                         | required | HTTP method                                                                                                     |
| `url`              | `string`                                             | required | URL template. `$name` marks a URL parameter: a letter or underscore, then letters, digits or underscores        |
| `urlParamsSchema`  | `Schema`                                             | —        | Validates and types `urlParams`. Its keys must equal the URL's parameter names, or the declaration throws. The check runs for schemas that expose their keys as `.shape`, as a Zod object does |
| `querySchema`      | `Schema`                                             | —        | Validates and types `params` (the query string)                                                                 |
| `requestSchema`    | `Schema`                                             | —        | Validates and types `data` (the body)                                                                           |
| `responseSchema`   | `Schema`                                             | —        | Validates and types a JSON response. Required unless `response` is not `'json'` or `responses` is set           |
| `responses`        | `Record<number, Schema \| null>`                     | —        | Per-status success schemas, in place of `responseSchema`. `null` means no body; the call resolves to `undefined` |
| `errorSchema`      | `Record<number, Schema>`                             | —        | Per-status schemas for non-2xx bodies; types `error.body`                                                       |
| `body`             | `'json' \| 'multipart'`                              | `'json'` | Request encoding. `'multipart'` converts `data` to `FormData`                                                   |
| `response`         | `'json' \| 'blob' \| 'text' \| 'stream' \| 'void'`   | `'json'` | What the call resolves to                                                                                       |
| `headers`          | `Record<string, string>`                             | —        | Sent with every call; per-call `headers` are merged over them                                                   |
| `timeout`          | `number`                                             | —        | Milliseconds; a per-call `timeout` wins                                                                         |
| `clientOptions`    | `ClientOptions`                                      | —        | Client-specific keys merged into the request config. Cannot override keys the builder owns                      |
| `validateResponse` | `boolean`                                            | `true`   | `false` skips the runtime check of the response; the result is typed as the schema's input                      |

Owner pages: [Declaring endpoints](/docs/builder/essentials/endpoints), [URL params, query and body](/docs/builder/essentials/inputs), [Responses](/docs/builder/essentials/responses), [Errors](/docs/builder/essentials/errors).

Related option types:

| Type                   | Description                                                             |
| ---------------------- | ----------------------------------------------------------------------- |
| `BaseEndpointOptions`  | The options above, as an interface                                      |
| `EndpointOptions`      | `BaseEndpointOptions` with a required `responseSchema`                  |
| `EndpointBodyKind`     | `'json' \| 'multipart'`                                                 |
| `EndpointResponseKind` | `'json' \| 'blob' \| 'text' \| 'stream' \| 'void'`                      |
| `SuccessSchemaRecord`  | `Record<number, Schema \| null>`, the type of `responses`               |
| `ErrorSchemaRecord`    | `Record<number, Schema>`, the type of `errorSchema`                     |
| `ClientOptions`        | `{ [key: string]: unknown }`                                            |
| `RequireResponseSchema<Options>` | Adds the `responseSchema` requirement to a declaration when it applies |
| `NoUnknownOptions<Options, Known?>` | Turns unknown option keys into compile errors                 |

## Call arguments

An endpoint takes two arguments: `endpoint(args, callOptions?)`.

| `args` field | Type                                  | Present when                                                    |
| ------------ | ------------------------------------- | --------------------------------------------------------------- |
| `urlParams`  | input of `urlParamsSchema`, or `Record<name, string \| number>` | the URL has `$name` placeholders      |
| `params`     | input of `querySchema`                | the endpoint has a `querySchema`                                |
| `data`       | input of `requestSchema`              | the endpoint has a `requestSchema`                              |
| `signal`     | `AbortSignal \| null`                 | always, optional                                                |
| `headers`    | `Record<string, string>`              | always, optional                                                |
| `timeout`    | `number`                              | always, optional                                                |

`params` and `data` are optional when their schema accepts an empty object or `undefined`. When nothing is required, `args` itself is optional.

| `EndpointCallOptions` field | Type     | Description                       |
| --------------------------- | -------- | --------------------------------- |
| `client`                    | `Client` | HTTP client for this call only    |

| Type                         | Description                                                                 |
| ---------------------------- | --------------------------------------------------------------------------- |
| `ClientRequestArgs<Options>` | The `args` type: schema **input** types plus `RequestBase`                  |
| `ServerRequestArgs<Options>` | The same parts with schema **output** types and string URL params, without `RequestBase` |
| `RequestBase`                | `{ signal?, headers?, timeout? }`                                           |
| `RequestArgsOptions`         | The minimal options shape the two types above read                          |
| `EndpointCallArgs<Options>`  | The parameter tuple `[args, callOptions?]`, with `args` optional when nothing is required |

## EndpointHandler

```ts
type EndpointHandler<Options> = ((...args: EndpointCallArgs<Options>) => Promise<InferEndpointReturn<Options>>) & {
  safe: (...args: EndpointCallArgs<Options>) => Promise<InferEndpointSafeResult<Options>>
  config: Options
}
```

| Member                   | Description                                                             |
| ------------------------ | ----------------------------------------------------------------------- |
| `endpoint(args, opts?)`  | Resolves to the data; throws an `EndpointError` on any failure          |
| `endpoint.safe(args, opts?)` | Never rejects; resolves to a `SafeResult` with the data or the same error |
| `endpoint.config`        | The options object the endpoint was declared with                       |

See [How it works](/docs/builder/how-it-works) for choosing between the two call forms.

## SafeResult and ResponseMeta

```ts
type SafeResult<TData, TError> = SafeResultOk<TData> | SafeResultErr<TError>

interface SafeResultOk<TData> {
  readonly ok: true
  readonly data: TData
  readonly error: null
  readonly response: ResponseMeta
}

interface SafeResultErr<TError> {
  readonly ok: false
  readonly data: null
  readonly error: TError
  readonly response: ResponseMeta | null
}

interface ResponseMeta {
  status: number
  statusText: string
  headers: Headers
}
```

`response` is `null` on a failure where no response was received.

## EndpointError

```ts
class EndpointError extends NaviosError {
  constructor(init: EndpointErrorInit)
}
```

The one error type of a failed call: thrown by `endpoint()`, returned by `endpoint.safe()`, passed to `onError`.

| Field      | Type                              | Description                                                        |
| ---------- | --------------------------------- | ------------------------------------------------------------------ |
| `kind`     | `EndpointErrorKind`               | Why the call failed                                                |
| `endpoint` | `{ method: HttpMethod; url: string }` | Method and URL template of the endpoint                        |
| `status`   | `number \| undefined`             | HTTP status, when a response was received                          |
| `body`     | `unknown`                         | `errorSchema` output for kind `http`, the raw payload otherwise    |
| `response` | `ResponseMeta \| null`            | Response metadata, or `null` when nothing came back                |
| `issues`   | `readonly SchemaIssue[] \| undefined` | Validation issues, for the two validation kinds                |
| `cause`    | `unknown`                         | The underlying error: the client's rejection or the schema library's error |
| `message`  | `string`                          | Human-readable description                                         |
| `toJSON()` | `() => object`                    | Plain object without `cause`, with `response.headers` flattened to a record |

`EndpointErrorKind` is `'http'`, `'http-unknown'`, `'request-validation'`, `'response-validation'`, `'network'`, `'timeout'`, `'aborted'` or `'config'`. [Errors](/docs/builder/essentials/errors) explains each one.

`EndpointErrorInit` is the constructor argument: `{ kind, endpoint, message?, status?, body?, response?, issues?, cause? }`.

`NaviosError` is the base class (`extends Error`). A bare `NaviosError` is thrown for mistakes in a declaration and by `getClient()` when no client was provided.

### Typed views

Types that narrow `EndpointError` by `kind`. At runtime every one is an `EndpointError` instance.

| Type                              | `kind`                                             | Narrowed fields                                                   |
| --------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------- |
| `HttpEndpointError<E>`            | `'http'`                                           | One member per status in `E`; `body` is that status's schema output |
| `UnknownHttpEndpointError`        | `'http-unknown'`                                   | `status: number`, `body: unknown`, `response: ResponseMeta`       |
| `RequestValidationEndpointError`  | `'request-validation'`                             | `issues`, `response: null`                                        |
| `ResponseValidationEndpointError` | `'response-validation'`                            | `status`, `issues`, `body`, `response: ResponseMeta`              |
| `TransportEndpointError`          | `'network' \| 'timeout' \| 'aborted' \| 'config'`  | `response: null`                                                  |
| `EndpointErrorOf<E>`              | all                                                | The union of the five above for error schema record `E`           |

`InferErrorSchemaOutput<E>` is the union of the output types of every entry of an `ErrorSchemaRecord`.

## Guards

```ts
function isEndpointError(error: unknown): error is EndpointError

function isHttpError<
  E extends ErrorSchemaRecord = ErrorSchemaRecord,
  S extends keyof E & number = keyof E & number,
>(error: unknown, status?: S): error is HttpEndpointError<E> & { status: S }
```

`isHttpError` is true for kind `http` only. With a `status` it also checks the status; pass the error schema record as `E` to type `body`:

```ts
// getUser declared with errorSchema: { 404: notFoundSchema }
if (isHttpError<typeof getUser.config.errorSchema, 404>(error, 404)) {
  error.body // output of notFoundSchema
}
```

## Response helpers

All three accept `null`, so they can be called on `result.response` or `error.response` without a check.

| Function          | Signature                                                    | Description                                                                 |
| ----------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `getHeader`       | `(meta: ResponseMeta \| null, name: string) => string \| null` | One header value                                                          |
| `getCookie`       | `(meta: ResponseMeta \| null, name: string) => string \| null` | One cookie value from the `Set-Cookie` headers                            |
| `getRetryAfterMs` | `(meta: ResponseMeta \| null) => number \| null`             | `Retry-After` in milliseconds, from either its seconds or its date form     |

## Schema types

| Type                   | Description                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------- |
| `Schema<Input, Output>` | Any Standard Schema v1: an object with a `'~standard'` property                        |
| `SchemaProps<Input, Output>` | The `'~standard'` property: `version`, `vendor`, `validate`, optional `types`     |
| `SchemaResult<Output>` | What `validate` returns: `{ value }` or `{ issues }`                                    |
| `SchemaIssue`          | `{ message: string; path?: readonly (PropertyKey \| { key: PropertyKey })[] }`          |
| `InferSchemaInput<S>`  | The type a schema accepts                                                               |
| `InferSchemaOutput<S>` | The type a schema produces                                                              |

See [Schemas](/docs/builder/essentials/schemas).

## Type helpers

Applied to an endpoint (`typeof getUser`):

| Type                    | Resolves to                                             |
| ----------------------- | ------------------------------------------------------- |
| `EndpointParams<T>`     | The `args` type of the endpoint                         |
| `EndpointResult<T>`     | The data the endpoint resolves to                       |
| `EndpointErrorType<T>`  | The typed error of the endpoint                         |
| `EndpointConfig<T>`     | The type of `endpoint.config`                           |

Applied to an options type (`typeof getUser.config`):

| Type                               | Resolves to                                                          |
| ---------------------------------- | -------------------------------------------------------------------- |
| `InferEndpointReturn<Options>`     | The resolved data, from `response`, `responses` or `responseSchema`  |
| `InferEndpointError<Options>`      | `EndpointErrorOf` of the options' `errorSchema`                      |
| `InferEndpointSafeResult<Options>` | What `safe()` resolves to                                            |
| `InferSuccessOutput<R>`            | Union of what each status of a `responses` record resolves to        |
| `InferSuccessInput<R>`             | The same with schema input types, used when `validateResponse` is `false` |

URL template and utility types:

| Type                        | Description                                                              |
| --------------------------- | ------------------------------------------------------------------------ |
| `ParsePathParams<Url>`      | Union of the parameter names in a URL template                           |
| `UrlHasParams<Url>`         | `true` when the template has parameters                                  |
| `UrlParams<Url, IsServer?>` | Object type of the parameters: `string \| number` values, `string` when `IsServer` is `true` |
| `Simplify<T>`               | Flattens an intersection for readable hovers                             |
| `HasProperty<T, K>`         | `true` when `K` is a key of `T` that is not `undefined`                  |
| `SafeGet<T, K>`             | `T[K]`, or `never` when `K` is not a key                                 |

## Client types

```ts
interface Client {
  request: <T = unknown>(config: AbstractRequestConfig) => Promise<AbstractResponse<T>>
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'
```

| `AbstractRequestConfig` field | Type                                                                  | Description                                          |
| ----------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------- |
| `url`                         | `string`                                                              | URL with parameters already bound                    |
| `method`                      | `HttpMethod`                                                          | HTTP method                                          |
| `params`                      | `Record<string, unknown> \| URLSearchParams`                          | Query parameters                                     |
| `data`                        | `unknown`                                                             | Request body                                         |
| `headers`                     | `Record<string, string>`                                              | Request headers                                      |
| `signal`                      | `AbortSignal \| null`                                                 | Cancellation signal                                  |
| `timeout`                     | `number`                                                              | Milliseconds                                         |
| `responseType`                | `'json' \| 'text' \| 'blob' \| 'arrayBuffer' \| 'formData' \| 'stream'` | Set for `response: 'blob' \| 'text' \| 'stream'`; absent for JSON |
| `[key: string]`               | `unknown`                                                             | Keys from the endpoint's `clientOptions`             |

| `AbstractResponse<T>` field | Type                                  |
| --------------------------- | ------------------------------------- |
| `data`                      | `T`                                   |
| `status`                    | `number`                              |
| `statusText`                | `string`                              |
| `headers`                   | `Record<string, string> \| Headers`   |

[HTTP client](/docs/builder/essentials/http-client) describes the contract a client must follow.

## Low-level exports

The pieces `declareEndpoint` is made of. They are exported for building integrations on top of Builder, such as a framework adapter or a code generator. Application code does not need them.

| Export                    | Signature                                                             | Description                                                                              |
| ------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `createHandler`           | `(options: BaseEndpointOptions, context: BuilderContext) => handler`  | Builds the endpoint function, with `safe` and `config`, for one declaration. Loosely typed: `declareEndpoint` adds the inference |
| `assertValidDeclaration`  | `(options: BaseEndpointOptions) => void`                              | The declaration-time check of `urlParamsSchema` against the URL; throws `NaviosError`    |
| `getUrlParamNames`        | `(url: string) => string[]`                                           | Parameter names of a URL template, in order of first appearance                          |
| `bindUrlParams`           | `(url, params: UrlParamsRequest, urlParamsSchema?: Schema) => url`    | Replaces `$name` placeholders with URL-encoded values. Throws when one is missing or empty |
| `makeConfig`              | `(request: ConfigRequest, options, finalUrl: string) => AbstractRequestConfig` | Builds the config handed to the client: merges headers, timeout and `clientOptions` |
| `makeFormData`            | `(request: ConfigRequest, options) => FormData`                       | The `body: 'multipart'` conversion                                                       |
| `validate`                | `(schema: Schema, value: unknown) => Promise<ValidationOutcome>`      | Runs any Standard Schema. Never rejects                                                  |
| `parseSync`               | `(schema: Schema \| undefined, value: unknown) => unknown`            | Synchronous validation that throws; rejects asynchronous schemas                         |
| `toResponseMeta`          | `(response) => ResponseMeta`                                          | Normalizes a client response; header records become a `Headers` instance                 |
| `classifyTransportFailure` | `(error: unknown, signal: AbortSignal \| null \| undefined) => 'timeout' \| 'aborted' \| 'network'` | Classifies a rejection that carries no response. `signal` is the call's signal and must be passed, even as `undefined` |

`bindUrlParams`, `makeConfig` and `makeFormData` validate with `parseSync` when given a schema, so a failure is not an `EndpointError`: a schema with a `parse` method, such as a Zod schema, throws its own error, and any other schema's issues are thrown as a `NaviosError`. A missing or empty URL parameter throws a plain `Error`.

| Type                 | Description                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------- |
| `BuilderContext`     | `{ getClient: () => Client; config: BuilderConfig }`, the second argument of `createHandler` |
| `HandlerRequest`     | Call arguments as the runtime sees them: `urlParams`, `params`, `data`, `signal`, `headers`, `timeout` |
| `HandlerCallOptions` | `{ client?: Client }`                                                                    |
| `ConfigRequest`      | The request shape `makeConfig` and `makeFormData` accept                                 |
| `UrlParamsRequest`   | `{ urlParams?: Record<string, unknown> }`                                                |
| `ValidationOutcome`  | `{ ok: true; value }` or `{ ok: false; issues; cause }`                                  |

```ts
import { createHandler } from '@navios/builder'

// userSchema from the Quick start; client is any Client
const getUser = createHandler(
  { method: 'GET', url: '/users/$userId', responseSchema: userSchema },
  { getClient: () => client, config: {} },
)

const res = await getUser.safe({ urlParams: { userId: '42' } })
```

## Socket entry point

Exports of `@navios/builder/socket`. Guide: [WebSocket](/docs/builder/realtime/websocket).

```ts
function socketBuilder(config?: SocketBuilderConfig): SocketBuilderInstance
```

| `SocketBuilderConfig` field | Type                           | Default                 | Description                                              |
| --------------------------- | ------------------------------ | ----------------------- | -------------------------------------------------------- |
| `formatMessage`             | `MessageFormatter`             | `defaultFormatMessage`  | Builds the outgoing wire message                         |
| `parseMessage`              | `MessageParser`                | `defaultParseMessage`   | Reads an incoming wire message; `null` ignores it        |
| `onError`                   | `(error: SocketError) => void` | —                       | Called once per failure                                  |
| `ackTimeout`                | `number`                       | `30000`                 | Milliseconds to wait for an acknowledgement              |

| `SocketBuilderInstance` member | Signature                                         | Description                                          |
| ------------------------------ | ------------------------------------------------- | ---------------------------------------------------- |
| `provideClient`                | `(client: SocketClient) => void`                  | Sets or replaces the connection                      |
| `getClient`                    | `() => SocketClient`                              | Returns it; throws `NaviosError` when none was provided |
| `defineSend`                   | `(options: SendOptions) => SendHandler<Options>`  | Declares an outgoing topic                           |
| `defineSubscribe`              | `(options: SubscribeOptions) => SubscribeHandler<Options>` | Declares an incoming topic                  |

| Option          | On                              | Type     | Description                                                              |
| --------------- | ------------------------------- | -------- | ------------------------------------------------------------------------ |
| `topic`         | `SendOptions`, `SubscribeOptions` | `string` | Topic name                                                             |
| `payloadSchema` | `SendOptions`, `SubscribeOptions` | `Schema` | Validates the outgoing or incoming payload                             |
| `ackSchema`     | `SendOptions`                   | `Schema` | Makes the send return a promise of the validated acknowledgement         |
| `ackTimeout`    | `SendOptions`                   | `number` | Overrides the builder's `ackTimeout` for this topic                      |

```ts
type SendHandler<Options> = ((payload: InferSendPayload<Options>) => InferSendReturn<Options>) & { config: Options }

type SubscribeHandler<Options> = ((
  handler: (payload: InferSubscribePayload<Options>) => void,
) => Unsubscribe) & { config: Options }
```

### Native WebSocket exports

```ts
function declareWebSocket(options: DeclareWebSocketOptions): WebSocketHandler<Options>

function createWebSocketHandler(config?: CreateWebSocketHandlerConfig): typeof declareWebSocket
```

| `DeclareWebSocketOptions` field | Type       | Description                                             |
| ------------------------------- | ---------- | ------------------------------------------------------- |
| `url`                           | `string`   | URL template with `$name` parameters                    |
| `urlParamsSchema`               | `Schema`   | Validates `urlParams`; must be synchronous              |
| `querySchema`                   | `Schema`   | Validates `params`; must be synchronous                 |
| `protocols`                     | `string[]` | WebSocket sub-protocols                                 |

`CreateWebSocketHandlerConfig` is `{ baseUrl?: string; onError?: (error: SocketError) => void }`.

A `WebSocketHandler<Options>` is called with `InferWebSocketConnectParams<Options>` (`urlParams` and `params`, as declared) and returns a `WebSocketSocketHandle`. The argument is always required: pass `{}` when the declaration has no parameters.

| Member                         | Description                                                                  |
| ------------------------------ | ---------------------------------------------------------------------------- |
| `emit(event, ...args)`         | Sends `[event, ...args]` as JSON. A trailing function receives the acknowledgement |
| `sendRaw(topic, message)`      | Sends `message` as JSON without an envelope                                  |
| `on(event, handler)`           | Listens to a connection event or, for any other name, a topic                |
| `off(event, handler?)`         | Removes one listener, or all listeners of the name                           |
| `onTopic(topic, handler)`      | Listens to a topic whatever its name; returns an unsubscribe function        |
| `disconnect(code?, reason?)`, `close(code?, reason?)` | Close the connection; `code` defaults to `1000`       |
| `url`, `connected`, `state`, `socket` | Full URL, open flag, `WebSocketHandleState` and the underlying `WebSocket` |

### Socket errors and types

```ts
class SocketError extends NaviosError {
  constructor(init: SocketErrorInit)
}

function isSocketError(error: unknown): error is SocketError
```

| `SocketError` field | Type                                    | Description                                    |
| ------------------- | --------------------------------------- | ---------------------------------------------- |
| `kind`              | `SocketErrorKind`                       | `'validation' \| 'ack-timeout' \| 'transport'` |
| `topic`             | `string`                                | Topic the failure belongs to                   |
| `url`               | `string \| undefined`                   | Connection URL, when the client exposes one    |
| `issues`            | `readonly SchemaIssue[] \| undefined`   | Validation issues                              |
| `rawData`           | `unknown`                               | The value that failed validation               |
| `cause`             | `unknown`                               | The schema library's error or the thrown value |
| `toJSON()`          | `() => object`                          | Plain object without `cause`                   |

| Export                        | Description                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| `SocketClient`                | Interface a connection must satisfy: `emit`, `on`, `off`; optional `sendRaw`, `url`, `connected`, `disconnect`, `close` |
| `isSocketClient(value)`       | Type guard for `SocketClient`                                                        |
| `MessageFormatter`            | `(topic: string, payload: unknown, ackId?: string) => unknown`                       |
| `MessageParser`               | `(data: unknown) => { topic: string; payload: unknown; ackId?: string } \| null`     |
| `defaultFormatMessage`        | The default formatter: `[topic, payload]` or `[topic, payload, ackId]`               |
| `defaultParseMessage`         | The default parser for the same array format                                         |
| `Unsubscribe`                 | `() => void`                                                                         |
| `InferSendPayload<Options>`   | Input type of `payloadSchema`, or `unknown`                                          |
| `InferSendReturn<Options>`    | `Promise` of the `ackSchema` output, or `void`                                       |
| `InferSubscribePayload<Options>` | Output type of `payloadSchema`, or `unknown`                                      |
| `SocketErrorInit`             | Constructor argument of `SocketError`                                                |
| `createSendHandler`, `createSubscribeHandler`, `createGlobalMessageHandler` | The functions behind `defineSend`, `defineSubscribe` and message routing. They take the builder's internal context, so use them only when writing your own builder |

## EventSource entry point

Exports of `@navios/builder/eventsource`. Guide: [Server-Sent Events](/docs/builder/realtime/server-sent-events).

```ts
function eventSourceBuilder(config?: EventSourceBuilderConfig): EventSourceBuilderInstance

function declareEventSource(options: DeclareEventSourceOptions): EventSourceHandler<Options>

function createEventSourceHandler(config?: CreateEventSourceHandlerConfig): typeof declareEventSource
```

`EventSourceBuilderConfig` is `{ onError?: (error: EventSourceError) => void }`. `CreateEventSourceHandlerConfig` is `{ baseUrl?: string; onError?: (error: EventSourceError) => void }`.

| `EventSourceBuilderInstance` member | Signature                                       | Description                                                     |
| ----------------------------------- | ----------------------------------------------- | --------------------------------------------------------------- |
| `provideClient`                     | `(client: EventSourceClient) => void`           | Sets the connection; closes the previous one                    |
| `getClient`                         | `() => EventSourceClient`                       | Returns it; throws `NaviosError` when none was provided         |
| `defineEvent`                       | `(options: EventOptions) => EventHandler<Options>` | Declares an event                                            |

| Option            | On                          | Type      | Description                                   |
| ----------------- | --------------------------- | --------- | --------------------------------------------- |
| `eventName`       | `EventOptions`              | `string`  | Name of the server-sent event                 |
| `payloadSchema`   | `EventOptions`              | `Schema`  | Validates the event's data                    |
| `url`             | `DeclareEventSourceOptions` | `string`  | URL template with `$name` parameters          |
| `urlParamsSchema` | `DeclareEventSourceOptions` | `Schema`  | Validates `urlParams`; must be synchronous    |
| `querySchema`     | `DeclareEventSourceOptions` | `Schema`  | Validates `params`; must be synchronous       |
| `withCredentials` | `DeclareEventSourceOptions` | `boolean` | Send cookies with the request                 |

```ts
type EventHandler<Options> = ((
  handler: (payload: InferEventPayload<Options>) => void,
) => EventUnsubscribe) & { config: Options }
```

An `EventSourceHandler<Options>` is called with `InferEventSourceConnectParams<Options>`, or with nothing when the declaration has no parameters, and returns an `EventSourceHandle`. Its members are listed on the [Server-Sent Events](/docs/builder/realtime/server-sent-events) page.

### EventSource errors and types

```ts
class EventSourceError extends NaviosError {
  constructor(init: EventSourceErrorInit)
}

function isEventSourceError(error: unknown): error is EventSourceError
```

| `EventSourceError` field | Type                                  | Description                                    |
| ------------------------ | ------------------------------------- | ---------------------------------------------- |
| `kind`                   | `EventSourceErrorKind`                | `'validation' \| 'transport'`                  |
| `eventName`              | `string`                              | Event the failure belongs to                   |
| `url`                    | `string \| undefined`                 | Connection URL, when the client exposes one    |
| `issues`                 | `readonly SchemaIssue[] \| undefined` | Validation issues                              |
| `rawData`                | `unknown`                             | The event data that failed validation          |
| `cause`                  | `unknown`                             | The schema library's error or the thrown value |
| `toJSON()`               | `() => object`                        | Plain object without `cause`                   |

| Export                      | Description                                                                      |
| --------------------------- | -------------------------------------------------------------------------------- |
| `EventSourceClient`         | Interface a connection must satisfy: `on`, `off`, `close`, `connected`; optional `url` |
| `isEventSourceClient(value)` | Type guard for `EventSourceClient`                                              |
| `EventSourceHandleState`    | `'connecting' \| 'open' \| 'closed'`                                             |
| `EventUnsubscribe`          | `() => void`                                                                     |
| `InferEventPayload<Options>` | Output type of `payloadSchema`, or `unknown`                                    |
| `EventSourceErrorInit`      | Constructor argument of `EventSourceError`                                       |
