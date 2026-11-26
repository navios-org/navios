# Changelog

## [2.0.0-alpha.0] - Unreleased

### Highlights

`@navios/react-query` 2.0 is a rewrite on top of `@navios/builder` 2.0. One object per endpoint carries the hooks, the cache key and the cache helpers; failures are always in React Query's error channel as the endpoint's typed `EndpointError`; and mutations declare what they invalidate and update. Requires `@tanstack/react-query ^5.102.0`.

### Added

- **`keyBy` on `client.query` and `makeQuery`**: choose which inputs identify a cache entry. `false` keeps one entry for the endpoint; `{ urlParams?, params?, data? }` takes `true`, `false` or a list of the fields kept for each part, with names checked against the endpoint's schemas. The inputs left out are shared by everyone using the entry: `use`, `useSuspense`, `fetch`, `prefetch` and `ensure` send them when the call has them (the entry refetches for every component), and a call without them uses the values sent last. A request overtaken by new values is made again, so the entry never shows a result for values nobody holds; a failed or cancelled one leaves the entry for the values it had. The options a call returns, `key`, `invalidate`, `getData` and `setData` take only the inputs that identify the entry. Shared entries carry a `{ keyBy }` key segment (the rule as a string, e.g. `'params:false'`), so they never mix with a declaration of the same endpoint without one or with another rule. New types: `KeyBy`, `AnyKeyBy`, `SendArgs`, `KeyedArgs`, `PartialKeyedInputs`, `ArgsOf`; `QueryObject` and `QuerySettings` take a `TKeyBy` type parameter. `react` (`^18 || ^19`) is now a declared peer dependency.
- **TanStack options on a query declaration**: `client.query`, `client.infiniteQuery`, `makeQuery` and `makeInfiniteQuery` accept `useQuery` / `useInfiniteQuery` options (`staleTime`, `gcTime`, `refetchOnWindowFocus`, `retry`, `placeholderData`, `meta`, ...) next to the key options. Every use of the query gets them, under the options of a call site; `fetch`, `prefetch` and `ensure` use those that apply outside a component. `select`, `initialData` and `initialDataUpdatedAt` stay at the call site. New types: `QueryDefaults`, `QuerySettings`, `InfiniteQueryDefaults`.
- **Shared error schemas of the builder**: `declareClient({ api })` takes the type of `builder({ errorSchema })`, so inline declarations have the same typed errors as endpoints declared on the builder. `ClientOptions` and `ClientInstance` take it as a type parameter, `{}` by default.
- **Client `defaults` compose with each declaration's key segments**: a query's or mutation's own `keyPrefix` / `keySuffix` are added after the client's `defaults` instead of replacing them, so `[...defaults.keyPrefix, ...keyPrefix, method, url, ...defaults.keySuffix, ...keySuffix]`.
- **Mocking through `@navios/builder/mock`**: query, infinite query and mutation objects can be passed to `mocks.on(...)` as they are.
- **Typed errors in the error channel**: queries and mutations call the throwing form of the endpoint, so `query.error`, `mutation.error`, `onError` and error boundaries receive the endpoint's `EndpointError`. Narrow with `error.kind` and `error.status`; `error.body` is typed from `errorSchema`.
- **`query.use(args | skipToken, options)` / `query.useSuspense(args, options)`** accept every TanStack option except `queryKey` / `queryFn` (`enabled`, `staleTime`, `select`, ...). `skipToken` disables a query until its inputs are known.
- **`query.key(args?)`**: no args is the prefix of every entry of the endpoint, partial args the prefix of the matching entries, full args the exact key. Keys are tagged with the data and error types.
- **Cache helpers on every query and infinite query**: `fetch`, `prefetch` (never rejects), `ensure` (cached data however stale, else fetch), `getData`, `setData`, `invalidate(queryClient, args?, filters?)`. `fetch` / `prefetch` / `ensure` are built on TanStack's `queryClient.query()` / `queryClient.infiniteQuery()`, since `fetchQuery`, `prefetchQuery` and `ensureQueryData` are deprecated upstream.
- **`query.endpoint` / `mutation.endpoint`**: the endpoint handler behind the object.
- **`invalidates` mutation setting**: query objects (whole endpoint) or `(data, variables) => key` functions, invalidated after a successful mutation.
- **`optimistic` mutation setting**: `(update) => update(query, { args, update, rollbackOnError?, invalidateOnSettled? })`, or an array of such updates. `args` is required when the target query has required inputs. Cancels in-flight fetches, snapshots, applies the update, rolls back on failure and invalidates on settle.
- **`mutation.mutationKey`** on every mutation (`[...keyPrefix, method, url, ...keySuffix]`) and **`mutation.useIsMutating({ urlParams? })`** to track mutations for specific URL params.
- **Mutation callback context** includes TanStack's `{ client, meta, mutationKey }`; the `QueryClient` is `context.client`.
- **Any TanStack mutation option** (`retry`, `scope`, `meta`, `gcTime`, ...) is accepted by `client.mutation`.
- **`setHttpClient(queryClient, client)` / `getHttpClient(queryClient)`**: bind an HTTP client to a `QueryClient`. Every query, infinite query and mutation run through that `QueryClient` uses it instead of the builder's shared client — the per-request client for SSR (cookies, auth).
- **Non-JSON endpoints** (`response: 'blob' | 'text' | 'stream' | 'void'`) and multipart endpoints (`body: 'multipart'`) work with `client.query` and `client.mutation`.
- **Standalone factories** `makeQuery(endpoint, keyOptions?)`, `makeInfiniteQuery(endpoint, settings)`, `makeMutation(endpoint, settings?)`.
- **`withResponse: true`** on `client.query`, `client.infiniteQuery` and `client.mutation` (inline or in the options argument): data is delivered as `{ data, response: { status, statusText, headers } }` (`DataWithResponse<Data>`). `headers` is a plain record with lower-cased names, so the value is serializable for SSR dehydration and persistence. Such queries live under their own cache key, marked `'with-response'`; failures still go to the error channel. New types: `DataWithResponse`, `MaybeWithResponse`, `SurfaceOptions`.
- **Any Standard Schema library**: endpoints declared with Valibot, ArkType or another Standard Schema v1 library work with every client method, as in `@navios/builder`; so does the builder's per-status `responses` option.

