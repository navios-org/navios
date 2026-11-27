# Changelog

## [2.0.0-alpha.1] - Unreleased

### Added

- **Shared error schemas**: `builder({ errorSchema: { 401: apiError, 500: apiError } })` gives every endpoint of the builder those entries, merged under its own `errorSchema` (an endpoint's entry wins for a status both declare). Replies with those statuses are typed `http` errors everywhere instead of `http-unknown`. `endpoint.config.errorSchema` is the merged record and `api.errorSchema` the builder's. `BuilderInstance` and `BuilderConfig` take the record as a type parameter, `{}` by default. New types: `WithBuilderErrors`, `MergeErrorSchemas`.
- **`@navios/builder/mock`**: `createMockClient({ fallback?, delay? })`, a `Client` that answers per endpoint. `mocks.on(endpoint, handler)` and `mocks.once(...)` register typed handlers that receive the call's arguments and return the body (the schema's input) or `respond(status, body?, { headers? })`; what they return is validated like a real response. Targets are endpoint handlers or anything with an `endpoint` (react-query objects). `wrap(client)` puts the mocks in front of a real client, `calls(endpoint?)` lists what they answered, `off`, `has` and `reset` manage them. For tests, and for building a UI before its backend exists.
- **Socket.IO in `socketBuilder`**: `socketBuilder({ topics: 'events' })` emits each topic as its own event (`emit(topic, payload)`), listens per topic while it has subscribers, and waits for acknowledgements as the callback argument of `emit`. `formatMessage` and `parseMessage` run around the payload; `parseMessage` also decodes acknowledgements. A Socket.IO client is passed to `provideClient` as it is. New type: `SocketTopicTransport`.
- **`parseMessage(data, event)`**: the parser also receives the event the data arrived with: `'message'` by default, the topic with `topics: 'events'`.
- **Request context in `onError`**: `onError(error, { request })` receives the request config that was sent (bound URL, query, body, headers), or `null` when the call failed before one was built. It is not on the `EndpointError`, so `toJSON()` stays free of credentials. New type: `EndpointErrorContext`.
- **Call context for clients**: `client.request(config, { endpoint, args })` receives the calling endpoint's declaration and the call's arguments as a second argument, which clients that only send requests ignore. New type: `ClientRequestContext`.
- **`getFilename(response)`**: the file name of `Content-Disposition`, with `filename*` (RFC 6266 / 8187, any charset) preferred over `filename`, unquoted and without directory parts. Accepts a `ResponseMeta`, a `{ headers }` record such as react-query's `withResponse` response, or the raw value. New type: `HeaderSource`.

### Changed

