# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.1] - 2025-12-21

### Added

- **Registry.updateScope**: New method to update the scope of an already registered factory
  - This is useful when you need to dynamically change a service's scope
  - For example, when a singleton controller has request-scoped dependencies

## [0.7.0] - 2025-12-21

### Added

- **Browser Build Improvements**: Dedicated browser entry point with optimized bundle
  - Separate `lib/browser/index.mjs` build for browser environments
  - Uses `SyncLocalStorage` (stack-based polyfill) instead of `AsyncLocalStorage`
  - Bundlers automatically select the correct entry via `package.json` exports
- **Production Mode Optimization**: Circular dependency detection is now disabled in production
  - Set `NODE_ENV=production` to skip BFS traversal overhead
  - Development mode retains full cycle detection with clear error messages
- **Failed Service Retry**: Services can now be retried after initialization failures
  - Failed holders are removed from storage to allow retry attempts
  - Works with Factory, Injectable, and Request-scoped services
- **Comprehensive Browser Test Suite**: Added extensive tests for browser environment
  - Environment detection tests
  - SyncLocalStorage behavior tests
  - E2E scenarios for browser DI resolution
  - Documents async limitations in browser environments

### Changed

- **Testing Exports Moved**: Testing utilities now require explicit import path
  - Use `import { ... } from '@navios/di/testing'` instead of main export
  - Reduces main bundle size for production builds
- **Internal API Cleanup**: `resolutionContext` is no longer exported from main entry
  - This was an internal implementation detail
- **Build Configuration**: Updated tsdown config with module aliasing for browser builds
  - Input option aliases `async-local-storage.mjs` to `async-local-storage.browser.mjs` for browser builds
- **Test Infrastructure**: Multi-project vitest configuration
  - Separate test projects for Node.js and browser environments
  - Type checking runs as separate project

### Fixed

- Transient instances now use temporary holders for proper resolution context tracking
- Improved cross-storage dependency tracking between Singleton and Request storage
- Request-scoped dependency invalidation listeners properly cleanup on request end

## [0.6.1] - 2025-12-20

### Fixed

- `DIError` now properly extends `Error` class for correct error handling and stack traces
- Fixed package.json exports to use correct CommonJS file extensions (`.cjs` and `.d.cts`)

## [0.6.0] - 2025-12-18

### Added

- **Circular Dependency Detection**: Automatic detection of circular dependencies with clear error messages
  - Detects cycles when using `inject()` and throws descriptive errors
  - Shows the full cycle path: `ServiceA -> ServiceB -> ServiceA`
  - Use `asyncInject()` to break circular dependencies
- **Browser Support**: Full browser environment support
  - Dedicated browser entry point via `package.json` exports
  - Automatically uses `SyncLocalStorage` instead of `AsyncLocalStorage` in browsers
  - Works seamlessly with bundlers (webpack, vite, etc.)
- **Cross-Storage Invalidation**: Proper invalidation of singletons that depend on request-scoped services
  - Singletons are automatically invalidated when their request-scoped dependencies are cleaned up
  - Prevents memory leaks and stale references
- **Resolution Context**: Uses `AsyncLocalStorage` to track resolution across async boundaries
  - Enables proper circular dependency detection in async scenarios
  - Maintains context across async operations

### Changed

- **Type Renames**: Many internal types have been renamed for cleaner naming
  - Old names are still available as deprecated aliases for backward compatibility
  - See migration guide for complete list of renamed types
  - New names: `InstanceHolder`, `InstanceStatus`, `HolderManager`, `LifecycleEventBus`, etc.

### Fixed

- Circular dependencies now throw clear errors instead of hanging indefinitely
- Request-scoped services properly invalidate dependent singletons
- Browser compatibility issues resolved

## [0.4.0] - 2025

### Added

- **ScopedContainer**: New request context management API
  - Eliminates race conditions in concurrent request handling
  - Each request gets its own isolated container
  - Proper cleanup with `endRequest()` method
- **IContainer Interface**: Common interface for `Container` and `ScopedContainer`
  - Enables polymorphic usage of containers
  - Consistent API across container types
- **Active Request Tracking**: Methods to track active requests
  - `hasActiveRequest(requestId: string): boolean`
  - `getActiveRequestIds(): ReadonlySet<string>`
- **Request-Scoped Error Protection**: Clear error when attempting to resolve request-scoped services from `Container`
  - Helpful error message guides users to use `ScopedContainer`

### Changed

- **BREAKING**: `Container.beginRequest()` now returns `ScopedContainer` instead of `RequestContextHolder`
- **BREAKING**: Removed `Container.setCurrentRequestContext(requestId)`
- **BREAKING**: Removed `Container.getCurrentRequestContext()`
- **BREAKING**: Removed `Container.endRequest(requestId)` - use `ScopedContainer.endRequest()` instead

### Fixed

- Race condition in concurrent request handling
  - Old API could cause request contexts to be mixed when multiple requests processed concurrently
  - New `ScopedContainer` API eliminates this issue completely

### Migration

- See [Migration Guide](./docs/migration.md) for detailed migration steps
- Old request context API is no longer available
- Update middleware code to use `ScopedContainer` pattern

## [0.3.0] - 2024-XX-XX

### Added

- **Request Context Management**: Initial request-scoped service support
  - `Container.beginRequest(requestId, metadata?, priority?)` - returns `RequestContextHolder`
  - `Container.endRequest(requestId)` - cleanup request context
  - `Container.setCurrentRequestContext(requestId)` - set active context
  - `Container.getCurrentRequestContext()` - get current context
- **RequestContextHolder Interface**: Interface for managing request contexts
- Enhanced error messages for injection failures
- Improved TypeScript type definitions

### Changed

- Enhanced container API with request context methods
- Better error messages throughout the library

## [0.2.0] - 2024-XX-XX

### Added

- **Basic Dependency Injection**: Core DI functionality
  - `@Injectable()` decorator for service registration
  - `@Factory()` decorator for factory pattern
  - `Container` class for dependency management
- **Injection Tokens**: Token-based dependency resolution
  - `InjectionToken.create()` for creating tokens
  - `InjectionToken.bound()` for pre-bound values
  - `InjectionToken.factory()` for factory-based resolution
  - Zod schema validation support
- **Service Lifecycle Hooks**:
  - `OnServiceInit` interface for initialization
  - `OnServiceDestroy` interface for cleanup
- **Service Scopes**:
  - `InjectableScope.Singleton` - single instance per container
  - `InjectableScope.Transient` - new instance each time
  - `InjectableScope.Request` - instance per request context
- **Injection Methods**:
  - `inject()` - synchronous injection
  - `asyncInject()` - asynchronous injection
  - `optional()` - optional injection
- **Registry**: Service registration system
  - `Registry` class for managing service registrations
  - `globalRegistry` for default registrations

## [0.1.0] - 2024-XX-XX

### Added

- Initial release
- Basic dependency injection functionality

---

## Types of Changes

- **Added** for new features
- **Changed** for changes in existing functionality
- **Deprecated** for soon-to-be removed features
- **Removed** for now removed features
- **Fixed** for any bug fixes
- **Security** for vulnerability fixes
