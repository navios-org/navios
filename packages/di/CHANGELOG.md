# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.9.2] - 2026-01-05

### Fixed

- **Wrong Token Order with Pre-cached Dependencies**: Fixed a bug where `inject()` would throw "Wrong token order" error when some dependencies were already instantiated before the service constructor ran
  - The frozen state replay now correctly tracks all injected tokens, including those resolved from cache
  - Refactored `inject()` function to use a single `getRequest()` call path, eliminating duplicate logic and redundant `ctx.inject()` calls

## [0.9.1] - 2026-01-05

### Added

- **BoundInjectionToken Support in Testing Containers**: `TestContainer` and `UnitTestContainer` now support `BoundInjectionToken` in providers
  - Can override bound token values in tests using `useValue`, `useClass`, or `useFactory`
  - Bound tokens can be registered without overrides (uses bound value)
  - Proper token resolution for bound tokens in both containers

### Changed

- **Test Binding Priority**: Test bindings now use priority 1000 to ensure test overrides take precedence over production registrations
- **Value Binding Implementation**: Changed from static instance to factory pattern for better consistency
- **Token Resolution**: Enhanced token resolution in testing containers to properly handle `BoundInjectionToken` instances

## [0.9.0] - 2025-12-21

### Added

- **Priority System for Multiple Registrations**: Services can now be registered with priority levels. Higher priority wins when multiple registrations exist for the same token
  - New `priority` option in `@Injectable()` decorator
  - `Registry.getAll(token)` method to retrieve all registrations sorted by priority
  - `FactoryRecord` now includes `priority` field
- **Unified Storage Architecture**: Replaced multiple storage classes with a single `UnifiedStorage` class
  - Replaces `HolderManager`, `SingletonStorage`, `RequestStorage`, and `RequestContext`
  - Simpler mental model: one storage class regardless of scope
  - Reverse dependency index for O(1) dependent lookups (vs O(n) iteration)
  - Consistent API across all scopes
- **Enhanced Testing Utilities**: Significantly extended `TestContainer` with new assertion helpers
  - Fluent binding API extended with `toFactory()` method
  - Assertion helpers: `expectResolved()`, `expectNotResolved()`, `expectSingleton()`, `expectTransient()`, `expectRequestScoped()`
  - Lifecycle assertions: `expectInitialized()`, `expectDestroyed()`, `expectNotDestroyed()`
  - Method call tracking: `recordMethodCall()`, `expectCalled()`, `expectCalledWith()`, `expectCallCount()`, `getMethodCalls()`, `getServiceStats()`
  - Dependency graph utilities: `getDependencyGraph()`, `getSimplifiedDependencyGraph()`
- **New UnitTestContainer**: Strict isolated unit testing container with auto-tracking
  - Automatic method call tracking via Proxy
  - Strict mode (default): unregistered dependencies throw errors
  - Auto-mocking mode: unregistered dependencies return mock proxies
  - Simplified provider-based configuration
- **Enhanced Error Messages**: Extended `DIErrorCode` enum with 8 new error types
  - `TokenValidationError`: Zod schema validation failed
  - `TokenSchemaRequiredError`: Schema args required but not provided
  - `ClassNotInjectable`: Missing `@Injectable` decorator
  - `ScopeMismatchError`: Wrong container for scope
  - `PriorityConflictError`: Multiple same-priority registrations
  - `StorageError`: Storage operation failed
  - `InitializationError`: Service init failed
  - `DependencyResolutionError`: Dependency chain error
- **New Internal Components**:
  - `NameResolver`: Generates deterministic instance names
  - `ScopeTracker`: Tracks and validates scope relationships
  - `AbstractContainer`: Base class for containers
- **New Container Methods**: Direct access to internal components
  - `getStorage()`: Returns `UnifiedStorage`
  - `getServiceInitializer()`: Returns `ServiceInitializer`
  - `getServiceInvalidator()`: Returns `ServiceInvalidator`
  - `getTokenResolver()`: Returns `TokenResolver`
  - `getNameResolver()`: Returns `NameResolver`
  - `getScopeTracker()`: Returns `ScopeTracker`
  - `getEventBus()`: Returns `LifecycleEventBus`
  - `getInstanceResolver()`: Returns `InstanceResolver`

### Changed

- **BREAKING**: `ServiceLocator` wrapper class removed
  - Container now uses components directly (no ServiceLocator wrapper)
  - `container.getServiceLocator()` method removed
  - Use direct component access methods instead (e.g., `container.getStorage()`)
- **BREAKING**: Internal component renames
  - `Instantiator` → `ServiceInitializer`
  - `Invalidator` → `ServiceInvalidator`
  - `TokenProcessor` → `TokenResolver`
  - `HolderManager` → `UnifiedStorage`
  - `SingletonStorage` → `UnifiedStorage` (same class, different instance)
  - `RequestStorage` → `UnifiedStorage` (same class, different instance)
  - `RequestContext` → merged into `UnifiedStorage`
- **BREAKING**: `Container.removeActiveRequest()` renamed to `Container.removeRequestId()`
- **Registry Changes**:
  - `Registry.set()` now accepts optional `priority` parameter (5 params instead of 4)
  - `Registry` stores `FactoryRecord[]` per token instead of single `FactoryRecord`
  - `FactoryRecord` interface extended with `priority: number` field
- **Scope Error Handling**: Request scope violations now throw dedicated `ScopeMismatchError` with structured context instead of generic errors
- **Build Configuration**: Updated tsdown config with external dependencies
  - Node build: external `node:async_hooks` and `zod`
  - Browser build: external `zod`

### Performance

- **Reverse Dependency Index**: O(1) dependent lookup during invalidation (vs O(n) iteration)
- **Priority Cache**: Registry maintains `highestPriority` Map for fast access to winning registration
- **Unified Storage**: Single storage class eliminates wrapper overhead
- **No ServiceLocator Wrapper**: Container directly uses components, reducing indirection

### Migration

- Replace `container.getServiceLocator()` with direct component access methods
- Replace `container.removeActiveRequest()` with `container.removeRequestId()`
- Update internal class references if you were using them directly
- Consider using new testing utilities (`TestContainer` assertions, `UnitTestContainer`)
- Use `priority` option for service registration if needed
- Use `registry.getAll(token)` if you need all registrations, not just highest priority

## [0.8.0] - 2025-12-21

### Added

- **LRU Cache for Instance Names**: Added `InstanceNameCache` with max 1000 entries for O(1) instance name lookups
- **Reverse Dependency Index**: Implemented O(1) dependent lookups instead of O(n) iteration
  - New `registerDependencies()` method for tracking dependencies during instance creation
  - New `getDependents()` method for efficient dependent retrieval
- **Performance Helper Methods**: New allocation-free iteration methods
  - `forEachHolder()` for efficient iteration without creating intermediate arrays
  - `findHolder()` for single-item searches without full iteration

### Changed

- **Production Mode Optimization**: Circular dependency detection is now skipped in production mode (`NODE_ENV=production`) for reduced overhead
- **Dependency Invalidation Tracking**: Dependencies are now registered during instance creation for proper invalidation

### Performance

- Instance name generation is now cached (LRU, up to 1000 entries)
- Dependent lookups reduced from O(n) to O(1) using reverse dependency index
- Eliminates intermediate Map/Array allocations in various iteration methods

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
