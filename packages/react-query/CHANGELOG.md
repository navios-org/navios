# Changelog

## [1.0.0-alpha.1] - 2026-01-07

### Highlights

This is the first stable release of `@navios/react-query`. It includes major improvements to type safety, new helpers for common patterns like optimistic updates and SSR prefetching, and full support for discriminated union error handling.

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
import {
  createMultiOptimisticUpdate,
  createOptimisticUpdate,
} from '@navios/react-query'

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
        (oldList ?? []).map((u) =>
          u.id === userId ? { ...u, ...variables.data } : u,
        ),
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
