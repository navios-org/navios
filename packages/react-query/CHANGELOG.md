# Changelog

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