### Changed

- **Optimistic rollback** restores the right value when the entry was empty before the mutation and when several mutations overlap on one entry.
- **Cache keys tell non-plain inputs apart**: `URLSearchParams`, `FormData`, `File`, `Blob`, `Map`, `Set` and `bigint` are keyed by content instead of collapsing to one entry.
- **Query options work with `useQueries` and `useSuspenseQueries`**, with the endpoint's typed error.

- **Unknown options are compile errors** on inline `client.query`, `client.infiniteQuery` and `client.mutation` declarations, so removed options such as `unwrap` and `useKey` are reported by the compiler.

- **`declareClient({ api, defaults })` returns `{ query, infiniteQuery, mutation }`.** Each method accepts an inline endpoint declaration or an existing endpoint handler (with options as the second argument).
- **Cache key shape** is now `[...keyPrefix, method, urlTemplate, ...keySuffix, 'with-response'?, 'infinite'?, { keyBy }?, inputs?]` with `inputs = { urlParams?, params?, data? }`. The method and the request body are part of the key, URL param values are stringified, empty parts are dropped, and infinite queries have their own entries. **Every key changed: persisted caches from 1.x must be discarded.**
- **`invalidate(queryClient, args?, filters?)`** returns the promise directly and covers three scopes: whole endpoint (no args), partial args, and one entry (`{ exact: true }`).
- **Mutation hooks take no arguments.** URL params are always passed to `mutate`.
- **Mutation callbacks** receive the merged context as their last argument: `onMutate(variables, context)`, `onSuccess(data, variables, context)`, `onError(error, variables, context)`, `onSettled(data, error, variables, context)`; the value returned from `onMutate` is `context.onMutateResult`.
- **Infinite queries**: the page param is merged over the call's `params`; the first page param defaults to the call's `params`, exactly as passed and not run through `querySchema` (`initialPageParam` is optional). `getNextPageParam(lastPage, allPages, lastPageParam, allPageParams)` returns query params or `undefined`.
- **Peer dependency**: `@tanstack/react-query ^5.102.0`.

### Removed

