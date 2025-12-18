# Changelog

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