- **Breaking: `baseUrl` of `createWebSocketHandler` and `createEventSourceHandler` is `baseURL`**, as in `@navios/http`. It is joined with the `url` by exactly one slash, whatever slashes either has, and a `url` with a scheme of its own is used as it is; they used to be concatenated.
- **Breaking: connecting with invalid arguments throws a `ConnectionError`** (`/socket`, `/eventsource`), a `NaviosError` with the kinds an HTTP call has for the same mistakes: `request-validation` when `urlParamsSchema` or `querySchema` rejects them (`issues` with `part`, the schema library's error as `cause`), `config` for a URL parameter that is missing or cannot be part of a URL, an asynchronous schema, and a runtime without the `WebSocket` / `EventSource` class. They threw a `ZodError`, a plain `Error` or a bare `NaviosError`. New exports: `ConnectionError`, `isConnectionError`, and the types `ConnectionErrorInit`, `ConnectionErrorKind`, `ConnectionIssue`, `ConnectionPart`.
- **`AbstractRequestConfig` matches axios**: `responseType` is `'json' | 'text' | 'blob' | 'stream'`, the values the builder sets, and `signal` is `AbortSignal` (a `null` call signal is left out). An axios instance is now a `Client` without `as unknown as Client`. A client that typed its config parameter with `'arrayBuffer'` / `'formData'` or a `null` signal still fits.

### Removed

- **Breaking: `isSocketClient` and `isEventSourceClient`** (`/socket`, `/eventsource`), and `connected` on the `SocketClient` and `EventSourceClient` interfaces: the builders never read it. The handles of `declareWebSocket` and `declareEventSource` still have `connected`.
- **Breaking: the type parameters of `DeclareWebSocketOptions`, `DeclareEventSourceOptions`, `SendOptions`, `SubscribeOptions` and `EventOptions`.** The declare and define functions infer their options as they did; write the type without arguments. `InferWebSocketConnectParams` and `InferEventSourceConnectParams` are the `urlParams` and `params` of `ClientRequestArgs`, so a connection and an HTTP endpoint with the same URL and schemas take the same parameters.

### Fixed

- **`eventSourceBuilder` stops listening to an event whose last handler unsubscribed.** The listener stayed on the client, and `provideClient` attached one to the next client too, for every event that ever had a handler.
- **Object query values of `declareWebSocket` and `declareEventSource`** are written as JSON (or what their `toJSON` returns), as a multipart field is, instead of `[object Object]`.

## [2.0.0-alpha.0] - 2026-11-26

2.0 reworks how endpoints are declared, called and how they fail. There is one way to declare an endpoint, two ways to call it, and one error type.

### Added

- **`endpoint.safe(args)`**: the non-throwing twin of every endpoint. Resolves to a `SafeResult` — `{ ok: true, data, error: null, response }` or `{ ok: false, data: null, error, response }` — and never rejects, including for invalid input and a missing client.
- **`EndpointError`**: the single error type for a failed call (`extends NaviosError`). Thrown by `endpoint(args)`, returned by `endpoint.safe(args)` and passed to `onError`. Fields: `kind`, `endpoint`, `status`, `body`, `response`, `issues`, `cause`, plus `toJSON()`.
- **Error kinds**: `http`, `http-unknown`, `request-validation`, `response-validation`, `network`, `timeout`, `aborted`, `config`.
- **Typed errors**: `EndpointErrorOf<ErrorSchema>` and `EndpointErrorType<typeof endpoint>`. Narrowing on `error.kind === 'http'` and `error.status` narrows `error.body` to the matching `errorSchema` entry.
- **Guards**: `isEndpointError(error)` and `isHttpError(error, status?)`.
- **`response` option** on `declareEndpoint`: `'json'` (default), `'blob'`, `'text'`, `'stream'` (`ReadableStream<Uint8Array>`) and `'void'` (resolves `undefined`, for 204). `responseSchema` is required only for `'json'` endpoints that do not declare `responses`.
- **`body` option** on `declareEndpoint`: `'json'` (default) or `'multipart'` (converts `data` to `FormData`).
- **Endpoint `headers` and `timeout` options**, and a per-call `timeout` argument. Per-call values win over the endpoint's.
- **Per-call client**: `endpoint(args, { client })` uses that HTTP client for one call.
- **`builder({ send })`**: `'input'` (the default) sends the arguments of a call as they were passed, `'output'` sends what the schemas produced, as 1.x did. See Changed.
- **`builder({ client })`** and **`api.withClient(client)`**, which returns a new builder with the same configuration and a different client.
- **Optional arguments**: `endpoint()` can be called without arguments when nothing is required; `params` / `data` are optional when their schema has no required fields.
- **`ResponseMeta`** (`status`, `statusText`, `headers`) on every `SafeResult` and `EndpointError`, with the helpers `getHeader`, `getCookie` and `getRetryAfterMs`.
- **`validateResponse: false`** endpoint option to skip the runtime parse of the response while keeping the inferred type.
- **Standard Schema support**: every schema slot (`requestSchema`, `querySchema`, `urlParamsSchema`, `responseSchema`, `errorSchema`, `responses`) accepts any Standard Schema v1 implementation — Zod, Valibot, ArkType and others. Libraries can be mixed per slot and asynchronous validation is supported. An asynchronous check of an endpoint runs once per call; the socket and EventSource builders check the first message twice when a Zod 3 schema or a transform of Zod Mini turns out to be asynchronous. A Zod schema that holds a function of the user (`refine`, `transform`, `codec` and so on) does not use Zod's compiled code, and takes several times as long for large data. New exports: `Schema`, `SchemaIssue`, `InferSchemaInput`, `InferSchemaOutput`. `EndpointError.issues` is `readonly EndpointIssue[]`, plain objects `{ message, path?, part? }` without the validated value; `part` names the part of the arguments for `request-validation`, which lists the problems of all of them. `error.cause` is what the library reported: the `ZodError` of a Zod schema, the issues of any other. The declaration-time `urlParamsSchema` check runs for schemas that expose `.shape` (Zod objects).
- **`zod` is no longer a peer dependency.** The builder does not import Zod, at runtime or in its types. The Zod-narrowed option types `ZodBaseEndpointOptions`, `ZodEndpointOptions` and `ZodSchemaSlots` are removed.
- **`responses` option** on `declareEndpoint`: per-status success schemas, e.g. `{ 200: userSchema, 201: createdSchema, 204: null }`, in place of `responseSchema`. The result type is the union of every entry (`null` → `undefined`); a 2xx status that is not listed is reported as `response-validation`. New types: `SuccessSchemaRecord`, `InferSuccessOutput`.
- **`getUrlParamNames(url)`** helper, the definition of the URL parameter grammar.
- **New type exports**: `SafeResult`, `SafeResultOk`, `SafeResultErr`, `ResponseMeta`, `EndpointErrorKind`, `EndpointErrorOf`, `EndpointIssue`, `RequestPart`, `EndpointErrorType`, `EndpointParams`, `EndpointResult`, `EndpointConfig`, `InferEndpointError`, `InferEndpointSafeResult`, `EndpointCallOptions`, `EndpointBodyKind`, `EndpointResponseKind`, `RequireResponseSchema`, `ClientRequestArgs`, `ServerRequestArgs`.
- **`SocketError`** (`@navios/builder/socket`) and **`EventSourceError`** (`@navios/builder/eventsource`): the error types of the socket and EventSource builders, both `extends NaviosError`. `SocketError` has `kind` (`'validation' | 'ack-timeout' | 'transport'`), `topic`, `url?`, `issues?`, `rawData?`, `cause` and `toJSON()`; `EventSourceError` has `kind` (`'validation' | 'transport'`), `eventName`, `url?`, `issues?`, `rawData?`, `cause` and `toJSON()`. Each entry point also exports its guard (`isSocketError`, `isEventSourceError`) and the `SocketErrorKind` / `SocketErrorInit` / `EventSourceErrorKind` / `EventSourceErrorInit` types.
- **Standard Schema support in the socket and EventSource builders**: `payloadSchema`, `ackSchema`, `urlParamsSchema` and `querySchema` accept any Standard Schema v1 implementation. Asynchronous schemas are awaited for incoming messages and events, for acknowledgements and for the payload of a send that has an `ackSchema`. A send without `ackSchema` and the `declareWebSocket` / `declareEventSource` connection parameters are synchronous and reject an asynchronous schema.
- **`createWebSocketHandler({ WebSocket })`** and **`createEventSourceHandler({ EventSource })`**: the class connections are opened with, for runtimes without a global one or to send headers. A `WebSocket` class may keep messages until it is open (`reconnecting-websocket`): only the standard class refuses to send while it is not.
- **`provideClient(client, { closePrevious })`** on the socket and EventSource builders closes the client that is replaced.
- **`url`** on the handles returned by `declareWebSocket` and `declareEventSource`, and an optional `url` on the `SocketClient` / `EventSourceClient` interfaces; when a client has one it is copied to the error's `url`.

### Changed

- **The arguments of a call are sent as they were passed.** 1.x sent the output of `urlParamsSchema`, `querySchema` and `requestSchema`; a server that parses the request with the same schemas then applied every transform twice. Arguments are still validated, but defaults, transforms and the removal of unknown keys no longer run before sending. `builder({ send: 'output' })` restores that for APIs that do not share the schemas. A URL parameter that is left out is still sent as the default of `urlParamsSchema`. Responses are not affected.
- **`data` and `params` are optional whenever their schema accepts an empty object or `undefined`**, in the types and at runtime.
- **`validateResponse: false` types the result as the schema's input**, because transforms and defaults are not applied.
- **Multipart bodies**: `Blob` values are sent as binary parts, a `FormData` instance is sent as it is, and `undefined` fields are left out.
- **JSON bodies of any type are sent**: a string is encoded as JSON, and `0`, `false` and `null` are sent with a JSON content type.
- **An empty-string URL parameter counts as missing** instead of producing a shorter path. A `Date` is written as an ISO string; an object, an array or `NaN` is refused with a `config` error.
- **Header names are merged without regard to case** across `clientOptions.headers`, the endpoint's `headers` and the call's.
- **`safe()` never rejects**, including for header bags `Headers` refuses, a client that resolves with nothing, and `null` args. Array-valued headers such as `set-cookie` keep every value, and the headers of any `Headers` implementation are read.
- **A body the client cannot serialize** (a `BigInt` or a circular object in JSON) is a `config` error.
- **Socket and EventSource**: acks resolve with custom wire formats, a throwing `emit` is a `SocketError` of kind `transport`, query strings serialize dates and arrays correctly, and server topics can no longer trigger lifecycle listeners.
- **EventSource payloads** are validated as decoded from JSON. A number, a boolean or `null` that fails is tried as the text that arrived, so plain-text events like `42` reach a `z.string()` schema.
- **`open` and `error` of an EventSource handle** are server events in `on()` and `defineEvent`, and connection events in `onOpen` and `onError`. Neither triggers the other.
- **`querySchema` of `declareWebSocket` and `declareEventSource`** is applied when `params` is left out, so its defaults are sent and its required fields are required. Both handlers are called without arguments when nothing is required.
- **A send with an `ackSchema` rejects** for every failure; it never throws. Pending acknowledgements are rejected when the connection closes. `ackTimeout: Infinity` waits without limit.
- **`provideClient`** of the socket and EventSource builders ignores the client it already has, and `eventSourceBuilder` no longer closes the previous one by default. `socketBuilder` accepts subscriptions before there is a client.
- **Listeners may subscribe and unsubscribe while a message is delivered.** One that is added waits for the next message instead of being called at once, which looped forever for a listener that resubscribed itself.
- **A throwing `parseMessage`** is reported to `onError` and skips the message.

- **Unknown endpoint options are compile errors.** `declareEndpoint` rejects keys it does not know, so a typo such as `requstSchema` or a removed option such as `result` no longer passes silently.
- **Contradicting endpoint options are compile errors**, and throw when the endpoint is declared: `responses` with `responseSchema`, `responseSchema` or `responses` with a non-JSON `response`, and a body on `GET` or `HEAD`.

- **Every failure of `endpoint(args)` is an `EndpointError`.** HTTP errors are no longer the HTTP client's own error, and invalid input is no longer a raw `ZodError` — it is an `EndpointError` of kind `request-validation`, and nothing is sent.
- **`errorSchema` applies to every call.** A non-2xx response whose status has an entry is parsed and reported as kind `http` with a typed `body`; without an entry it is `http-unknown` with the raw body. `body` is exactly the schema output — nothing is added to it.
- **`onError(error: unknown)`** → **`onError(error: EndpointError)`**. The hook is called once per failed call with the same instance the caller receives. An exception thrown inside it is caught and logged.
- **The builder decides what is an error.** A client may resolve or reject on a non-2xx response; any status outside 200–299 is an error. A rejection carrying `response` is treated as an HTTP error; one without it is `network`, `timeout` or `aborted`. A thin `fetch` wrapper is a valid client.
- **URL parameter grammar**: a parameter is `$` followed by a letter or underscore, then letters, digits or underscores — the same rule in the types and at runtime. `/users/$user_id`, `/files/$id.json` and `/carts/$id:checkout` are parsed as `user_id`, `id` and `id`.
- **`urlParamsSchema` keys must equal the URL's parameter names**; a mismatch throws a `NaviosError` when the endpoint is declared.
- **`clientOptions`** carries client-specific keys only (for example `withCredentials`). It is merged into the request config and cannot override `method`, `url`, `params`, `data`, `signal`, `timeout` or `responseType`, nor any header set through the endpoint's `headers` or the call. Use the endpoint's `headers` / `timeout` options for those.
- **`EndpointHandler<Options>`** is the only handler type; `endpoint.config` is the declared options object.
- **`RequestArgs<Url, QuerySchema, RequestSchema, UrlParamsSchema, IsServer>`** is split into `ClientRequestArgs<Options>` (`z.input`) and `ServerRequestArgs<Options>` (`z.output`).
- **`AbstractRequestConfig.data`** is `unknown` (was `any`); `timeout` and `responseType` are declared fields.
- **Socket and EventSource builders** use a single `onError` hook that receives a `SocketError` / `EventSourceError`. The hook is called once per failure; an exception thrown inside it is caught and logged.
- **Send handlers fail with a `SocketError`.** An invalid payload throws kind `validation` (was a raw `ZodError`) and nothing is sent; an invalid acknowledgement rejects with kind `validation`, a timeout with kind `ack-timeout`, and replacing the client while an acknowledgement is pending with kind `transport` (were a `ZodError` and plain `Error`s). The same instance is passed to `onError`, which now also fires for invalid send payloads and replaced clients. For a Zod schema the original `ZodError` is on `error.cause`. Their `issues` are plain objects `{ message, path? }`.
- **`error.topic` of an acknowledgement validation failure** is the topic of the send (was the internal `__navios_ack:<id>` topic).
- **`createWebSocketHandler({ onError })` and `createEventSourceHandler({ onError })`** receive a `SocketError` / `EventSourceError` of kind `transport` with the thrown value on `cause` (was the thrown value itself).

### Removed

- **`declareStream`** — use `declareEndpoint({ response: 'blob' })` (or `'text'` / `'stream'`).
- **`declareMultipart`** — use `declareEndpoint({ body: 'multipart' })`.
- **`useDiscriminatorResponse`** builder flag, the **`isErrorStatus`** / **`isErrorResponse`** guards, the **`__status`** field injected into parsed error bodies, the **`InferErrorSchemaOutputWithStatus`** type and the **`UnknownResponseError`** class — use `endpoint.safe()` and narrow on `error.kind` / `error.status`.
- **`onZodError`** builder callback — use `onError` and check `error.kind === 'request-validation'` / `'response-validation'` (`error.issues` holds the validation issues).
- **`handleError`** export.
- **Internals that were exported**: `createHandler`, `makeConfig`, `makeFormData`, `Simplify` and the types `HandlerRequest`, `ConfigRequest`, `UrlParamsRequest`; from `/socket` `createSendHandler`, `createSubscribeHandler`, `createGlobalMessageHandler`, `defaultFormatMessage` and `defaultParseMessage`. `bindUrlParams` stays.
- **Socket.IO**. A stock Socket.IO client never understood the frames of `socketBuilder`. Use `declareWebSocket`, or a client with the same methods.
- **Callbacks in `handle.emit(topic, payload, callback)`**: replies were matched by topic, so two sends got the same one. Use `defineSend` with an `ackSchema`.
- **`clientOptions.timeout`** — it is ignored; use the endpoint's `timeout`. (`clientOptions.headers` is still merged underneath the endpoint's `headers`, but `headers` is the place for them.) **`clientOptions.transformRequest` / `transformResponse`** are gone.
- **Types**: `BaseEndpointConfig`, `BaseStreamConfig`, `AnyEndpointConfig`, `AnyStreamConfig`, `StreamOptions`, `AbstractEndpoint`, `AbstractStream`, `StreamHandler`, `InferStreamReturn`, `InferEndpointParams`, `InferStreamParams`, `EndpointFunctionArgs`, `NaviosZodRequest`, `NaviosZodRequestBase`, `Util_FlatObject`, `RequestArgs`.
- **Socket `onValidationError` and `onAckTimeout`, EventSource `onValidationError` and the legacy `onError(error)`** — use `onError(error)` and filter on `error.kind`.