- **`client.multipartMutation`** — use `client.mutation` with an endpoint declared with `body: 'multipart'`.
- **`client.queryFromEndpoint`, `client.mutationFromEndpoint`, `client.infiniteQueryFromEndpoint`** — pass the endpoint to `client.query`, `client.mutation`, `client.infiniteQuery`.
- **`useDiscriminatorResponse` support and the `UseDiscriminator` generic** — errors are never returned as data; read them from the error channel.
- **`onFail`** on every helper — register `onError` on the builder, or use the mutation's `onError`.
- **`processResponse`** on every helper — use TanStack's `select` on the hook call; transform mutation results in `onSuccess` or at the call site.
- **`query.queryKey` (`dataTag`, `filterKey`, `bindToUrl`, `template`) and `queryKeyCreator`** — use `query.key(args?)`.
- **`query.invalidateAll`** — use `query.invalidate` with no or partial args.
- **`useKey`** and the `mutation({ urlParams })` hook argument — every mutation has a `mutationKey`; use `mutation.useIsMutating({ urlParams })`.
- **`createOptimisticUpdate`, `createMultiOptimisticUpdate`** — use the `optimistic` setting.
- **`createPrefetchHelper`, `createPrefetchHelpers`, `prefetchAll`** — use `query.prefetch` / `query.ensure` / `query.fetch`.
- **`makeQueryOptions`, `makeInfiniteQueryOptions`** — use `makeQuery`, `makeInfiniteQuery`.
- **Types** `AbstractEndpoint`, `ClientEndpointHelper`, `EndpointHelper`, `StreamHelper`, `ComputeBaseResult`, `ComputeQueryResult`, `ComputeInfinitePageResult`, `ResponseDataType`.

### Migration

Errors:

```diff
- const api = builder({ useDiscriminatorResponse: true })
- const { data } = getUser.use({ urlParams: { userId } })
- if ('message' in data) showError(data.message)
+ const api = builder({ client })
+ const { data, error } = getUser.use({ urlParams: { userId } })
+ if (error?.kind === 'http' && error.status === 404) showError(error.body.message)
```

From-endpoint methods and `processResponse`:

```diff
- const getUser = client.queryFromEndpoint(getUserEndpoint, {
-   processResponse: (data) => data.name,
- })
- const name = getUser.useSuspense({ urlParams: { userId } })
+ const getUser = client.query(getUserEndpoint)
+ const { data: name } = getUser.useSuspense(
+   { urlParams: { userId } },
+   { select: (user) => user.name },
+ )
```

Uploads:

```diff
- const uploadAvatar = client.multipartMutation({
-   method: 'POST',
-   url: '/users/$userId/avatar',
-   requestSchema: z.object({ file: z.instanceof(File) }),
-   responseSchema: avatarSchema,
- })
+ const uploadAvatar = client.mutation({
+   method: 'POST',
+   url: '/users/$userId/avatar',
+   body: 'multipart',
+   requestSchema: z.object({ file: z.instanceof(File) }),
+   responseSchema: avatarSchema,
+ })
```

Downloads:

```diff
- const downloadFileEndpoint = api.declareStream({ method: 'GET', url: '/files/$fileId' })
- const downloadFile = client.mutationFromEndpoint(downloadFileEndpoint)
+ const downloadFile = client.mutation({ method: 'GET', url: '/files/$fileId', response: 'blob' })
```

Keys and invalidation:

```diff
- const key = getUser.queryKey.dataTag({ urlParams: { userId } })
- await getUser.invalidateAll(queryClient, { urlParams: { userId } })
- await queryClient.invalidateQueries({ queryKey: ['users'] })
+ const key = getUser.key({ urlParams: { userId } })
+ await getUser.invalidate(queryClient, { urlParams: { userId } })
+ await listUsers.invalidate(queryClient)
```

Mutation context and invalidation after success:

