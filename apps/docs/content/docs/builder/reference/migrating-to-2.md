---
title: Migrating to 2.0
---

# Migrating to 2.0

This page lists what changed between 1.x and 2.0 of `@navios/builder` and `@navios/react-query`, as before and after, and what changed in [`@navios/http`](#navioshttp). Upgrade the packages together: `@navios/react-query` 2.0 is built on `@navios/builder` 2.0 and requires `@tanstack/react-query` `^5.102.0`.

The short version: there is one way to declare an endpoint, two ways to call it, and one error type. Most of the work is deleting code.

## @navios/builder

### One declareEndpoint

Uploads and downloads are options of `declareEndpoint`, not separate methods.

```diff
- const upload = API.declareMultipart({
+ const upload = API.declareEndpoint({
    method: 'POST',
    url: '/files',
+   body: 'multipart',
    requestSchema: z.object({ file: z.instanceof(File) }),
    responseSchema: z.object({ id: z.string() }),
  })

- const download = API.declareStream({
+ const download = API.declareEndpoint({
    method: 'GET',
    url: '/files/$fileId',
+   response: 'blob',
  })
```

`response` also accepts `'text'`, `'stream'` and `'void'`. See [File uploads](/docs/builder/guides/file-uploads) and [Downloads and streams](/docs/builder/guides/downloads-and-streams).

### The input is sent, not the output

1.x validated the arguments of a call and sent what the schemas made of them. 2.0 validates them and sends **what you passed**, because the server that parses the request with the same schemas would otherwise apply every transform twice.

Before the request leaves, your schemas no longer

- fill in **defaults**. A field you leave out is not sent. Only a URL parameter you leave out is still sent as the default of `urlParamsSchema`.
- remove **unknown keys**. An object with more keys than its schema is sent with all of them.
- run **transforms**, `trim()`, coercion and the like. The value goes out as you passed it.

A Navios server does all of this when it parses the request, so a shared contract needs no change. Code that calls another API and relies on one of the three does: check every `.default()`, `.transform()` and `z.coerce` in a `requestSchema`, `querySchema` or `urlParamsSchema`, and every call that passes an object with more keys than the API accepts. To keep the behavior of 1.x for such an API:

```diff
- const API = builder()
+ const API = builder({ client, send: 'output' })
```

[What is sent](/docs/builder/essentials/inputs#what-is-sent) describes both modes. Responses are unchanged: you receive the output of `responseSchema`.

### Errors are EndpointError

Every failed call now produces an `EndpointError`. HTTP errors are no longer the HTTP client's own error, and invalid input is no longer a raw `ZodError`. `errorSchema` applies to every call, and the parsed body is exactly the schema's output: the `__status` field is gone.

If you used `useDiscriminatorResponse` to receive errors as values, call `.safe()` instead:

```diff
- const API = builder({ useDiscriminatorResponse: true })
+ const API = builder({ client })

- const result = await getUser({ urlParams: { userId: '1' } })
- if (isErrorStatus(result, 404)) {
-   console.log(result.message)
- } else if (isErrorResponse(result)) {
-   console.log(result.__status)
- } else {
-   console.log(result.name)
- }
+ const res = await getUser.safe({ urlParams: { userId: '1' } })
+ if (res.ok) {
+   console.log(res.data.name)
+ } else if (res.error.kind === 'http' && res.error.status === 404) {
+   console.log(res.error.body.message)
+ } else {
+   console.log(res.error.kind, res.error.status)
+ }
```

If you caught exceptions, check for `EndpointError` first:

```diff
  try {
    await getUser({ urlParams: { userId: '1' } })
  } catch (error) {
-   if (error instanceof ZodError) { ... }
-   else if (error.response?.status === 404) { ... }
+   if (!isEndpointError(error)) throw error
+   if (error.kind === 'request-validation') { ... }
+   else if (error.status === 404) { ... }
  }
```

For a Zod schema the original `ZodError` is still available on `error.cause`. [Errors](/docs/builder/essentials/errors) describes every kind.

### One onError hook

`onZodError` is removed, and `onError` receives the `EndpointError` instead of `unknown`. It is called once per failed call with the same instance the caller gets.

```diff
  const API = builder({
-   onError: (error) => log(error),
-   onZodError: (zodError, response, originalError) => report(zodError),
+   onError: (error) => {
+     log(error.kind, error.endpoint, error.status)
+     if (error.kind === 'response-validation') report(error.issues)
+   },
  })
```

### Headers and timeout are endpoint options

`clientOptions` now carries client-specific keys only, such as `withCredentials`, and cannot override what the builder sets. `clientOptions.timeout` is ignored, and `transformRequest` / `transformResponse` are gone. `clientOptions.headers` are still sent, underneath the endpoint's `headers`.

```diff
  const createUser = API.declareEndpoint({
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

### Passing the client

```diff
- const API = builder()
- API.provideClient(client)
+ const API = builder({ client })
```

`provideClient` still works at start-up. For a per-request client, pass it to the call instead of swapping the shared one:

```diff
- API.provideClient(requestClient)
- const user = await getUser({ urlParams: { userId: '1' } })
+ const user = await getUser({ urlParams: { userId: '1' } }, { client: requestClient })
```

### Behavior to re-check

- **Non-2xx is always an error.** Builder checks the status itself, whether the client resolved or rejected. A client configured to resolve on 4xx no longer turns those into successful results.
- **Unknown endpoint options are compile errors.** Typos and removed options such as `result` are reported by the compiler.
- **`urlParamsSchema` keys must equal the URL's parameter names.** A mismatch throws when the endpoint is declared. The check runs for schemas that expose their keys as `.shape`, as a Zod object does.
- **Contradicting options are errors**, for the compiler and when the endpoint is declared: `responses` with `responseSchema`, a response schema with a non-JSON `response`, and a body on `GET` or `HEAD`.
- **URL parameter names** are a letter or underscore followed by letters, digits or underscores, so `/files/$id.json` has the parameter `id`. An empty string counts as a missing parameter. `.`, `..`, objects, arrays and `NaN` are refused, and a `Date` is written as an ISO string.
- **Primitive JSON bodies** are encoded: a string body of `requestSchema: z.string()` is sent as a JSON string, not as it is, and `0`, `false` and `null` are sent. A body the client cannot serialise, such as a `BigInt` in JSON, fails with kind `config`.
- **Header names are merged without regard to case** across `clientOptions.headers`, the endpoint's `headers` and those of the call.
- **`safe()` never rejects**, also not for a client that resolves with nothing or for headers that `Headers` refuses.
- **`data` and `params` are optional** when their schema accepts an empty object or `undefined`, and `endpoint()` takes no argument when nothing is required.
- **`validateResponse: false`** types the result as the schema's input, because transforms and defaults are not applied.
- **Multipart bodies**: `Blob` values are sent as binary parts, a `FormData` instance is sent as it is, and `undefined` fields are left out.
- **Schemas are Standard Schema.** Every slot accepts any Standard Schema library, and `zod` is no longer a peer dependency. `error.issues` are plain objects, `{ message, path?, part? }`, without the validated value and without fields specific to a library. Those are on `error.cause`.

### Removed and renamed exports

| 1.x                                                             | 2.0                                                                     |
| --------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `declareStream`                                                 | `declareEndpoint({ response: 'blob' \| 'text' \| 'stream' })`           |
| `declareMultipart`                                              | `declareEndpoint({ body: 'multipart' })`                                |
| `useDiscriminatorResponse`, `isErrorStatus`, `isErrorResponse`, `UnknownResponseError`, `InferErrorSchemaOutputWithStatus` | `endpoint.safe()`, then narrow on `error.kind` and `error.status` |
| `onZodError`                                                    | `onError`, checking `error.kind`                                        |
| `handleError`                                                   | removed                                                                 |
| `RequestArgs`                                                   | `ClientRequestArgs<Options>` (input types), `ServerRequestArgs<Options>` (output types) |
| `InferEndpointParams`, `EndpointFunctionArgs`                   | removed; the argument type is now `ClientRequestArgs<Options>`, or `EndpointParams<typeof endpoint>` from an endpoint |
| `BaseEndpointConfig`, `AnyEndpointConfig`                       | removed; constrain with `BaseEndpointOptions`, or `EndpointOptions` when a `responseSchema` is required. `EndpointConfig<typeof endpoint>` reads one endpoint's options |
| `AbstractEndpoint`, `StreamHandler`, `AbstractStream`           | `EndpointHandler<Options>`                                              |
| `BaseStreamConfig`, `AnyStreamConfig`, `StreamOptions`, `InferStreamReturn`, `InferStreamParams`, `NaviosZodRequest`, `NaviosZodRequestBase`, `Util_FlatObject` | removed |
| `createHandler`, `makeConfig`, `makeFormData`, `Simplify` and the types `HandlerRequest`, `ConfigRequest`, `UrlParamsRequest` | removed. `bindUrlParams` stays, and `getUrlParamNames` is new |
| `createSendHandler`, `createSubscribeHandler`, `createGlobalMessageHandler`, `defaultFormatMessage`, `defaultParseMessage` (`/socket`) | removed |

The Zod-narrowed option types `ZodBaseEndpointOptions`, `ZodEndpointOptions` and `ZodSchemaSlots` are removed and no package exports them.

The current names are listed in the [@navios/builder API](/docs/builder/reference/builder).

### Socket and EventSource

Both builders have a single `onError` hook that receives a typed error. The separate callbacks are removed.

```diff
- socketBuilder({
-   onValidationError: (err) => reportZod(err),
-   onAckTimeout: (topic) => reportTimeout(topic),
- })
+ socketBuilder({
+   onError: (error) => {
+     if (error.kind === 'validation') reportIssues(error.issues)
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

Send functions throw and reject with a `SocketError` instead of a `ZodError` or a plain `Error`:

```diff
  try {
    await createRoom({ name })
  } catch (error) {
-   if (error instanceof ZodError) showInvalid(error.issues)
+   if (isSocketError(error) && error.kind === 'validation') showInvalid(error.issues)
+   if (isSocketError(error) && error.kind === 'ack-timeout') showTimeout()
  }
```

What else changed:

- **Socket.IO needs `topics: 'events'`.** By default `socketBuilder` sends every message as a `[topic, payload]` envelope on one event, which a stock Socket.IO server never understood. `socketBuilder({ topics: 'events' })` emits each topic as its own event and takes acknowledgements as callbacks. See [Socket.IO](/docs/builder/realtime/websocket#socketio).
- **A frame that cannot be sent is an error.** `emit`, `sendRaw` and send functions fail with kind `transport` when the socket is not open, where 1.x reported the failure to `onError` at most. Pending acknowledgements are rejected when the connection closes. `emit` takes no callback; use `ackSchema`.
- **A send with an `ackSchema` always rejects**, also for an invalid payload. It never throws.
- **`eventSourceBuilder.provideClient` no longer closes the previous connection.** Pass `{ closePrevious: true }`. Both builders ignore the client they already have, and both accept subscriptions before there is one.
- **`on('open')` and `on('error')` of an `EventSource` handle** listen to server events of these names. Use `onOpen` and `onError` for the connection.
- **`querySchema` is applied when `params` is left out**, so its defaults are sent and its required fields are required. A handler is called without arguments when nothing is required.
- **Payloads of events** are validated as decoded from JSON. A number, a boolean or `null` that fails is tried as the text that arrived.
- **`issues` of both errors** are plain objects, `{ message, path? }`.

`createWebSocketHandler({ onError })` and `createEventSourceHandler({ onError })` also receive the typed error, with the thrown value on `cause`. See [WebSocket](/docs/builder/realtime/websocket) and [Server-Sent Events](/docs/builder/realtime/server-sent-events).

## @navios/http

| 0.6 | 2.0 |
| --- | --- |
| `NaviosError` (an error status) and `NaviosInternalError` (no response) | one class, `HttpClientError`, with `response` or `null`, `status`, `code` and `cause`. `isHttpClientError(error)` is the guard |
| `Request failed with Not Found` | `Request failed with status 404 (Not Found)` |
| `error.config` had the serialised URL and body | `config` is the request as the interceptors saw it, so `client.request(error.config)` repeats it. It is not enumerable |
| request interceptors ran after `params` and `data` were serialised | before, so they can change both |
| what a response interceptor returned was ignored | it takes the place of the response; returning nothing keeps it |
| a rejected response handler received error statuses only | every failure before it: network errors, and what a request interceptor threw. Rethrow what you do not handle |
| `interceptors.response.clear()` removed the built-in handling of errors too | only what you added |
| header names were merged as they were written, so a default and a per-call header could both be sent | names are lower-case, and a header of the call or of an interceptor replaces a default one. `config.headers` and `defaults.headers` take a name in any case |
| only objects and `FormData` in `data` were sent | strings too, as `text/plain` unless a content type is set; `URLSearchParams`, `Blob`, buffers and streams as they are; `0` and `false` as JSON, and `null` when the content type is JSON |
| `DELETE` and `OPTIONS` dropped `data` | they send it; `GET` and `HEAD` do not |
| `params` were dropped for a URL with a query string | they are merged into it |
| `baseURL` and `url` were put together as they were | with exactly one slash between. A `url` with a scheme of its own is used as it is |
| an empty JSON body, such as a 204, failed | resolves with `data: undefined` |
| `cancelToken`, which was never read | removed. Use `signal`. `timeout` aborts the request |
| `any` in the types | `data` of a response is `unknown` unless its type is given |

Mocks of `@navios/http/testing` may be asynchronous and match a query; `requests` records what was sent, and `reset()` forgets both. [HTTP client](/docs/builder/essentials/http-client#the-navios-http-client) describes the client.

## @navios/react-query

### Three client methods

`declareClient` returns `{ query, infiniteQuery, mutation }`. Each accepts an inline declaration or an existing endpoint, so the `FromEndpoint` variants and `multipartMutation` are gone.

```diff
- const getUser = client.queryFromEndpoint(getUserEndpoint)
- const updateUser = client.mutationFromEndpoint(updateUserEndpoint)
+ const getUser = client.query(getUserEndpoint)
+ const updateUser = client.mutation(updateUserEndpoint)
```

```diff
- const uploadAvatar = client.multipartMutation({
+ const uploadAvatar = client.mutation({
    method: 'POST',
    url: '/users/$userId/avatar',
+   body: 'multipart',
    requestSchema: z.object({ file: z.instanceof(File) }),
    responseSchema: avatarSchema,
  })
```

```diff
- const downloadFileEndpoint = API.declareStream({ method: 'GET', url: '/files/$fileId' })
- const downloadFile = client.mutationFromEndpoint(downloadFileEndpoint)
+ const downloadFile = client.mutation({ method: 'GET', url: '/files/$fileId', response: 'blob' })
```

### Errors live in the error channel

Errors are never returned as data. Queries and mutations call the throwing form of the endpoint, so `error`, `onError` and error boundaries receive the typed `EndpointError`.

```diff
- const API = builder({ useDiscriminatorResponse: true })
- const { data } = getUser.use({ urlParams: { userId } })
- if ('message' in data) showError(data.message)
+ const API = builder({ client })
+ const { data, error } = getUser.use({ urlParams: { userId } })
+ if (error?.kind === 'http' && error.status === 404) showError(error.body.message)
```

`onFail` is removed from every helper. Use the builder's `onError`, or the mutation's.

### processResponse becomes select

```diff
- const getUser = client.query({ ...config, processResponse: (data) => data.name })
- const name = getUser.useSuspense({ urlParams: { userId } })
+ const getUser = client.query(config)
+ const { data: name } = getUser.useSuspense(
+   { urlParams: { userId } },
+   { select: (user) => user.name },
+ )
```

Hooks accept every TanStack option except `queryKey` and `queryFn`. For mutations, transform the result in `onSuccess` or at the call site.

### Keys and invalidation

`query.key(args?)` replaces `queryKey` and its members, and `invalidate` covers what `invalidateAll` did.

```diff
- const key = getUser.queryKey.dataTag({ urlParams: { userId } })
- await getUser.invalidateAll(queryClient, { urlParams: { userId } })
- await queryClient.invalidateQueries({ queryKey: ['users'] })
+ const key = getUser.key({ urlParams: { userId } })
+ await getUser.invalidate(queryClient, { urlParams: { userId } })
+ await listUsers.invalidate(queryClient)
```

:::warning
Every cache key changed shape. Discard caches persisted by 1.x, for example by changing the persister's `buster`.
:::

The new shape is described in [Keys and invalidation](/docs/builder/react-query/keys-and-invalidation).

### Mutations

Mutation hooks take no arguments, every mutation has a `mutationKey`, and URL params always go to `mutate`. `useKey` is removed.

```diff
- const updateUser = client.mutation({ ...config, useKey: true })
- const { mutate } = updateUser({ urlParams: { userId } })
- const isUpdating = updateUser.useIsMutating({ userId })
- mutate({ data })
+ const updateUser = client.mutation(config)
+ const { mutate } = updateUser()
+ const isUpdating = updateUser.useIsMutating({ urlParams: { userId } })
+ mutate({ urlParams: { userId }, data })
```

Callbacks receive one merged context as their last argument. It already contains the `QueryClient` as `context.client`, and the value returned from `onMutate` as `context.onMutateResult`. Invalidation after success has its own setting.

```diff
  const updateUser = client.mutation({
    ...config,
-   useContext: () => ({ queryClient: useQueryClient() }),
-   onSuccess: (data, variables, context) => {
-     context.queryClient.invalidateQueries({ queryKey: ['users'] })
-   },
+   invalidates: [listUsers, (_data, v) => getUser.key({ urlParams: v.urlParams })],
+   onSuccess: (data, variables, context) => {
+     getUser.setData(context.client, { urlParams: variables.urlParams }, data)
+   },
  })
```

### Optimistic updates

```diff
- ...createOptimisticUpdate({
-   queryKey: ['users', userId],
-   updateFn: (old, variables) => ({ ...old, ...variables.data }),
- }),
+ optimistic: (update) =>
+   update(getUser, {
+     args: (variables) => ({ urlParams: variables.urlParams }),
+     update: (current, variables) => current && { ...current, ...variables.data },
+   }),
```

Return an array of `update(...)` calls where you used `createMultiOptimisticUpdate`.

### Prefetching

The helpers are methods of the query object.

```diff
- const userPrefetch = createPrefetchHelper(getUser)
- await userPrefetch.prefetch(queryClient, { urlParams: { userId } })
- const user = await userPrefetch.ensureData(queryClient, { urlParams: { userId } })
+ await getUser.prefetch(queryClient, { urlParams: { userId } })
+ const user = await getUser.ensure(queryClient, { urlParams: { userId } })
```

### Infinite queries

The page param is an object of query params, merged over the call's `params`. `initialPageParam` is optional and defaults to those `params`.

```diff
  const listUsers = client.infiniteQuery({
    method: 'GET',
    url: '/users',
    querySchema: z.object({ cursor: z.string().optional() }),
    responseSchema: usersPageSchema,
-   getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
-   initialPageParam: undefined,
+   getNextPageParam: (lastPage) =>
+     lastPage.nextCursor ? { cursor: lastPage.nextCursor } : undefined,
  })
```

### Removed exports

| 1.x                                                                             | 2.0                                                              |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `client.multipartMutation`                                                      | `client.mutation` with `body: 'multipart'`                       |
| `client.queryFromEndpoint`, `mutationFromEndpoint`, `infiniteQueryFromEndpoint` | `client.query`, `client.mutation`, `client.infiniteQuery`        |
| `processResponse`                                                               | TanStack's `select` on the hook call                             |
| `onFail`                                                                        | `onError` on the builder or the mutation                         |
| `query.queryKey` (`dataTag`, `filterKey`, `bindToUrl`, `template`), `queryKeyCreator` | `query.key(args?)`                                         |
| `query.invalidateAll`                                                           | `query.invalidate` with no or partial args                       |
| `useKey`, `mutation({ urlParams })`                                             | `mutation.mutationKey`, `mutation.useIsMutating({ urlParams })`  |
| `createOptimisticUpdate`, `createMultiOptimisticUpdate`                         | the `optimistic` setting                                         |
| `createPrefetchHelper`, `createPrefetchHelpers`, `prefetchAll`                  | `query.prefetch`, `query.ensure`, `query.fetch`                  |
| `makeQueryOptions`, `makeInfiniteQueryOptions`                                  | `makeQuery`, `makeInfiniteQuery`                                 |
| `UseDiscriminator` generic, and the types `AbstractEndpoint`, `ClientEndpointHelper`, `EndpointHelper`, `StreamHelper`, `ComputeBaseResult`, `ComputeQueryResult`, `ComputeInfinitePageResult`, `ResponseDataType` | removed |

The current names are listed in the [@navios/react-query API](/docs/builder/reference/react-query).
