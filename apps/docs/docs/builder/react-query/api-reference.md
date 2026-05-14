---
sidebar_position: 3
---

# API Reference

Complete API reference for `@navios/react-query`.

## declareClient

Creates a client instance for type-safe queries and mutations.

```typescript
function declareClient(options: ClientOptions): ClientInstance
```

### Parameters

- `options.api`: `BuilderInstance` - The configured API builder
- `options.defaults` (optional): Default options
  - `keyPrefix?: string[]` - Prefix added to all query/mutation keys
  - `keySuffix?: string[]` - Suffix added to all query/mutation keys

### Returns

A `ClientInstance` with methods to create queries and mutations.

### Example

```typescript
const client = declareClient({
  api,
  defaults: {
    keyPrefix: ['api', 'v1'],
    keySuffix: ['cache'],
  },
})
```

## ClientInstance Methods

### query

Creates a query from either an inline config or a pre-declared endpoint handler.

```typescript
client.query<Config>(config: QueryConfig): QueryHelpers
client.query<Endpoint>(endpoint: Endpoint, options?: QueryOptions): QueryHelpers
```

**Config Options:**

- `method`: HTTP method
- `url`: Endpoint URL
- `responseSchema`: Zod schema for response
- `querySchema?`: Zod schema for query parameters
- `requestSchema?`: Zod schema for request body
- `result?`: `'data' | 'envelope'` — endpoint return shape
- `unwrap?`: `'none' | 'throw-on-error'` — how envelopes flow into TanStack Query
- `validateResponse?`: skip runtime parse when `false`

**Returns:** Query helpers with `use()`, `useSuspense()`, `invalidate()`, etc. Read-side projections are passed per-call via `select` on `use` / `useSuspense`, not on the config.

The dedicated `client.query` method was removed in v2 — pass an endpoint handler as the first argument to `client.query` instead.

### infiniteQuery

Creates an infinite query for paginated data. Accepts either an inline config or a pre-declared endpoint.

```typescript
client.infiniteQuery<Config>(config: InfiniteQueryConfig): InfiniteQueryHelpers
client.infiniteQuery<Endpoint>(endpoint: Endpoint, options: InfiniteQueryOptions): InfiniteQueryHelpers
```

**Additional Options:**

- `getNextPageParam`: Extract next page parameter
- `getPreviousPageParam?`: Extract previous page parameter
- `initialPageParam`: Initial page parameter
- `unwrap?`: `'none' | 'throw-on-error' | 'pages'` — infinite-query envelope handling

The dedicated `client.infiniteQuery` method was removed in v2.

### mutation

Creates a mutation for data modification. Accepts either an inline config, a pre-declared endpoint, or a pre-declared stream endpoint (for file downloads).

```typescript
client.mutation<Config>(config: MutationConfig): MutationHelpers
client.mutation<Endpoint>(endpoint: Endpoint, options?: MutationOptions): MutationHelpers
```

**Config Options:**

- `method`: HTTP method
- `url`: Endpoint URL
- `requestSchema?`: Zod schema for request body
- `responseSchema?`: Zod schema for response
- `querySchema?`: Zod schema for query parameters
- `result?`: `'data' | 'envelope'`
- `unwrap?`: `'none' | 'throw-on-error'`
- `validateResponse?`: skip runtime parse when `false`
- `useContext?`: Provide context to callbacks
- `onMutate?`: Called before mutation
- `onSuccess?`: Called on success (transform response data here if needed)
- `onError?`: Called on error
- `onSettled?`: Called on completion
- `useKey?`: Enable mutation key scoping

The dedicated `client.mutation` method was removed in v2.

### multipart

Creates a mutation for file uploads. (Renamed from `client.multipart` in v2.)

```typescript
client.multipart<Config>(config: MultipartConfig): MutationHelpers
```

Same options as `mutation`, but automatically handles `FormData` conversion.

## Query Helpers

### use

Returns a query result object.

```typescript
query.use(params: QueryArgs): UseQueryResult
```

**Returns:**

- `data`: Query data
- `isLoading`: Initial load state
- `isFetching`: Any fetch state
- `error`: Error object
- `refetch`: Refetch function
- And all other TanStack Query properties

### useSuspense

Returns data directly (throws on loading/error).

```typescript
query.useSuspense(params: QueryArgs): UseSuspenseQueryResult
```

### invalidate

Invalidate a specific query.

```typescript
query.invalidate(queryClient: QueryClient, params: QueryArgs): () => Promise<void>
```

### invalidateAll

Invalidate all matching queries.

```typescript
query.invalidateAll(queryClient: QueryClient, params: QueryUrlParamsArgs): () => Promise<void>
```

### queryKey

Query key utilities.

```typescript
query.queryKey.dataTag(params: QueryArgs): QueryKey
query.queryKey.filterKey(params: QueryUrlParamsArgs): QueryKey
query.queryKey.bindToUrl(params: QueryUrlParamsArgs): string
```

## Mutation Helpers

### Hook Usage

```typescript
mutation(): UseMutationResult
mutation(urlParams: UrlParams): UseMutationResult // When useKey is enabled
```

**Returns:**

- `mutate`: Fire and forget mutation
- `mutateAsync`: Promise-based mutation
- `isPending`: Mutation in progress
- `isError`: Mutation failed
- `isSuccess`: Mutation succeeded
- `data`: Response data
- `error`: Error object
- `reset`: Reset mutation state

### useIsMutating

Check if mutation is in progress (when `useKey` is enabled).

```typescript
mutation.useIsMutating(): number // Global count
mutation.useIsMutating(urlParams: UrlParams): boolean // Specific item
```

### mutationKey

Get mutation key.

```typescript
mutation.mutationKey(): MutationKey // When useKey is false
mutation.mutationKey(urlParams: UrlParams): MutationKey // When useKey is true
```

