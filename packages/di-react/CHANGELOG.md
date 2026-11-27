# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0-alpha.1] - Unreleased

### Added

- **`ServiceHook<K>` and `ServiceHookResults<T>`**: the overloads the service hooks share, as one type. `useService` is a `ServiceHook<'service'>`, `useOptionalService` a `ServiceHook<'optional'>` and `useSuspenseService` a `ServiceHook<'suspense'>`. The hooks are declared as constants of that type; what they accept and return is unchanged.

### Changed

- **Breaking:** `useService` and `useOptionalService` report `isLoading: true` on the first render when the container does not hold the instance yet. That render used to have every flag `false`.
- **Breaking:** `useService` reports an error the container raises while reading the token on the first render (an alias cycle, args that contain themselves, a value that is not a token) in `error`. It used to throw during render.
- **`refetch()` of `useOptionalService`** works like the one of `useService`: it re-renders through `isLoading` and returns `undefined` instead of a promise.

### Fixed

- **Instance destroyed before the hook listened for it**: `useService` and `useOptionalService` returned an instance the container already held on the first render and subscribed to its invalidation in an effect. An invalidation between the two went unnoticed, and the component kept the destroyed instance. The effect now compares what the container holds and resolves again. A resolution subscribes before it asks for the instance, so an invalidation right after it is not missed either; the hook therefore also resolves again from `error` or `isNotFound` when an instance for its token and args is destroyed.
- **`useSuspenseService` and an instance the container already held**: the same gap. The cache entry now listens from the render that created it.
- **`useSuspenseService` cache growth**: a resolved cache entry and its `onInvalidate` listener stayed for the lifetime of the container, one per token and args ever rendered. An entry is dropped one timer turn after the last component that shows it unmounts or changes its args. An entry that was rendered and never mounted, or that is still pending when its component unmounts, stays until the container is collected.
- **Stale instance in `useOptionalService` after an args change**: a resolution for the previous args that finished after the one for the current args replaced its instance.
- **`useOptionalService` after `refetch()`**: an instance it resolved after a failure or `isNotFound` was not subscribed to, so invalidating it did not resolve again.
- **`useSuspenseService` retries after a failure**: a rejected resolution stayed cached for the container, token and args, so resetting the error boundary or mounting the component again threw the same error without another attempt. The error still reaches the error boundary; the next render resolves again. A failure is resolved once per attempt also when the component renders slowly: the entry is dropped two timer turns after the last render that threw.

### Removed

- **Breaking:** the types `UnionToArray` and `Join`. No hook used them, and `UnionToArray` evaluated to `never` for every input.

## [2.0.0-alpha.0] - 2026-11-26

### Fixed

- **`ScopeProvider` under `<StrictMode>`**: The scope survives the unmount and re-mount React simulates in development
  - Disposal now waits one microtask and is cancelled by a re-mount; a real unmount and a `key` change still dispose the scope
  - A provider shown again by `<Activity>` after its scope was disposed starts a new scope
- **Inline args in `useService` and `useOptionalService`**: Args are compared by their JSON form, like `useSuspenseService`, which now tells apart `Map`, `Set`, `RegExp` and `bigint` values
  - An object literal written in the call no longer restarts the hook on every render
  - Changed args still resolve again
- **Stale instance after an args change**: A hook that read its first instance synchronously kept it when the args, token or container changed
- **Extra constructor run on dependency invalidation**: `useService` and `useOptionalService` resolve one microtask after the invalidation event, so a dependent is not constructed against a dependency that is still being destroyed

### Removed

- Development warning about args "that look the same but are different instances": such args are now treated as unchanged

### Documentation

- README: `useContainer()` return type, examples that used `data` before checking it, Standard Schema wording, reserved `metadata.scopeId`, memoization advice

## [1.0.0-alpha.3] - 2026-01-08

### Added

- **Comprehensive Test Suite**: Added unit tests for hooks
  - `use-scope.spec.mts` - Scope hook tests
  - Extended `use-container.spec.mts` with additional test cases