```diff
  const updateUser = client.mutation({
    method: 'PATCH',
    url: '/users/$userId',
    requestSchema: updateUserSchema,
    responseSchema: userSchema,
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

Scoped mutations:

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

Optimistic updates:

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

Prefetching:

```diff
- const userPrefetch = createPrefetchHelper(getUser)
- await userPrefetch.prefetch(queryClient, { urlParams: { userId } })
- const user = await userPrefetch.ensureData(queryClient, { urlParams: { userId } })
+ await getUser.prefetch(queryClient, { urlParams: { userId } })
+ const user = await getUser.ensure(queryClient, { urlParams: { userId } })
```

Infinite queries:

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

Persisted caches: every cache key changed shape. Discard caches persisted by 1.x (for example by changing the persister's `buster`).

## [1.0.1] - 2026-01-09

### Fixed

- **Fixed `mutationFromEndpoint` with stream endpoints** - Stream endpoints created with `api.declareStream()` now work correctly with `mutationFromEndpoint`. Previously, passing a `StreamHandler` to `mutationFromEndpoint` resulted in a `never` return type due to incorrect type inference when accessing config properties. The fix simplifies the helper type resolution by passing the config directly to `EndpointHelper` and `StreamHelper` instead of reconstructing the object type.

  ```typescript
  const downloadFile = api.declareStream({
    method: 'GET',
    url: '/files/$fileId/download',
  })

  // Now works correctly - returns UseMutationResult<Blob, ...>
  const useDownloadFile = client.mutationFromEndpoint(downloadFile)
  ```

## [1.0.0] - 2026-01-08

### Highlights

This is the first stable release of `@navios/react-query`. It includes major improvements to type safety, new helpers for common patterns like optimistic updates and SSR prefetching, and full support for discriminated union error handling.

### Changed

- **Optimistic Update Helpers Marked Experimental**: `createOptimisticUpdate` and `createMultiOptimisticUpdate` are now marked as `@experimental`. These APIs may change in future versions - use manual optimistic update patterns for production code until these helpers stabilize.

## [1.0.0-alpha.1] - 2026-01-07

### Highlights

This was a pre-release version of `@navios/react-query`.

### Breaking Changes

- **Type file reorganization** - Client types have been split into modular files for better maintainability:
  - `client/types.mts` → Split into `client/types/query.mts`, `client/types/mutation.mts`, `client/types/infinite-query.mts`, `client/types/multipart-mutation.mts`, `client/types/from-endpoint.mts`, and `client/types/helpers.mts`
  - If you were importing internal types directly, update your imports to use the new paths or the re-exported types from the main entry point.

### Added

#### Error Schema Support (Discriminated Union Mode)

Full support for `errorSchema` in queries and mutations when using `useDiscriminatorResponse: true` mode. API error responses are now returned as data (not thrown) and can be discriminated by status code:

```typescript
const api = builder({ useDiscriminatorResponse: true })

const getUser = client.query({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
  errorSchema: {
    400: z.object({ error: z.string(), code: z.number() }),
    404: z.object({ notFound: z.literal(true) }),
  },
  processResponse: (data) => {
    // data is typed as: User | { error: string, code: number } | { notFound: true }
    if ('error' in data) {
      return { ok: false, error: data.error }
    }
    if ('notFound' in data) {
      return { ok: false, error: 'User not found' }
    }
    return { ok: true, user: data }
  },
})
```

#### SSR/RSC Prefetch Helpers

New `createPrefetchHelper` and `createPrefetchHelpers` utilities for server-side rendering and React Server Components:

```typescript
import { createPrefetchHelper, prefetchAll } from '@navios/react-query'
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'

// Create prefetch helper from query
const userPrefetch = createPrefetchHelper(getUser)

// Server Component
async function UserPage({ userId }: { userId: string }) {
  const queryClient = new QueryClient()

  await userPrefetch.prefetch(queryClient, { urlParams: { userId } })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <UserProfile userId={userId} />
    </HydrationBoundary>
  )
}
```

**Prefetch helper methods:**

- `prefetch(queryClient, params)` - Prefetch data on the server
- `ensureData(queryClient, params)` - Ensure data exists, returns the data
- `getQueryOptions(params)` - Get raw query options for customization
- `prefetchMany(queryClient, paramsList)` - Prefetch multiple queries in parallel

**Batch prefetching:**

```typescript
// Create multiple prefetch helpers at once
const prefetchers = createPrefetchHelpers({
  user: getUser,
  posts: getUserPosts,
})

// Or use prefetchAll for different queries
await prefetchAll(queryClient, [
  { helper: userPrefetch, params: { urlParams: { userId } } },
  {
    helper: postsPrefetch,
    params: { urlParams: { userId }, params: { limit: 10 } },
  },
])
```

#### Optimistic Update Helpers

New `createOptimisticUpdate` and `createMultiOptimisticUpdate` utilities for type-safe optimistic updates:

```typescript
import { createMultiOptimisticUpdate, createOptimisticUpdate } from '@navios/react-query'