## Prefetch Helpers

### createPrefetchHelper

Creates a prefetch helper for SSR/RSC usage.

```typescript
function createPrefetchHelper<TParams, TData, TError>(
  queryOptionsCreator: QueryOptionsCreator<TParams, TData, TError>
): PrefetchHelper<TParams, TData, TError>
```

**Returns:** `PrefetchHelper` with methods:

- `prefetch(queryClient, params)` - Prefetch data
- `ensureData(queryClient, params)` - Ensure data exists, returns data
- `getQueryOptions(params)` - Get raw query options
- `prefetchMany(queryClient, paramsList)` - Prefetch multiple in parallel

### createPrefetchHelpers

Creates multiple prefetch helpers from a record of queries.

```typescript
function createPrefetchHelpers<T extends Record<string, QueryOptionsCreator<any, any, any>>>(
  queries: T
): { [K in keyof T]: PrefetchHelper<...> }
```

### prefetchAll

Prefetch multiple queries from different helpers in parallel.

```typescript
function prefetchAll(
  queryClient: QueryClient,
  prefetches: Array<{ helper: PrefetchHelper<any, any, any>; params: unknown }>
): Promise<void>
```

## Optimistic Update Helpers

### createOptimisticUpdate

Creates type-safe optimistic update callbacks.

```typescript
function createOptimisticUpdate<TData, TVariables, TQueryData>(
  config: OptimisticUpdateConfig<TData, TVariables, TQueryData>
): OptimisticUpdateCallbacks<TData, TVariables, TQueryData>
```

**Config Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `queryKey` | `readonly unknown[]` | Required | Query key to update |
| `updateFn` | `(oldData, variables) => newData` | Required | Compute new cache value |
| `rollbackOnError` | `boolean` | `true` | Rollback on error |
| `invalidateOnSettled` | `boolean` | `true` | Invalidate after mutation |

### createMultiOptimisticUpdate

Creates optimistic update callbacks for multiple query keys.

```typescript
function createMultiOptimisticUpdate<TData, TVariables>(
  configs: Array<OptimisticUpdateConfig<TData, TVariables, unknown>>
): OptimisticUpdateCallbacks<TData, TVariables, Map<string, unknown>>
```

## Types

### QueryConfig

```typescript
interface QueryConfig {
  method: HttpMethod
  url: string
  responseSchema: ZodType
  querySchema?: ZodType
  requestSchema?: ZodType
  errorSchema?: ErrorSchemaRecord
  result?: 'data' | 'envelope'
  unwrap?: 'none' | 'throw-on-error'
  validateResponse?: boolean
}
```

Read-side projections are passed per-call as `select` to `use(params, { select })` / `useSuspense(params, { select })`. The endpoint-level `processResponse` was removed in v2.

### MutationConfig

```typescript
interface MutationConfig {
  method: HttpMethod
  url: string
  requestSchema?: ZodType
  responseSchema?: ZodType
  querySchema?: ZodType
  errorSchema?: ErrorSchemaRecord
  result?: 'data' | 'envelope'
  unwrap?: 'none' | 'throw-on-error'
  validateResponse?: boolean
  useContext?: () => any
  onMutate?: (variables: any, context: any) => any
  onSuccess?: (data: any, variables: any, context: any) => void
  onError?: (error: any, variables: any, context: any) => void
  onSettled?: (data: any, error: any, variables: any, context: any) => void
  useKey?: boolean
}
```

Transform mutation responses inside `onSuccess` or in the caller — mutations have no read-side `select`.

### InfiniteQueryConfig

```typescript
interface InfiniteQueryConfig extends QueryConfig {
  getNextPageParam: (lastPage: any, allPages: any[]) => any
  getPreviousPageParam?: (firstPage: any, allPages: any[]) => any
  initialPageParam: any
}
```

### ErrorSchemaRecord

```typescript
type ErrorSchemaRecord = {
  [statusCode: number]: ZodType
}
```

### PrefetchHelper

```typescript
interface PrefetchHelper<TParams, TData, TError = Error> {
  prefetch: (queryClient: QueryClient, params: TParams) => Promise<void>
  ensureData: (queryClient: QueryClient, params: TParams) => Promise<TData>
  getQueryOptions: (params: TParams) => FetchQueryOptions<TData, TError, TData, QueryKey>
  prefetchMany: (queryClient: QueryClient, paramsList: TParams[]) => Promise<void>
}
```

### OptimisticUpdateConfig

```typescript
interface OptimisticUpdateConfig<TData, TVariables, TQueryData> {
  queryKey: readonly unknown[]
  updateFn: (oldData: TQueryData | undefined, variables: TVariables) => TQueryData
  rollbackOnError?: boolean
  invalidateOnSettled?: boolean
}
```

### ComputeResult

Unified result-type computer that picks the right return shape from the endpoint's `Options` and the surface's `Unwrap` mode.

```typescript
type ComputeResult<Options extends EndpointOptions, Unwrap extends UnwrapMode>
```

This replaces the v1 helpers `ComputeBaseResult`, `ComputeQueryResult`, and `ComputeInfinitePageResult`, which were removed alongside the `UseDiscriminator` generic.

## See Also

- [Getting Started](/docs/builder/react-query/getting-started) - Quick start guide
- [Queries](/docs/builder/react-query/guides/queries) - Query usage
- [Mutations](/docs/builder/react-query/guides/mutations) - Mutation usage
- [SSR & Prefetching](/docs/builder/react-query/advanced/ssr-prefetch) - Server-side rendering
- [Error Schemas](/docs/builder/react-query/advanced/error-schemas) - Error handling with discriminator mode
- [Best Practices](/docs/builder/react-query/best-practices) - Best practices and patterns

