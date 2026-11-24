---
sidebar_position: 3
---

# API Reference

Complete API reference for `@navios/react-query`.

## declareClient

Creates a client for declaring type-safe queries and mutations.

```typescript
function declareClient(options: ClientOptions): ClientInstance
```

### Parameters

| Option               | Type                 | Description                                           |
| -------------------- | -------------------- | ----------------------------------------------------- |
| `api`                | `BuilderInstance`    | The builder whose endpoints the client uses           |
| `defaults.keyPrefix` | `readonly unknown[]` | Segments placed before `[method, url]` in every key   |
| `defaults.keySuffix` | `readonly unknown[]` | Segments placed right after `[method, url]`           |

### Returns

A `ClientInstance` with three methods: `query`, `infiniteQuery` and `mutation`.

### Example

```typescript
import { builder } from '@navios/builder'
import { create } from '@navios/http'
import { declareClient } from '@navios/react-query'

const api = builder({ client: create({ baseURL: 'https://api.example.com' }) })
const client = declareClient({ api })
```

## ClientInstance Methods

Each method accepts either an inline endpoint declaration — the options of `api.declareEndpoint` plus the method's own settings — or an endpoint handler with the settings as a second argument.

### query

```typescript
client.query(config: EndpointOptions & SurfaceOptions): QueryObject
client.query(endpoint: EndpointHandler, options?: SurfaceOptions): QueryObject
```