### Fixed

- **`response: 'void'` and `responses: { 204: null }` with `@navios/http`**: an empty body failed JSON parsing and surfaced as a `network` error. A `'void'` endpoint now asks the client for `responseType: 'text'`, and `@navios/http` resolves an empty JSON body as `undefined`.
- **`.` and `..` as URL parameter values are rejected**: `encodeURIComponent` leaves them alone, so `/users/$id/profile` with `id: '..'` requested `/profile`. `bindUrlParams` now throws, which an endpoint reports as a `config` error; `declareWebSocket` and `declareEventSource` throw as well.
- **Unparsable bodies keep their status**: a client rejection that carries a `response` with a 2xx status (HTML where JSON was expected) is reported as `response-validation` with `status`, `body` and `response`, not as `network`. With `@navios/http`, an error status with an empty or malformed JSON body is reported as `http-unknown` with its status.
- **Sending over a `declareWebSocket` handle that cannot send**: `emit` and `sendRaw` throw the `transport` `SocketError` they report to `onError` while the socket is not open; a closed `WebSocket` discards what it is asked to send without an error. A fire-and-forget send throws and a send with ack rejects at once instead of failing as `ack-timeout` after the full timeout.
- **JSDoc** no longer describes the builder as Zod-only.
- **Package metadata**: `sideEffects: false`, a `files` allowlist and the `navios-org/navios` repository URL.