### Fixed

- **Improved Warning Message**: Changed `useService` args instability warning from `console.log` to `console.warn`
  - Better semantic meaning for warning messages
  - Improved message formatting and readability

### Dependencies

- Updated to support `@navios/di` ^1.0.0-alpha.3

## [0.9.0] - 2025-12-23

### Breaking Changes

- **BREAKING**: Removed `useInvalidate` hook
  - This hook relied on the `ServiceLocator` API which was removed in `@navios/di` 0.9.0
  - **Migration**: Use `useInvalidateInstance` instead, which invalidates by instance reference
  - Alternative: Use `container.invalidate(instance)` directly via `useContainer()`

  ```tsx
  // Before (0.8.x)
  const invalidateUser = useInvalidate(UserService)
  invalidateUser()

  // After (0.9.0) - Option 1: useInvalidateInstance
  const { data: user } = useService(UserService)
  const invalidateInstance = useInvalidateInstance()
  invalidateInstance(user)

  // After (0.9.0) - Option 2: Direct container access
  const container = useContainer()
  const { data: user } = useService(UserService)
  await container.invalidate(user)
  ```

### Changed

- **Simplified Instance Name Generation**: Refactored all hooks to use the new `container.calculateInstanceName()` method
  - Removed direct access to internal DI components (`getTokenResolver()`, `getNameResolver()`)
  - Cleaner, more maintainable code with less coupling to DI internals
- **Improved Event Subscription Setup**: Fixed race conditions in invalidation subscription
  - `useOptionalService`: Removed `setTimeout` hack, now properly awaits service fetch before subscribing
  - `useService`: Simplified subscription logic with proper null checks
  - `useSuspenseService`: Streamlined instance name calculation

### Fixed

- **Instance Name Generation**: Fixed edge cases where instance names could be incorrectly calculated
  - Now properly handles cases where `calculateInstanceName` returns null
  - Prevents potential subscription errors with undefined instance names

### Dependencies

- Updated to support `@navios/di` ^0.9.0 with new unified storage architecture

## [0.8.0] - 2025-12-21

### Dependencies

- Updated to support `@navios/di` ^0.8.0

## [0.7.0] - 2025-12-21

### Updated

- Updated to use `@navios/di` v0.7.0

## [0.2.1] - 2025-12-20

### Fixed

- Fixed package.json exports to use correct CommonJS file extensions (`.cjs` and `.d.cts`)

## [0.2.0] - 2025-12-18

### Added

- **Initial Release**: React integration for `@navios/di` dependency injection container
- **ContainerProvider**: React context provider for DI container access
- **ScopeProvider**: Provider for request-scoped service isolation
- **useContainer**: Hook to access the DI container from React context
- **useRootContainer**: Hook to access the root container regardless of scope
- **useService**: Hook for fetching services with loading/error states and automatic invalidation subscription
- **useSuspenseService**: Hook for fetching services using React Suspense
- **useOptionalService**: Hook for optionally loading services that may not be registered
- **useInvalidate**: Hook for invalidating services by token
- **useInvalidateInstance**: Hook for invalidating services by instance
- **useScope**: Hook to get the current scope ID
- **useScopeOrThrow**: Hook to get the current scope ID with error if not in scope
- **useScopedContainer**: Hook to get the current ScopedContainer
- **useScopedContainerOrThrow**: Hook to get the current ScopedContainer with error if not in scope
- **useScopeMetadata**: Hook to access scope metadata
- **Automatic Invalidation Subscription**: `useService` and `useSuspenseService` automatically subscribe to service invalidation events
- **Type-safe API**: Full TypeScript support with compile-time type checking
- **React 18 & 19 Support**: Compatible with both React 18 and React 19

### Features

- Automatic service re-fetching when services are invalidated
- Support for injection tokens with Zod schema validation
- Request-scoped service isolation via `ScopeProvider`
- Synchronous instance resolution when available (optimization)
- React Suspense integration for declarative loading states
- Optional service loading for feature flags and plugins