`SurfaceOptions` is `{ keyPrefix?, keySuffix?, withResponse? }` — see [Surface Options](#surface-options).

```typescript
const getUser = client.query({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

const getUser = client.query(getUserEndpoint)
```

### infiniteQuery

The endpoint must have a `querySchema`.

```typescript
client.infiniteQuery(config: EndpointOptions & InfiniteQuerySettings): InfiniteQueryObject
client.infiniteQuery(endpoint: EndpointHandler, options: InfiniteQuerySettings): InfiniteQueryObject
```

```typescript
const listUsers = client.infiniteQuery(listUsersEndpoint, {
  getNextPageParam: (lastPage, _allPages, lastPageParam) =>
    lastPage.hasMore ? { ...lastPageParam, page: lastPageParam.page + 1 } : undefined,
})
```

### mutation

Works for any endpoint, including `body: 'multipart'` uploads and `response: 'blob'` downloads.

```typescript
client.mutation(config: EndpointOptions & MutationSettings): MutationObject
client.mutation(endpoint: EndpointHandler, options?: MutationSettings): MutationObject
```

```typescript
const updateUser = client.mutation(updateUserEndpoint, {
  invalidates: [listUsers, (_data, v) => getUser.key({ urlParams: v.urlParams })],
})
```

### Endpoint Options

The inline form accepts the builder's endpoint options: `method`, `url`, `querySchema`, `requestSchema`, `responseSchema`, `responses`, `errorSchema`, `urlParamsSchema`, `body`, `response`, `headers`, `timeout`, `clientOptions` and `validateResponse`. See [Defining Endpoints](/docs/builder/builder/guides/defining-endpoints).

### Surface Options

Accepted by `query`, `infiniteQuery` and `mutation`, inline or in the options argument:

| Option         | Type                 | Description                                                                 |
| -------------- | -------------------- | --------------------------------------------------------------------------- |
| `keyPrefix`    | `readonly unknown[]` | Segments placed before `[method, url]` in the key                           |
| `keySuffix`    | `readonly unknown[]` | Segments placed right after `[method, url]`                                 |
| `withResponse` | `boolean`            | Deliver `{ data, response }` instead of the bare data. Default `false`      |

With `withResponse: true` the data type is `DataWithResponse<Data>`:

```typescript
interface DataWithResponse<TData> {
  data: TData
  response: {
    status: number
    statusText: string
    headers: Record<string, string>
  }
}
```

`headers` is a plain record with lower-cased names, so the value is serializable: it survives dehydration, persistence and structural sharing. Everywhere this reference says `Data` — hook results, `fetch`, `getData`, `setData`, `select`, mutation callbacks, the pages of an infinite query — the wrapped type takes its place. Failures are not wrapped: they stay in the error channel as the endpoint's `EndpointError`.

Queries and infinite queries declared with `withResponse: true` carry a `'with-response'` marker in their key and are cached apart from the same endpoint declared without it.

```typescript
const getUser = client.query(getUserEndpoint, { withResponse: true })

const { data } = getUser.use({ urlParams: { userId } })
data?.data // User
data?.response.headers.etag // the ETag header
```

## QueryObject

### Call Signature

```typescript
getUser(args, options?): QueryOptions
```

Builds TanStack query options for the arguments. Pass the result to `useQuery`, `useSuspenseQuery`, `useQueries` or `queryClient.query`. `options` accepts every `useQuery` option except `queryKey` and `queryFn`.

`args` is `{ urlParams?, params?, data?, headers?, timeout? }` as required by the endpoint; the argument is optional when nothing is required.

### use

```typescript
getUser.use(args | skipToken, options?): UseQueryResult<Data, EndpointError>
```

`useQuery` for the endpoint. `options` accepts every `useQuery` option except `queryKey` and `queryFn`; with `select`, `data` takes the selected type. Passing `skipToken` as `args` disables the query.

### useSuspense

```typescript
getUser.useSuspense(args, options?): UseSuspenseQueryResult<Data, EndpointError>
```

`useSuspenseQuery` for the endpoint. Does not accept `skipToken`.

### key

```typescript
getUser.key(args?): QueryKey
```

The cache key, tagged with the data and error types.

- no args: prefix of every entry of the endpoint
- partial args: prefix of every entry that matches them
- full args: the exact key

Shape: `[...keyPrefix, method, urlTemplate, ...keySuffix, 'with-response'?, 'infinite'?, inputs?]`. See [Query Keys](/docs/builder/react-query/guides/query-keys).

### fetch

```typescript
getUser.fetch(queryClient, args): Promise<Data>
```

Fetches through the cache and resolves with the data; rejects with the endpoint's error. Fresh cached data is returned without a request.

### prefetch

```typescript
getUser.prefetch(queryClient, args): Promise<void>
```

Like `fetch`, but resolves with nothing and never rejects.

### ensure

```typescript
getUser.ensure(queryClient, args): Promise<Data>
```

Resolves with cached data when there is any, however old, and fetches only when the cache is empty.

:::info
`fetch`, `prefetch` and `ensure` are built on TanStack's `queryClient.query()` (`queryClient.infiniteQuery()` for infinite queries), because `fetchQuery`, `prefetchQuery` and `ensureQueryData` are deprecated upstream.
:::

### getData

```typescript
getUser.getData(queryClient, args): Data | undefined
```

### setData

```typescript
getUser.setData(queryClient, args, updater): Data | undefined
```

`updater` is the new value or a function `(old: Data | undefined) => Data | undefined`. `args` is required; pass `{}` for a query without arguments.

### invalidate

```typescript
getUser.invalidate(queryClient, args?, filters?): Promise<void>
```

Invalidates entries of the endpoint: all of them without `args`, the matching ones with partial `args`. `filters` takes TanStack's invalidation filters except `queryKey`; pass `{ exact: true }` to hit one entry.

### endpoint

The endpoint handler the query calls. `getUser.endpoint(args)` calls it directly; `getUser.endpoint.config` is its declaration.

## InfiniteQueryObject

Has the same members as `QueryObject`. The cached value, and the result of `fetch`, `ensure`, `getData` and `setData`, is `InfiniteData<Page, PageParam>`; `use` and `useSuspense` return TanStack's infinite query results. Hook options exclude the pagination settings, which are fixed by the declaration.

### InfiniteQuerySettings

| Setting                | Type                                                                                | Description                                                        |
| ---------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `getNextPageParam`     | `(lastPage, allPages, lastPageParam, allPageParams) => PageParam \| undefined \| null`    | Required. Query params for the next page, or nothing when done    |
| `getPreviousPageParam` | `(firstPage, allPages, firstPageParam, allPageParams) => PageParam \| undefined \| null`  | Optional. Query params for the previous page                      |
| `initialPageParam`     | `PageParam`                                                                         | Optional. Defaults to the call's `params`                          |
| `keyPrefix`, `keySuffix`, `withResponse` | See [Surface Options](#surface-options)                           | With `withResponse: true` every page is `{ data, response }`       |

`PageParam` is the input type of the endpoint's `querySchema`. Each page is requested with the page param merged over the call's `params`.

Without `initialPageParam`, the first page param is exactly the `params` object of the call — the value as it was passed, not the output of `querySchema`.

## MutationObject

### Hook

```typescript
updateUser(): UseMutationResult<Data, EndpointError, Variables, OnMutateResult>
```

The mutation is itself the hook and takes no arguments. `Variables` are the endpoint's call arguments; `mutate()` takes none when the endpoint requires nothing.

### mutationKey

```typescript
updateUser.mutationKey // [...keyPrefix, method, url, ...keySuffix]
```

`withResponse` does not change the mutation key.

### useIsMutating

```typescript
updateUser.useIsMutating(match?: { urlParams?: Partial<UrlParams> }): boolean
```

`true` while a mutation of the endpoint is in flight. With `urlParams`, only mutations whose variables have those URL params are counted.

### endpoint

The endpoint handler the mutation calls.

### MutationSettings

Every TanStack `useMutation` option except `mutationKey` and `mutationFn`, plus:

| Setting       | Type                                                             | Description                                                          |
| ------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| `invalidates` | `(QueryObject \| ((data, variables) => QueryKey \| undefined))[]` | Queries to invalidate after the mutation succeeds                    |
| `optimistic`  | `(update) => OptimisticUpdate \| OptimisticUpdate[]`              | Cache updates applied before the request is sent                     |
| `useContext`  | `() => Context`                                                  | Hook whose return value is merged into the context of every callback |
| `onMutate`    | `(variables, context) => OnMutateResult`                         | Called before the request                                            |
| `onSuccess`   | `(data, variables, context) => void`                             | Called on success                                                    |
| `onError`     | `(error, variables, context) => void`                            | Called on failure                                                    |
| `onSettled`   | `(data, error, variables, context) => void`                      | Called on either                                                     |
| `keyPrefix`, `keySuffix` | `readonly unknown[]`                                  | Key segments                                                         |
| `withResponse` | `boolean`                                                       | `data` of the hook result and of `onSuccess` / `onSettled` / `invalidates` functions is `{ data, response }`. See [Surface Options](#surface-options) |

**Callback context:** the return value of `useContext` merged with TanStack's `{ client, meta, mutationKey }`; `client` is the `QueryClient`. In `onSuccess`, `onError` and `onSettled` it also has `onMutateResult`.

**`update(query, spec)`** — the function handed to `optimistic`:

| Field                 | Type                                 | Description                                                  |
| --------------------- | ------------------------------------ | ------------------------------------------------------------ |
| `args`                | `(variables) => args`                | Arguments of the entry to update. Required when the query has required inputs (URL params, or required `params` / `data`); optional otherwise |
| `update`              | `(current, variables) => next`       | Returns the new cached value                                 |
| `rollbackOnError`     | `boolean`                            | Restore the previous value on failure. Default `true`        |
| `invalidateOnSettled` | `boolean`                            | Invalidate the entry when the mutation settles. Default `true` |

## HTTP Client Binding

### setHttpClient

```typescript
function setHttpClient(queryClient: QueryClient, client: Client | null): void
```

Binds an HTTP client to a `QueryClient`. Every query, infinite query and mutation that runs through that `QueryClient` then uses it instead of the builder's shared client. Pass `null` to remove the binding. See [Per-Request HTTP Client](/docs/builder/react-query/advanced/ssr-prefetch#per-request-http-client).

```typescript
const queryClient = new QueryClient()
setHttpClient(queryClient, createHttpClientFor(request))

await getUser.prefetch(queryClient, { urlParams: { userId } })
```

### getHttpClient

```typescript
function getHttpClient(queryClient: QueryClient): Client | undefined
```

Returns the HTTP client bound to a `QueryClient`, if any.

## Standalone Factories

The functions behind the client methods, for use without a client instance. They take an endpoint handler.

```typescript
import { makeInfiniteQuery, makeMutation, makeQuery } from '@navios/react-query'

const getUser = makeQuery(getUserEndpoint, { keyPrefix: ['tenant-1'], withResponse: true })
const listUsers = makeInfiniteQuery(listUsersEndpoint, { getNextPageParam })
const updateUser = makeMutation(updateUserEndpoint, { invalidates: [listUsers] })
```

## Errors

The error type of every query and mutation is the endpoint's `EndpointError` from `@navios/builder`, typed from `errorSchema`:

```typescript
if (error.kind === 'http' && error.status === 404) {
  error.body // typed from errorSchema[404]
}
```

`kind` is one of `'http'`, `'http-unknown'`, `'request-validation'`, `'response-validation'`, `'network'`, `'timeout'`, `'aborted'`, `'config'`. See [Typed Errors](/docs/builder/react-query/advanced/error-schemas).

## Types

| Type                                    | Description                                                       |
| --------------------------------------- | ----------------------------------------------------------------- |
| `ClientInstance`, `ClientOptions`       | The client and the options of `declareClient`                     |
| `KeyOptions`                            | `{ keyPrefix?, keySuffix? }`                                      |
| `SurfaceOptions`                        | `KeyOptions & { withResponse? }` — options shared by every query and mutation |
| `DataWithResponse<Data>`                | `{ data, response: { status, statusText, headers } }` — the data delivered with `withResponse: true` |
| `QueryObject<Options>`                  | Result of `client.query`                                          |
| `InfiniteQueryObject<Options>`          | Result of `client.infiniteQuery`                                  |
| `InfiniteQuerySettings<Options>`        | Pagination settings                                               |
| `MutationObject<Options>`               | Result of `client.mutation`                                       |
| `MutationSettings<Options>`             | Settings of `client.mutation`                                     |
| `MutationVariables<Options>`            | Variables passed to `mutate`                                      |
| `MutationCallbackContext<Context>`      | Context handed to mutation callbacks                              |
| `EndpointArgs<Options>`                 | The call arguments of an endpoint                                 |
| `EndpointData<Options>`                 | The data an endpoint resolves to                                  |
| `EndpointFailure<Options>`              | The typed `EndpointError` an endpoint fails with                  |
| `PartialEndpointInputs<Options>`        | Any subset of `urlParams`, `params`, `data` — accepted by `key` and `invalidate` |
| `InvalidateFilters`                     | Filters accepted by `invalidate`                                  |

`Options` is the endpoint's declaration type, available as `typeof endpoint.config`.

## See Also

- [Getting Started](/docs/builder/react-query/getting-started) - Quick start guide
- [Queries](/docs/builder/react-query/guides/queries) - Query usage
- [Mutations](/docs/builder/react-query/guides/mutations) - Mutation usage
- [Query Keys](/docs/builder/react-query/guides/query-keys) - Key structure
- [Best Practices](/docs/builder/react-query/best-practices) - Recommended patterns