### Migration

Uploads and downloads:

```diff
- const upload = api.declareMultipart({
+ const upload = api.declareEndpoint({
    method: 'POST',
    url: '/files',
+   body: 'multipart',
    requestSchema: z.object({ file: z.instanceof(File) }),
    responseSchema: z.object({ id: z.string() }),
  })

- const download = api.declareStream({
+ const download = api.declareEndpoint({
    method: 'GET',
    url: '/files/$fileId',
+   response: 'blob',
  })
```

Errors as values:

```diff
- const api = builder({ useDiscriminatorResponse: true })
+ const api = builder()
  const getUser = api.declareEndpoint({
    method: 'GET',
    url: '/users/$id',
    responseSchema: userSchema,
    errorSchema: { 404: notFoundSchema },
  })

- const result = await getUser({ urlParams: { id: '1' } })
- if (isErrorStatus(result, 404)) {
-   console.log(result.message)
- } else if (isErrorResponse(result)) {
-   console.log(result.__status)
- } else {
-   console.log(result.name)
- }
+ const res = await getUser.safe({ urlParams: { id: '1' } })
+ if (res.ok) {
+   console.log(res.data.name)
+ } else if (res.error.kind === 'http' && res.error.status === 404) {
+   console.log(res.error.body.message)
+ } else {
+   console.log(res.error.kind, res.error.status)
+ }
```

