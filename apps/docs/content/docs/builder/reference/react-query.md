---
title: '@navios/react-query API'
---

# @navios/react-query API

Every public export of `@navios/react-query`, with signatures. This page is for looking things up; the [React Query guides](/docs/builder/react-query/) explain how the pieces are used. Requires `@tanstack/react-query` `^5.102.0`.

## declareClient

```ts
function declareClient(options: ClientOptions): ClientInstance
```

| `ClientOptions` field | Type              | Description                                                        |
| --------------------- | ----------------- | ------------------------------------------------------------------ |
| `api`                 | `BuilderInstance` | The builder that inline declarations are declared on               |
| `defaults`            | `KeyOptions`      | `keyPrefix` / `keySuffix` applied to every key made by this client, before the segments of each query or mutation |

## Client methods

Each method has two forms: pass an endpoint you already declared, or declare one inline. Inline, the endpoint options and the method's own options share one object.

```ts
client.query(endpoint, options?)
client.query({ ...endpointOptions, ...options })

client.infiniteQuery(endpoint, settings)
client.infiniteQuery({ ...endpointOptions, ...settings })

client.mutation(endpoint, settings?)
client.mutation({ ...endpointOptions, ...settings })
```

| Method          | Options type                      | Returns               | Notes                                                    |
| --------------- | --------------------------------- | --------------------- | -------------------------------------------------------- |
| `query`         | [`QuerySettings`](#query-settings) | [`QueryObject`](#query-object) | Any endpoint                                    |
| `infiniteQuery` | [`InfiniteQuerySettings`](#infinite-query-settings) | [`InfiniteQueryObject`](#infinite-query-object) | The endpoint must have a `querySchema` |
| `mutation`      | [`MutationSettings`](#mutation-settings) | [`MutationObject`](#mutation-object) | Any endpoint, including multipart and blob |

Unknown keys in an inline declaration are compile errors. A method's `keyPrefix` and `keySuffix` are added after the client's `defaults`, never in place of them.

`declareClient({ api })` takes the type of the builder's shared `errorSchema` (`builder({ errorSchema })`), so inline declarations have the same typed errors as endpoints declared on the builder.

## Shared options

`SurfaceOptions` is accepted by all three methods. `KeyOptions` is its first two fields.

| Option         | Type                 | Default | Description                                                                                      |
| -------------- | -------------------- | ------- | ------------------------------------------------------------------------------------------------ |
| `keyPrefix`    | `readonly unknown[]` | `[]`    | Segments placed before `[method, url]` in every key                                              |
| `keySuffix`    | `readonly unknown[]` | `[]`    | Segments placed right after `[method, url]`                                                      |
| `withResponse` | `boolean`            | `false` | Deliver [`DataWithResponse`](#withresponse-and-datawithresponse) instead of the bare data        |

Query keys have the shape `[...keyPrefix, method, url, ...keySuffix, 'with-response'?, 'query' | 'infinite', { keyBy }?, inputs?]`, where `inputs` is `{ urlParams?, params?, data? }`. Mutation keys are `[...keyPrefix, method, url, ...keySuffix]`. See [Keys and invalidation](/docs/builder/react-query/keys-and-invalidation).

## Query settings

`QuerySettings<TData, TError, WithResponse, TKeyBy>` is `SurfaceOptions`, `keyBy`, and `QueryDefaults<TData, TError>`: every `useQuery` option except `queryKey`, `queryFn`, `select`, `initialData` and `initialDataUpdatedAt`. They apply to every use of the query, under the options of a call site. `fetch`, `prefetch` and `ensure` use those that apply outside a component. See [Options for every use](/docs/builder/react-query/queries#options-for-every-use).

| Setting | Type             | Default     | Description |
| ------- | ---------------- | ----------- | ----------- |
| `keyBy` | `KeyBy<Options>` | every input | Which inputs identify the entry: `false` for none, or `{ urlParams?, params?, data? }`, each `true`, `false` or a list of the fields kept. The rest are shared; see [Shared entries](/docs/builder/react-query/keys-and-invalidation#shared-entries) |

## Query object

`QueryObject<Options, TData, TError, TKeyBy>`. `args` is the endpoint's call arguments; it is optional wherever the endpoint requires nothing. `TError` is the endpoint's typed `EndpointError`. `TKeyBy` is the declaration's `keyBy`, `undefined` without one.

| Member        | Signature                                                             | Description                                                                                         |
| ------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `query()`     | `(args, options?) => QueryOptionsResult<TData, TError>`               | TanStack query options for `useQuery`, `useSuspenseQuery`, `useQueries` and `queryClient.query`     |
| `use`         | `(args \| skipToken, options?) => UseQueryResult<TSelected, TError>`  | `useQuery`. `options` is every TanStack option except `queryKey` and `queryFn`                      |
| `useSuspense` | `(args, options?) => UseSuspenseQueryResult<TSelected, TError>`       | `useSuspenseQuery`, with the same rule for `options`                                                |
| `key`         | `(args?: PartialEndpointInputs<Options>) => TaggedKey<TData, TError>` | No args: every entry of this query. Partial args: the matching entries. Full args: the exact key    |
| `endpointKey` | `readonly unknown[]`                                                  | Prefix of every entry of the endpoint, in every form (plain, infinite, `withResponse`). Untyped     |
| `fetch`       | `(queryClient, args) => Promise<TData>`                               | Fetches through the cache; fresh cached data is returned without a request. Rejects with `TError`   |
| `prefetch`    | `(queryClient, args) => Promise<void>`                                | Like `fetch`, but resolves with nothing and never rejects                                           |
| `ensure`      | `(queryClient, args) => Promise<TData>`                               | Cached data however old; fetches only when the cache is empty                                       |
| `getData`     | `(queryClient, args) => TData \| undefined`                           | Reads the cached data                                                                               |
| `setData`     | `(queryClient, args, updater) => TData \| undefined`                  | Writes the cached data; `updater` is a value or `(current) => next`                                 |
| `invalidate`  | `(queryClient, args?, filters?) => Promise<void>`                     | Without args: the `endpointKey`. With args: the same scopes as `key`. `filters` is TanStack's, minus `queryKey` |
| `endpoint`    | `EndpointHandler<Options>`                                            | The endpoint this query calls                                                                       |

With a `keyBy`, `use`, `useSuspense`, `fetch`, `prefetch` and `ensure` take `SendArgs<Options, TKeyBy>`, where the shared inputs are optional and sent when present. `query()`, `getData` and `setData` take `KeyedArgs<Options, TKeyBy>`, and `key` and `invalidate` take `PartialKeyedInputs<Options, TKeyBy>`: only the inputs that identify the entry.

See [Queries](/docs/builder/react-query/queries).

## Infinite query settings

`InfiniteQuerySettings<Options, TPage>` is `SurfaceOptions`, `InfiniteQueryDefaults` (every `useInfiniteQuery` option except the ones the query owns, `select`, `initialData` and `initialDataUpdatedAt`) and:

| Setting                | Type                                                                                              | Description                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `getNextPageParam`     | `(lastPage, allPages, lastPageParam, allPageParams) => PartialPageParam<Options> \| undefined \| null`   | Required. The query params that change for the next page, or nothing when there is none |
| `getPreviousPageParam` | `(firstPage, allPages, firstPageParam, allPageParams) => PartialPageParam<Options> \| undefined \| null` | The same, backwards                                                     |
| `initialPageParam`     | `PartialPageParam<Options>`                                                                              | Defaults to the call's `params`                                         |

`PageParam<Options>` is the input type of the endpoint's `querySchema`, and `PartialPageParam<Options>` any subset of it. Each page param is merged over the call's `params`; `lastPageParam`, `firstPageParam` and `allPageParams` are the merged result, a `PageParam<Options>`.

## Infinite query object

`InfiniteQueryObject<Options, TPage, TError, TPageParam, TData>` has the same members as a [query object](#query-object), with these differences:

- The cached value, and so the type handled by `fetch`, `ensure`, `getData` and `setData`, is `InfiniteData<TPage, TPageParam>`, where `TPageParam` is `PartialPageParam<Options>`.
- `use` and `useSuspense` wrap `useInfiniteQuery` and `useSuspenseInfiniteQuery`. Their `options` also exclude `getNextPageParam`, `getPreviousPageParam` and `initialPageParam`, which come from the settings.
- Calling the object returns `InfiniteQueryOptionsResult`.
- Its keys are marked `'infinite'` where a plain query's are marked `'query'`, so the two never share an entry and neither key is a prefix of the other. Their `endpointKey` is the same.

See [Infinite queries](/docs/builder/react-query/infinite-queries).

## Mutation settings

`MutationSettings` is `SurfaceOptions`, plus every TanStack `useMutation` option except `mutationFn` and `mutationKey` (`retry`, `scope`, `meta`, `gcTime`, ...), plus:

| Setting       | Type                                                           | Description                                                                              |
| ------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `invalidates` | `InvalidateTarget \| readonly InvalidateTarget[]`              | Invalidated after success. A query object means its whole endpoint (`endpointKey`); a function `(data, variables) => key \| undefined` means that key |
| `optimistic`  | `(update: OptimisticUpdater) => OptimisticUpdate \| readonly OptimisticUpdate[]` | Cache updates applied before the request is sent                       |
| `useContext`  | `() => TContext`                                               | A hook run inside the mutation hook; its result is merged into every callback's context  |
| `onMutate`    | `(variables, context) => TOnMutateResult`                      | Before the request                                                                       |
| `onSuccess`   | `(data, variables, context) => void`                           | After success, alongside `invalidates`                                                   |
| `onError`     | `(error, variables, context) => void`                          | After failure; `error` is the endpoint's typed `EndpointError`                           |
| `onSettled`   | `(data, error, variables, context) => void`                    | After either                                                                             |

Callbacks may return a promise. `context` is `MutationCallbackContext<TContext>`: the result of `useContext` merged with TanStack's `{ client, meta, mutationKey }`. In `onSuccess`, `onError` and `onSettled` it also has `onMutateResult`.

The `update` function given to `optimistic` takes a query object and an `OptimisticUpdateSpec`:

| Spec field            | Type                                         | Default | Description                                                             |
| --------------------- | -------------------------------------------- | ------- | ----------------------------------------------------------------------- |
| `args`                | `(variables) => args of the query`           | —       | Selects the entry to update. Required when the query has required inputs |
| `update`              | `(current \| undefined, variables) => next \| undefined` | — | Returns the new cached value                                         |
| `rollbackOnError`     | `boolean`                                    | `true`  | Restore the previous value when the mutation fails                      |
| `invalidateOnSettled` | `boolean`                                    | `true`  | Invalidate the entry when the mutation settles                          |

See [Mutations](/docs/builder/react-query/mutations) and [Optimistic updates](/docs/builder/react-query/optimistic-updates).

## Mutation object

`MutationObject<Options, TOnMutateResult, TData, TError, TVariables>` is itself the hook.

| Member          | Signature                                                              | Description                                                                         |
| --------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `mutation()`    | `(options?: MutationHookOptions) => UseMutationResult<TData, TError, TVariables, TOnMutateResult>` | `useMutation`. Pass the endpoint's arguments, URL params included, to `mutate` |
| `mutationKey`   | `readonly unknown[]`                                                   | Key shared by every mutation of this endpoint                                       |
| `useIsMutating` | `(match?: { urlParams?: Partial<UrlParams> }) => boolean`              | `true` while a mutation of this endpoint is in flight, optionally only for those URL params |
| `endpoint`      | `EndpointHandler<Options>`                                             | The endpoint this mutation calls                                                    |

`TVariables` is `MutationVariables<Options>`: the endpoint's call arguments, optional when the endpoint requires nothing.

`MutationHookOptions<TData, TError, TVariables, TOnMutateResult>` are the options of one use of the hook: `retry`, `retryDelay`, `networkMode`, `gcTime`, `meta` and `throwOnError`, which replace the declaration's, and `onSuccess`, `onError` and `onSettled`, which run after the declaration's with the same arguments. See [Mutations](/docs/builder/react-query/mutations#options-of-one-component).

## withResponse and DataWithResponse

With `withResponse: true`, a query, infinite query page or mutation result is wrapped:

```ts
interface DataWithResponse<TData> {
  data: TData
  response: {
    status: number
    statusText: string
    headers: Record<string, string>
  }
}
```

Header names are lower-cased and `headers` is a plain record, so the value survives dehydration and persistence. Entries declared with `withResponse` live under their own key, marked `'with-response'` before the `'query'` or `'infinite'` marker. Failures still go to the error channel.

`MaybeWithResponse<TData, WithResponse>` is `DataWithResponse<TData>` when `WithResponse` is `true`, and `TData` otherwise. `SurfaceData<Options, WithResponse>` is that for the data of an endpoint: `MaybeWithResponse<InferEndpointReturn<Options>, WithResponse>`.

## setHttpClient and getHttpClient

```ts
function setHttpClient(queryClient: QueryClient, client: Client | null): void

function getHttpClient(queryClient: QueryClient): Client | undefined
```

`setHttpClient` binds an HTTP client to a `QueryClient`. Every query, infinite query and mutation run through that `QueryClient` then uses it instead of the builder's client. Pass `null` to remove the binding. See [SSR and prefetching](/docs/builder/react-query/ssr).

## makeQuery, makeInfiniteQuery and makeMutation

The functions behind the client methods, for use without a client instance. They take an existing endpoint only, and no client `defaults` are applied.

```ts
function makeQuery(endpoint: EndpointHandler<Options>, options?: QuerySettings): QueryObject<Options>

function makeInfiniteQuery(
  endpoint: EndpointHandler<Options>,
  settings: InfiniteQuerySettings<Options>,
): InfiniteQueryObject<Options>

function makeMutation(
  endpoint: EndpointHandler<Options>,
  settings?: MutationSettings<Options>,
): MutationObject<Options>
```

## Key utilities

The key-building functions the objects above use. Prefer `query.key()` and `mutation.mutationKey`; these exist for tooling that needs the same keys without a query object.

| Function            | Signature                                                              | Description                                                                              |
| ------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `createKeyBuilder`  | `(config, options?, isInfinite?) => { endpoint, base, rule, key(args?), scope(args?), skipped() }` | Key builder for one endpoint config. `options` takes `keyPrefix`, `keySuffix`, `withResponse` and `keyBy`. `endpoint` is the `endpointKey`, `base` the key without arguments, `scope(args?)` the key `invalidate` uses, and `skipped()` the key a hook uses under `skipToken` |
| `createMutationKey` | `(config, options?: KeyOptions) => readonly unknown[]`                 | The mutation key of an endpoint config                                                   |
| `pickInputs`        | `(args: unknown, keyBy?: AnyKeyBy) => Record<string, unknown> \| undefined` | Reduces call arguments to `urlParams`, `params` and `data` (only those `keyBy` keeps); stringifies URL param values and drops empty parts |
| `normalizeKeyValue` | `(value: unknown) => unknown`                                          | Rewrites `URLSearchParams`, `FormData`, `File`, `Blob`, `Date`, `Map`, `Set` and `bigint` into plain data that hashes by content |
| `optimisticUpdate`  | `(query, spec: OptimisticUpdateSpec) => OptimisticUpdate`              | The function the `optimistic` setting hands to its callback                              |

## Types

| Type                                | Description                                                                   |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| `ClientInstance`                    | What `declareClient` returns: `{ query, infiniteQuery, mutation }`            |
| `ClientOptions`                     | Argument of `declareClient`                                                   |
| `KeyOptions`                        | `{ keyPrefix?, keySuffix? }`                                                  |
| `SurfaceOptions<WithResponse>`      | `KeyOptions` plus `withResponse`                                              |
| `EndpointInputs<Options>`           | The part of the arguments that goes into the key: `urlParams`, `params`, `data` |
| `PartialEndpointInputs<Options>`    | Any subset of the inputs; the argument of `key` and `invalidate`              |
| `KeyBy<Options>`                    | The `keyBy` setting, with the endpoint's part and field names                 |
| `AnyKeyBy`                          | `keyBy` without an endpoint: a boolean, or parts of `boolean \| string[]`     |
| `SendArgs<Options, TKeyBy>`         | Arguments of the calls that send shared inputs: those inputs are optional     |
| `KeyedArgs<Options, TKeyBy>`        | Arguments that address the entry: only the inputs that identify it            |
| `PartialKeyedInputs<Options, TKeyBy>` | Any subset of those inputs; the argument of `key` and `invalidate` under a `keyBy` |
| `SurfaceData<Options, WithResponse>` | The data a query, infinite query page or mutation delivers: `MaybeWithResponse<InferEndpointReturn<Options>, WithResponse>` |
| `ArgsOf<Args, Rest>`                | `[args, ...Rest]`, with `args` optional when `Args` requires nothing          |
| `RequiredKeys<T>`                   | Keys of `T` that must be provided                                             |
| `TaggedKey<TData, TError>`          | A key tagged with the types stored under it                                   |
| `QueryHookOptions`, `SuspenseQueryHookOptions` | The `options` of `use` and `useSuspense`                           |
| `QueryOptionsResult<TData, TError>` | What calling a query object returns                                           |
| `InvalidateFilters`                 | TanStack's `InvalidateQueryFilters` without `queryKey`                        |
| `InfiniteEndpointOptions`           | Endpoint options with a required `querySchema`                                |
| `PageParam<Options>`                | Input type of the endpoint's `querySchema`                                    |
| `PartialPageParam<Options>`         | Any subset of it: what `getNextPageParam` returns and `pageParams` holds      |
| `InfiniteQueryHookOptions`, `SuspenseInfiniteQueryHookOptions` | The `options` of an infinite query's hooks         |
| `InfiniteQueryOptionsResult`        | What calling an infinite query object returns                                 |
| `AnyQueryObject`                    | Anything with a `key` function: a query or an infinite query                  |
| `MutationVariables<Options>`        | The variables passed to `mutate`                                              |
| `MutationHookOptions`               | The options of one use of a mutation hook                                     |
| `MutationCallbackContext<TContext>` | The context argument of the mutation callbacks                                |
| `InvalidateTarget<TData, TVariables>` | One entry of `invalidates`                                                  |
| `OptimisticUpdater<TVariables>`     | The function the `optimistic` callback receives                               |
| `OptimisticUpdateSpec<Q, TVariables>` | The description passed to it                                                |
| `OptimisticUpdate<TVariables>`      | What it returns                                                               |
| `QueryObject`, `InfiniteQueryObject`, `MutationObject`, `InfiniteQuerySettings`, `MutationSettings`, `DataWithResponse`, `MaybeWithResponse` | Described in their sections above |

An endpoint's call arguments, data and error are the builder's types: `ClientRequestArgs<Options>`, `InferEndpointReturn<Options>` and `InferEndpointError<Options>` from `@navios/builder` (see the [builder reference](/docs/builder/reference/builder)). `ArgsOf<ClientRequestArgs<Options>, Rest>` is the argument list of a call that takes them.