const updateUser = client.mutation({
  method: 'PATCH',
  url: '/users/$userId',
  requestSchema: updateUserSchema,
  responseSchema: userSchema,
  processResponse: (data) => data,
  useContext: () => ({ queryClient: useQueryClient() }),
  ...createOptimisticUpdate({
    queryKey: ['users', userId],
    updateFn: (oldData, variables) => ({
      ...oldData,
      ...variables.data,
    }),
    rollbackOnError: true, // default
    invalidateOnSettled: true, // default
  }),
})
```

**Multi-query optimistic updates:**

```typescript
const updateUser = client.mutation({
  // ...
  ...createMultiOptimisticUpdate([
    {
      queryKey: ['users', userId],
      updateFn: (oldData, variables) => ({ ...oldData, ...variables.data }),
    },
    {
      queryKey: ['users'],
      updateFn: (oldList, variables) =>
        (oldList ?? []).map((u) => (u.id === userId ? { ...u, ...variables.data } : u)),
    },
  ]),
})
```

#### New Type Exports

- `ComputeBaseResult<UseDiscriminator, Response, ErrorSchema>` - Compute result type based on discriminator mode
- `PrefetchHelper<TParams, TData, TError>` - Type for prefetch helper instances
- `QueryOptionsCreator<TParams, TData, TError>` - Type for query options creator functions
- `OptimisticUpdateConfig<TData, TVariables, TQueryData>` - Configuration for optimistic updates
- `OptimisticUpdateCallbacks<TData, TVariables, TQueryData>` - Return type from `createOptimisticUpdate`

### Changed

- **Improved type inference** - Better type inference for `processResponse` callbacks, especially when using `errorSchema`
- **Modular type definitions** - Client types are now organized into separate files by concern:
  - `types/query.mts` - Query-related types
  - `types/mutation.mts` - Mutation-related types
  - `types/infinite-query.mts` - Infinite query types
  - `types/multipart-mutation.mts` - Multipart mutation types
  - `types/from-endpoint.mts` - Types for `*FromEndpoint` methods
  - `types/helpers.mts` - Helper types like `EndpointHelper`, `StreamHelper`, `ComputeBaseResult`

### Fixed

- Fixed package.json exports to use correct CommonJS file extensions (`.cjs` and `.d.cts`)

## [0.7.0] - 2025-12-18

### Fixed

- **Fixed `mutationFromEndpoint` callback signatures** - The `mutationFromEndpoint` method now uses the correct callback signature `(data, variables, context)` instead of the deprecated `(queryClient, data, variables, context)`. This makes it consistent with the main `mutation` API introduced in 0.6.0.

  **Before:**

  ```typescript
  client.mutationFromEndpoint(endpoint, {
    onSuccess: (queryClient, data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })
  ```

  **After:**

  ```typescript
  client.mutationFromEndpoint(endpoint, {
    useContext: () => {
      const queryClient = useQueryClient()
      return { queryClient }
    },
    onSuccess: (data, variables, context) => {
      context.queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })
  ```

### Added

- **Documentation improvements** - Added comprehensive documentation for:
  - `onFail` callback for query error handling
  - `defaults` option in `declareClient` for setting default `keyPrefix` and `keySuffix`
  - `keyPrefix` and `keySuffix` options for query/mutation key customization
  - Examples for `queryFromEndpoint` and `infiniteQueryFromEndpoint`
  - Query helper methods documentation

## [0.6.0] - Dec 13, 2025

### Breaking Changes

- **Mutation callback signatures changed** - The `onSuccess`, `onError`, `onMutate`, and `onSettled` callbacks now use a unified context-based signature instead of receiving `queryClient` as the first parameter:

  **Before (0.5.x):**

  ```typescript
  const mutation = client.mutation({
    onSuccess: (queryClient, data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (queryClient, error, variables) => {
      console.error(error)
    },
  })
  ```

  **After (0.6.0):**

  ```typescript
  const mutation = client.mutation({
    onSuccess: (data, variables, context) => {
      // Access queryClient via useContext if needed
      context.queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (error, variables, context) => {
      console.error(error)
    },
    onMutate: (variables, context) => {
      // Return value is available in other callbacks as context.onMutateResult
      return { previousData: context.queryClient.getQueryData(['users']) }
    },
    onSettled: (data, error, variables, context) => {
      // Called on both success and error
      // context.onMutateResult contains the return value from onMutate
    },
    useContext: () => {
      const queryClient = useQueryClient()
      return { queryClient }
    },
  })
  ```

- **New `TOnMutateResult` type parameter** - `MutationParams` now includes a `TOnMutateResult` generic for typing the return value of `onMutate`, which is passed to other callbacks via `context.onMutateResult`.

### Added

- **`onMutate` callback** - Called before the mutation executes. The return value is available in `onSuccess`, `onError`, and `onSettled` callbacks via `context.onMutateResult`. This enables optimistic updates pattern.

- **`onSettled` callback** - Called after the mutation completes (success or failure). Receives `data` (undefined on error), `error` (null on success), `variables`, and `context`.

- **`MutationFunctionContext` integration** - All callbacks now receive TanStack Query's `MutationFunctionContext` merged with your custom context, providing access to `mutationId` and `meta`.

- **Stream mutation support** - `mutationFromEndpoint` now supports stream endpoints created with `api.declareStream()`. This enables file downloads and other blob responses in mutations.

  ```typescript
  const downloadFile = api.declareStream({
    method: 'GET',
    url: '/files/$id/download',
  })

  const useDownloadFile = client.mutationFromEndpoint(downloadFile, {
    onSuccess: (blob, variables, context) => {
      const url = URL.createObjectURL(blob)
      window.open(url)
    },
  })
  ```

- **New `StreamHelper` type** - Helper type that attaches stream endpoint to mutation results, similar to `EndpointHelper` for regular endpoints.

### Changed

- **`processResponse` is now optional** - For both regular mutations and stream mutations, `processResponse` defaults to an identity function when not provided. This is particularly useful for stream mutations where you often just want the raw `Blob`.

## [0.5.1] - Dec 13, 2025

### Fixed

- **Fixed type errors** - Fixed type errors with mutations.

## [0.5.0] - Dec 13, 2025

### Breaking Changes

None. All existing exports remain available through backwards-compatibility aliases.

### Added

- **New modular package structure** - Code is now organized into domain-specific modules:
  - `client/` - Client declaration and instance types
  - `query/` - Query options, key creation, and related types
  - `mutation/` - Mutation hooks, key creation, and related types
  - `common/` - Shared types used across modules

- **New type exports:**
  - `EndpointHelper` - Helper type that attaches endpoint to query/mutation results
  - `QueryArgs` - Arguments for query functions
  - `QueryUrlParamsArgs` - URL params arguments for invalidateAll operations
  - `QueryParams` - Base parameters for query configuration
  - `QueryKeyCreatorResult` - Result type from query key creator
  - `QueryHelpers` - Helper methods attached to query options
  - `InfiniteQueryOptions` - Options for infinite query configuration
  - `MutationArgs` - Arguments for mutation functions
  - `MutationHelpers` - Helper methods attached to mutation hooks
  - `MutationParams` - Base parameters for mutation configuration
  - `Split` - Utility type for parsing URL paths into segments
  - `ProcessResponseFunction` - Function type for processing API responses
  - `ClientOptions` - Options for creating a client instance

- **Renamed functions with cleaner API:**
  - `createQueryKey` - Creates query key generators (replaces `queryKeyCreator`)
  - `createMutationKey` - Creates mutation key generators (replaces `mutationKeyCreator`)

### Changed

- **Internal reorganization** - Files restructured from flat layout to domain-based modules:
  - `declare-client.mts` → `client/declare-client.mts`
  - `make-mutation.mts` → `mutation/make-hook.mts`
  - `make-query-options.mts` → `query/make-options.mts`
  - `make-infinite-query-options.mts` → `query/make-infinite-options.mts`
  - `utils/query-key-creator.mts` → `query/key-creator.mts`
  - `utils/mutation-key.creator.mts` → `mutation/key-creator.mts`
  - `types/client-instance.mts` → `client/types.mts`

- **Consolidated type definitions** - Types previously scattered across multiple files in `types/` are now co-located with their related functionality

### Deprecated

The following exports are deprecated and will be removed in a future major version:

- `queryKeyCreator` → Use `createQueryKey` instead
- `mutationKeyCreator` → Use `createMutationKey` instead
- `ClientEndpointHelper` → Use `EndpointHelper` instead
- `ClientQueryArgs` → Use `QueryArgs` instead
- `ClientQueryUrlParamsArgs` → Use `QueryUrlParamsArgs` instead
- `BaseQueryParams` → Use `QueryParams` instead
- `BaseQueryArgs` → Use `QueryArgs` instead
- `ClientMutationArgs` → Use `MutationArgs` instead
- `BaseMutationParams` → Use `MutationParams` instead
- `BaseMutationArgs` → Use `NaviosZodRequest` from `@navios/builder` instead

### Removed

- Internal `types/` directory structure (replaced by domain-specific type files)
- `types/client-endpoint-helper.mts`
- `types/mutation-args.mts`
- `types/mutation-helpers.mts`
- `types/query-args.mts`
- `types/query-helpers.mts`
- `types/query-url-params-args.mts`
- `types/index.mts`
- `types.mts` (root types file)