Errors as exceptions:

```diff
  try {
    await getUser({ urlParams: { id: '1' } })
  } catch (error) {
-   if (error instanceof ZodError) { ... }
-   else if (error.response?.status === 404) { ... }
+   if (!isEndpointError(error)) throw error
+   if (error.kind === 'request-validation') { ... }
+   else if (error.status === 404) { ... }
  }
```

Builder hooks:

```diff
  const api = builder({
-   onError: (error) => log(error),
-   onZodError: (zodError, response, originalError) => report(zodError),
+   onError: (error) => {
+     log(error.kind, error.endpoint, error.status)
+     if (error.kind === 'response-validation') report(error.issues)
+   },
  })
```

Endpoint headers and timeout:

```diff
  const createUser = api.declareEndpoint({
    method: 'POST',
    url: '/users',
    requestSchema: createUserSchema,
    responseSchema: userSchema,
-   clientOptions: {
-     timeout: 30000,
-     headers: { 'X-Custom-Header': 'value' },
-   },
+   timeout: 30000,
+   headers: { 'X-Custom-Header': 'value' },
  })
```

Client:

```diff
- const api = builder()
- api.provideClient(client)
+ const api = builder({ client })
```

`provideClient` still works for setting the client at start-up. For a per-request client, pass it to the call:

```diff
- api.provideClient(requestClient)
- const user = await getUser({ urlParams: { id: '1' } })
+ const user = await getUser({ urlParams: { id: '1' } }, { client: requestClient })
```

Socket and EventSource hooks:

```diff
- socketBuilder({
-   onValidationError: (err) => reportZod(err),
-   onAckTimeout: (topic) => reportTimeout(topic),
- })
+ socketBuilder({
+   onError: (error) => {
+     if (error.kind === 'validation') reportIssues(error.issues) // ZodError is on error.cause
+     if (error.kind === 'ack-timeout') reportTimeout(error.topic)
+   },
+ })
```

```diff
- eventSourceBuilder({
-   onValidationError: (err, eventName) => reportZod(err, eventName),
-   onError: (err) => reportHandlerFailure(err),
- })
+ eventSourceBuilder({
+   onError: (error) => {
+     if (error.kind === 'validation') reportIssues(error.issues, error.eventName)
+     if (error.kind === 'transport') reportHandlerFailure(error.cause)
+   },
+ })
```

Send handlers reject with a `SocketError`:

```diff
  try {
    await createRoom({ name })
  } catch (error) {
-   if (error instanceof ZodError) showInvalid(error.issues)
+   if (isSocketError(error) && error.kind === 'validation') showInvalid(error.issues)
+   if (isSocketError(error) && error.kind === 'ack-timeout') showTimeout()
  }
```

## [1.0.0] - 2026-01-08

### Fixed

- **FormData BigInt Serialization**: Fixed `bigint` value serialization in `makeFormData` to properly convert to string alongside `number` and `boolean` types

## [1.0.0-alpha.2] - 2026-01-07

### Changed

- **Server-Side Type Inference**: `RequestArgs` type now correctly uses `z.output` types for server-side handlers instead of `z.input`
  - Server handlers receive parsed/transformed values from Zod schemas
  - Client-side still uses `z.input` for raw input values
  - Affects `urlParams`, `params` (query), and `data` (body) parameters
- **RequestBase Exclusion for Server**: Server-side handlers no longer include `RequestBase` fields (like `signal`), as these are client-only concerns

## [1.0.0-alpha.1] - 2026-01-07

### Added

- **Error Schema Support**: New `errorSchema` option for endpoints that maps HTTP status codes to Zod schemas for type-safe error handling

  ```typescript
  const getUser = api.declareEndpoint({
    method: 'GET',
    url: '/users/$userId',
    responseSchema: userSchema,
    errorSchema: {
      400: z.object({ error: z.string(), field: z.string() }),
      404: z.object({ error: z.literal('Not Found') }),
    },
  })
  ```

