# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

## [0.2.0] - 2025-01-XX

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
