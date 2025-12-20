# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