- **Error Type Guards**: New helper functions `isErrorStatus()` and `isErrorResponse()` for type-safe error discrimination

  ```typescript
  import { isErrorResponse, isErrorStatus } from '@navios/builder'

  const result = await getUser({ urlParams: { userId: '1' } })
  if (isErrorStatus(result, 404)) {
    // result is typed as the 404 error schema
  }
  ```

- **UnknownResponseError**: New error class thrown when `useDiscriminatorResponse` is enabled and an error response status code doesn't match any key in `errorSchema`

- **URL Parameter Schema Validation**: New `urlParamsSchema` option for runtime validation of URL parameters with Zod

  ```typescript
  const getUser = api.declareEndpoint({
    method: 'GET',
    url: '/users/$userId',
    responseSchema: userSchema,
    urlParamsSchema: z.object({
      userId: z.string().uuid(), // Validates userId is a UUID
    }),
  })
  ```

- **Per-Endpoint Client Options**: New `clientOptions` option allows configuring timeout, headers, and transformation options per endpoint

  ```typescript
  const createUser = api.declareEndpoint({
    method: 'POST',
    url: '/users',
    responseSchema: userSchema,
    clientOptions: {
      timeout: 30000,
      headers: { 'X-Custom-Header': 'value' },
      transformRequest: { skipFields: ['rawData'] },
    },
  })
  ```

- **WebSocket Support**: New `@navios/builder/socket` export provides type-safe WebSocket/Socket.IO messaging with Zod schema validation

  ```typescript
  import { declareWebSocket, socketBuilder } from '@navios/builder/socket'
  import { io } from 'socket.io-client'
  import { z } from 'zod'

  const socket = socketBuilder()
  socket.provideClient(io('ws://localhost:3000'))

  const sendMessage = socket.defineSend({
    topic: 'chat.message',
    payloadSchema: z.object({ text: z.string() }),
  })

  const onMessage = socket.defineSubscribe({
    topic: 'chat.message',
    payloadSchema: z.object({ text: z.string(), from: z.string() }),
  })
  ```

- **Server-Sent Events (SSE) Support**: New `@navios/builder/eventsource` export provides type-safe SSE event handling with Zod schema validation

  ```typescript
  import { declareEventSource, eventSourceBuilder } from '@navios/builder/eventsource'
  import { z } from 'zod'

  const sse = eventSourceBuilder()
  const chatEvents = declareEventSource({
    url: '/events/$roomId',
    urlParamsSchema: z.object({ roomId: z.string() }),
  })

  const handle = chatEvents({ urlParams: { roomId: '123' } })
  sse.provideClient(handle)

  const onMessage = sse.defineEvent({
    eventName: 'message',
    payloadSchema: z.object({ text: z.string(), from: z.string() }),
  })
  ```

- **New Type Exports**:
  - `ErrorSchemaRecord` - Type for mapping status codes to Zod schemas
  - `InferErrorSchemaOutput<T>` - Infers union of error types
  - `InferErrorSchemaOutputWithStatus<T>` - Infers error types with `__status` property
  - `EndpointOptions` - Unified endpoint configuration type
  - `StreamOptions` - Unified stream configuration type
  - `ClientOptions` - Per-endpoint client configuration type

### Changed

- **Type System Refactoring**: Replaced 50+ method overloads with const generic pattern for cleaner type inference and better IDE support

- **Error Response Status Injection**: When `useDiscriminatorResponse` is enabled and `errorSchema` is defined, error responses now include a `__status` property containing the HTTP status code for runtime discrimination

- **FormData Serialization**: Enhanced `makeFormData` with support for `bigint` values and improved `toJSON()` handling

- **Request Configuration**: `makeConfig` now properly merges `clientOptions` into request config, with per-request options taking precedence

### Fixed

- **URL Parameter Binding**: Fixed edge cases in URL parameter binding with special characters

## [0.5.3] - 2026-01-02

### Added

- **POST/PUT/PATCH with Query Schema**: Added new `declareEndpoint` overload that supports `querySchema` for POST, PUT, and PATCH methods without requiring a `requestSchema`

### Changed

- **Request Type Flexibility**: Extended `NaviosZodRequest` and `EndpointFunctionArgs` to accept `ZodType` instead of only `ZodObject` for request schemas, enabling more flexible request body types

