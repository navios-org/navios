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

Creates a query with inline configuration.

```typescript
client.query<Config>(config: QueryConfig): QueryHelpers
```

**Config Options:**

- `method`: HTTP method
- `url`: Endpoint URL
- `responseSchema`: Zod schema for response
- `querySchema?`: Zod schema for query parameters
- `requestSchema?`: Zod schema for request body
- `processResponse`: Transform response data

**Returns:** Query helpers with `use()`, `useSuspense()`, `invalidate()`, etc.

### queryFromEndpoint

Creates a query from a pre-declared endpoint.

```typescript
client.queryFromEndpoint<Endpoint>(endpoint: Endpoint, options?: QueryOptions): QueryHelpers
```

### infiniteQuery

Creates an infinite query for paginated data.

```typescript
client.infiniteQuery<Config>(config: InfiniteQueryConfig): InfiniteQueryHelpers
```

**Additional Options:**

- `getNextPageParam`: Extract next page parameter
- `getPreviousPageParam?`: Extract previous page parameter
- `initialPageParam`: Initial page parameter

### infiniteQueryFromEndpoint

Creates an infinite query from a pre-declared endpoint.

```typescript
client.infiniteQueryFromEndpoint<Endpoint>(endpoint: Endpoint, options: InfiniteQueryOptions): InfiniteQueryHelpers
```

### mutation

Creates a mutation for data modification.

```typescript
client.mutation<Config>(config: MutationConfig): MutationHelpers
```

**Config Options:**

- `method`: HTTP method
- `url`: Endpoint URL
- `requestSchema?`: Zod schema for request body
- `responseSchema?`: Zod schema for response
- `querySchema?`: Zod schema for query parameters
- `processResponse?`: Transform response data
- `useContext?`: Provide context to callbacks
- `onMutate?`: Called before mutation
- `onSuccess?`: Called on success
- `onError?`: Called on error
- `onSettled?`: Called on completion
- `useKey?`: Enable mutation key scoping

### mutationFromEndpoint

Creates a mutation from a pre-declared endpoint.

```typescript
client.mutationFromEndpoint<Endpoint>(endpoint: Endpoint, options?: MutationOptions): MutationHelpers
```

### multipartMutation

Creates a mutation for file uploads.

```typescript
client.multipartMutation<Config>(config: MultipartMutationConfig): MutationHelpers
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

## Types

### QueryConfig

```typescript
interface QueryConfig {
  method: HttpMethod
  url: string
  responseSchema: ZodType
  querySchema?: ZodType
  requestSchema?: ZodType
  processResponse: (data: any) => any
}
```

### MutationConfig

```typescript
interface MutationConfig {
  method: HttpMethod
  url: string
  requestSchema?: ZodType
  responseSchema?: ZodType
  querySchema?: ZodType
  processResponse?: (data: any) => any
  useContext?: () => any
  onMutate?: (variables: any, context: any) => any
  onSuccess?: (data: any, variables: any, context: any) => void
  onError?: (error: any, variables: any, context: any) => void
  onSettled?: (data: any, error: any, variables: any, context: any) => void
  useKey?: boolean
}
```

### InfiniteQueryConfig

```typescript
interface InfiniteQueryConfig extends QueryConfig {
  getNextPageParam: (lastPage: any, allPages: any[]) => any
  getPreviousPageParam?: (firstPage: any, allPages: any[]) => any
  initialPageParam: any
}
```

## See Also

- [Getting Started](/docs/builder/react-query/getting-started) - Quick start guide
- [Queries](/docs/builder/react-query/guides/queries) - Query usage
- [Mutations](/docs/builder/react-query/guides/mutations) - Mutation usage
- [Best Practices](/docs/builder/react-query/best-practices) - Best practices and patterns