## [0.5.2] - 2025-12-21

### Changed

- **UrlParams Type Enhancement**: Added `IsServer` boolean type parameter to `UrlParams<Url, IsServer>`
  - Server-side: URL params are always `string`
  - Client-side: URL params can be `string | number`
  - Backward compatible - uses type inference when not explicitly provided

## [0.5.1] - 2025-12-20

### Fixed

- Fixed package.json exports to use correct CommonJS file extensions (`.cjs` and `.d.cts`)

### Changed

- Updated zod dev dependency from `^4.1.13` to `^4.2.1`

## [0.5.0] - 2025-12-18

### Changed

- **Removed `useWholeResponse` option**: This option was documented but never implemented. The README has been updated to reflect the actual behavior where endpoints return only the parsed response data, not the full response object.
- **Improved documentation**: Added comprehensive JSDoc comments to all public APIs including:
  - `builder` function and configuration options
  - `declareEndpoint`, `declareStream`, and `declareMultipart` methods
  - Error handling functions (`NaviosError`, `handleError`)
  - Request utilities (`bindUrlParams`, `makeConfig`, `makeFormData`)
  - Type definitions and interfaces

### Documentation

- Updated README examples to match actual API behavior
- Added detailed JSDoc comments for better IDE support and developer experience
- Clarified usage examples for discriminated unions and error handling

## [0.4.0] - 2025-12-13

### Breaking Changes

- **Renamed `NaviosException` to `NaviosError`**: The error class has been renamed for consistency with JavaScript naming conventions. A deprecated alias `NaviosException` is temporarily available for backward compatibility but will be removed in the next major version.

- **Renamed handler creator functions**: All handler creator functions have been renamed to use the `create*` prefix for consistency:
  - `endpointCreator` → `createEndpoint`
  - `streamCreator` → `createStream`
  - `multipartCreator` → `createMultipart`

- **Removed `utils` export path**: The `utils` module has been removed from the public API. Internal utilities are no longer directly exported.

- **Removed `exceptions` export path**: Replaced by the `errors` module.

### Added

- **New `errors` module**: Contains `NaviosError` and error handling utilities.

  ```typescript
  import { handleError, NaviosError } from '@navios/builder'
  ```

- **New `handlers` module**: Contains all handler creation functions with a unified API.

  ```typescript
  import { createEndpoint, createHandler, createMultipart, createStream } from '@navios/builder'
  ```

- **New `request` module**: Contains request-related utilities.

  ```typescript
  import { bindUrlParams, makeConfig } from '@navios/builder'
  ```

- **New `createHandler` generic function**: A unified handler creation function that powers all specific handlers (endpoint, stream, multipart). It supports custom request/response transformations via options.

### Changed

- **Reorganized type exports**: Types have been split into separate files for better maintainability:
  - `types/common.mts` - Core types (`HttpMethod`, `AbstractResponse`, `AbstractRequestConfig`, `Client`)
  - `types/config.mts` - Configuration types (`BuilderConfig`, `BuilderContext`, `BaseStreamConfig`, `BaseEndpointConfig`)
  - `types/request.mts` - Request-related types (`EndpointFunctionArgs`, `NaviosZodRequest`, `UrlParams`, etc.)
  - `types/builder-instance.mts` - `BuilderInstance` interface

- **Internal file structure**: The codebase has been reorganized for better separation of concerns:
  - `/errors` - Error classes and error handling
  - `/handlers` - Handler creation functions
  - `/request` - Request configuration utilities
  - `/types` - TypeScript type definitions

### Deprecated

- **`NaviosException`**: Use `NaviosError` instead. The alias will be removed in the next major version.

### Migration Guide

1. **Update error class imports**:

   ```typescript
   // Before
   import { NaviosException } from '@navios/builder'
   catch (error) {
     if (error instanceof NaviosException) { ... }
   }

   // After
   import { NaviosError } from '@navios/builder'
   catch (error) {
     if (error instanceof NaviosError) { ... }
   }
   ```

2. **Update handler creator imports** (if using directly):

   ```typescript
   // Before
   // After
   import {
     createEndpoint,
     createMultipart,
     createStream,
     endpointCreator,
     multipartCreator,
     streamCreator,
   } from '@navios/builder'
   ```

3. **Update utility imports** (if using directly):

   ```typescript
   // Before
   // After
   import { bindUrlParams, bindUrlParams, makeConfig, makeRequestConfig } from '@navios/builder'
   ```
