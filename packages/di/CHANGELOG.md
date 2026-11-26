# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0-alpha.1] - Unreleased

### Breaking

- `registerProvider()` takes no third argument. Give a class or a factory its scope in the provider: `registerProvider(TOKEN, { class: Impl, scope })`. `RegisterProviderOptions` is deprecated and will be removed.

### Changed

- `InjectableOptions` and `FactoryOptions` are other names of `RegisterInjectableOptions` and `RegisterFactoryOptions`.

### Fixed

- `@Injectable()` and `@Factory()` of `@navios/di/legacy-compat` throw `DIError` when they are applied to something other than a class, like the standard decorators, instead of registering what they were given.
- A bundle made with rolldown, or a tool built on it such as tsdown, keeps the `Symbol.metadata` polyfill. rolldown left out an entry point that only re-exports, because `sideEffects` did not list it, and with it the import of the polyfill. Decorated classes then had no metadata, and `@navios/core` threw `Decorator metadata is not available` at start. The entry points are now listed.

## [2.0.0-alpha.0] - 2026-11-26

The resolution engine was rewritten. See the [migration guide](https://navios.tech/docs/di/reference/migrating-to-2) for old and new API side by side.

### Breaking

- **Container constructor**: `new Container(registry, logger, injectors)` is now `new Container({ providers?, strict?, logger? })`.
- **No registry and no priorities**: `Registry`, `globalRegistry`, the `registry` and `priority` options of `@Injectable` and `@Factory`, and `registry.getAll()` are removed. A token has one default provider; replace it per container with `provide()`.
- **One default per token**: a second `@Injectable({ token })` or `@Factory({ token })` for the same token throws `DIError` `ProviderConflict` at decoration time. Outside production (`NODE_ENV`), a class with the same name as the current default replaces it, which keeps hot reload working. So does a provider of the same form given to `registerProvider()`, with a warning when the two do not look alike.
- **Scopes replace request contexts**: `container.beginRequest(id, metadata)` is now `container.createScope(metadata?)`. Scopes have no ids; `getActiveRequestIds()`, `hasActiveRequest()` and `getRequestId()` are removed. `endRequest()` is `dispose()`, and `getParent()` is the `parent` property.
- **Declared scope only**: automatic scope upgrade is removed. A singleton that reaches a request-scoped service, directly or through a transient, fails with `ScopeMismatchError` and the full dependency path. A singleton is always built against the root container, also when it is requested through a scope.
- **`optional()`** returns `null` only when nothing provides the token. Every other error propagates.
- **Tokens have no ids**: `token.id` and the `customId` argument of `InjectionToken.create()` are removed. `toString()` returns the name.
- **Standard Schema for token args**: schema types are `StandardSchemaV1`, `InferInput<S>` and `InferOutput<S>` instead of zod types. Args must validate synchronously. `InjectionTokenSchemaType`, `BaseInjectionTokenSchemaType` and `OptionalInjectionTokenSchemaType` are removed.
- **Errors**: an error that is not a `DIError` and is thrown by a constructor, a factory or `onServiceInit()` is always wrapped in `DIError` `InitializationError` with the original in `cause`. Using a disposed scope throws `DIError` `ContainerDisposed` instead of a plain `Error`. Decorator misuse, an unknown reference and a schema that throws are `DIError`s as well.
- **A disposed container stays disposed.** After `dispose()`, or while it runs, nothing is built: `get()`, `getSync()`, `addInstance()`, `provide()`, `decorate()` and `createScope()` fail with `ContainerDisposed`, and so does a resolution that was in flight. A second `dispose()` returns the disposal in flight, on a scope too. `clear()` of `TestContainer` and `UnitTestContainer` leaves them usable.
- **Renamed**: `tryGetSync()` is `peek()`, with an inferred result. `DIErrorCode.FactoryNotFound` is `ProviderNotFound`, and the message names the path that led to the token.
- **`DIError` carries no arguments.** The context of `TokenValidationError` is `{ name, issues: { path, message }[] }` without the schema and the value, and the message spells the issues out. The static creators of `DIError` are removed.
- **Args**: a property that is `undefined` counts as absent, symbol keys count, and `Date`, `Map`, `Set`, `URL`, `RegExp` and typed arrays of up to 1 kB are compared by value. Args that contain themselves are refused.
- **`provide()`, `addInstance()` and the testing containers check types**: what is provided must have the public members of the target, as must a class given to `@Injectable({ token })`. A literal of the wrong value in the providers list of a `UnitTestContainer`, and a factory instance in place of its product, are not noticed. `ctx.inject()` is typed like `container.get()` instead of returning `any`. `InjectionToken`s of different types are no longer assignable to each other. A class counts as a factory in types only when `create()` takes no parameters or a `FactoryContext` first.
- **A value for a request-scoped token belongs to a scope**: `addInstance()` on the root container and a root `get()` of a value bound in a testing container fail with `ScopeMismatchError`.
- **Destroy errors are printed**: what a destroy hook throws goes to the `logger` option, to `console.error()` without one, and nowhere with `logger: null`.
- **Transients resolved directly from the root container are not tracked**: their `onServiceDestroy()` is not called by `dispose()`.

### Added

- `provide(tokenOrClass, impl)` with `new Container({ providers })` and `container.provide()`. An implementation is a class, `{ class, scope? }`, `{ value }`, `{ factory, scope? }` or `{ existing }`, an alias of another class or token.
- `registerProvider(token, impl, options?)` sets the default provider of a token from the same forms.
- `container.decorate(token, fn)` wraps every instance of a token after it is initialised and before anything can observe it. Like `provide()`, it must be called before the token is resolved.
- `inject(ScopedContainer)` gives a request-scoped service the scope it belongs to.
- `container.getSync(token, args?)` and `scope.getSync()` resolve synchronously and throw `AsyncInitRequired` when an asynchronous initialiser is pending.
- `container.onInvalidate(token, args, listener)` calls a listener when an instance is destroyed and returns an unsubscribe function.
- `container.getProvider(token)` returns the kind, scope and class of the provider a container would use.
- `container.instances()` lists what a container holds, dependencies before their dependents, each object once.
- `ScopedContainer` implements `Symbol.asyncDispose`: `await using scope = container.createScope()`.
- `registerInjectable()` and `registerFactory()` register classes without decorator syntax.
- `ContainerOptions.strict` makes a container ignore default providers and use only its own.
- Tokens that declare a scope and need no provider: `InjectionToken.create(name, { scope: InjectableScope.Request })`, supplied with `scope.addInstance()`.
- Any Standard Schema library can describe token args: zod, valibot, arktype and others.
- `DIErrorCode.ProviderConflict`, `AsyncInitRequired`, `ContainerDisposed`, `OutsideInjectionContext` and `AccessBeforeInit`.
- A warning when a second copy of the package is loaded, and an error that says so when a class or token of one copy is used with the other.
- `@navios/di/internal`, for other Navios packages only.

### Changed

- **Sync-first resolution**: `inject()` builds a missing dependency immediately, inside the constructor that asked for it, and returns the real instance. A service whose dependencies initialise synchronously is built without awaiting anything.
- `inject()` of a transient returns a fresh instance for each call. `asyncInject()` is needed only to break a circular dependency.
- A constructor runs once, and a second time in a build that meets a dependency whose asynchronous `onServiceInit()` has not finished. Dependencies are built because the constructor asks for them, never ahead of it, so one that a build does not ask for is not built.
- A factory (`provide(token, { factory })`, or `create()` of a `@Factory` class) that calls `inject()` on a service whose asynchronous initialiser has not finished is stopped at that call and run again once the service is ready. Code before the call runs again; code after it runs once.
- Conditional `inject()` calls are allowed; the "Wrong token order" error is gone.
- Circular dependencies made of `inject()` calls are detected in production as well, with the path. Cycles between concurrently built services, through a factory token and between transients fail instead of hanging or building without end.
- The value of a `FactoryInjectionToken` is computed once per root container and outside any construction: `inject()` throws in its function. Destroy listeners it registers run when the container is disposed.
- Instances of a token with args are keyed by the full, key-sorted validated args.
- `TestContainer.bind()` uses the provider mechanism. `UnitTestContainer` is a strict container. Factories given to either receive the factory context and the args.
- Legacy decorators: the metadata of a class inherits from that of its base class, as with standard decorators, so a subclass keeps the guards and attributes of its base. A member context tells static members apart.
- Invalidating a dependency of a service that is still being built does not wait for that service. It is destroyed once it is ready and built again, and whoever asked for it receives the new instance.
- `scope.dispose()` destroys the transients the scope handed out before the request-scoped services they use, and waits for what is still being built. For a transient in the making, and for the args a factory token is computing, `dispose()` waits a second at most; they are destroyed as soon as they are ready.
- A factory that fails runs the destroy listeners it had registered.
- `zod` is no longer a peer dependency. The package has no runtime dependencies.

### Fixed

- A constructor that uses a dependency whose asynchronous initialiser has not finished (`db = inject(Db); table = this.db.table()`) is run again once the dependency is ready instead of failing on the first, cold `get()`. What it throws is reported only when nothing was pending.
- A cycle made only of transient services throws `CircularDependency` with the path instead of overflowing the stack.
- `provide(token, impl)` keeps the scope of the token's default provider unless a scope is given. A request-scoped token is no longer turned into a singleton by a mock, and a singleton that injects it fails with `ScopeMismatchError` again.
- Transients built by a construction that fails are destroyed.
- `ctx.inject()` called by a factory product after its construction does not make the product the owner of the transients it gets. Such a transient is destroyed with the scope when it is injected in one, and is not tracked in the root container.
- `ctx.inject()` of a transient with an asynchronous initialiser resolves instead of building a new instance forever.
- The function returned by `onInvalidate()` removes the listener's bookkeeping completely.
- A scope disposed while a resolution is in flight builds nothing more: the pending `get()` rejects with `ContainerDisposed`, and what it built is destroyed, before `dispose()` resolves unless a transient takes longer than a second. An `asyncInject()` promise nobody awaits does not become an unhandled rejection.
- `inject()`, `asyncInject()` and `optional()` outside a construction, which includes lifecycle hooks, throw `DIError` `OutsideInjectionContext`; using a dependency in any way before it is initialised throws `DIError` `AccessBeforeInit`.
- `UnitTestContainer.get()` returns the same tracking proxy for the same instance, also from its scopes. Methods, accessors and symbol methods that use `#private` members work through it, spies keep their `mock`, and concurrent calls are all recorded.
- `TestContainer.bind()` on a resolved token no longer leaves an unhandled rejection when the teardown of the old instance fails.
- The published package contains only `lib`, the README, the changelog and the licence.

### Removed

- `Registry`, `globalRegistry`, `InjectableType`.
- `getInjectors()`, `defaultInjectors`, `wrapSyncInit`, `provideFactoryContext`.
- `container.getStorage()`, `getRegistry()`, `getInstanceResolver()`, `getNameResolver()`, `getScopeTracker()`, `getServiceInitializer()`, `getTokenResolver()`, `getServiceInvalidator()`, `getEventBus()` and `calculateInstanceName()`.
- The lifecycle event bus. Use `container.onInvalidate()`.
- `FactoryInjectionToken#value`, `#resolved` and `#resolve()`.
- `DIErrorCode.FactoryTokenNotResolved`, `PriorityConflictError`, `StorageError`, `DependencyResolutionError`, `InstanceNotFound` and `InstanceDestroying`.
- `EventEmitter` and its types.
- `InjectableTokenMeta`, the `ClassTypeWith…` types except `ClassTypeWithInstance`, and the union helpers `Join`, `UnionToIntersection`, `UnionToOvlds`, `PopUnion`, `IsUnion` and `UnionToArray`.
- The separate browser build and the `AsyncLocalStorage` shim. Resolution no longer uses `AsyncLocalStorage`.

### Fixed

- Two classes with identical source no longer share a token id and therefore an instance.
- Falsy injected values (`0`, `''`, `false`, `null`) are returned as they are.
- Instances of a token whose args differ only in nested values are distinct.
- A constructor no longer runs twice when a dependency was not created yet.
- The value of a factory token is no longer shared across containers.
- `optional()` no longer swallows errors thrown by a constructor.
- Awaiting an `asyncInject()` promise while the requesting service is still initialising, in `onServiceInit()` or in an asynchronous factory, now counts as waiting for the dependency. When that dependency waits for the requester in turn, both fail with `DIError` `CircularDependency` and the path instead of hanging. Awaiting the promise later, in a method, still breaks the cycle.
- A cycle found across asynchronous work is reported with the whole path instead of only the two services that closed it.
- `Symbol.metadata` is defined when the package is loaded, from every entry point, if the runtime does not have it. Standard decorators compiled by `tsc` and run on Node.js no longer need a polyfill.
- `UnitTestContainer` reports a token outside the providers list with a readable message. The code is `ProviderNotFound`, and `context.name` is the token name.
- `onInvalidate()` listeners are called after the whole `invalidate()` or `dispose()` call has finished, in destruction order and before its promise resolves, instead of in the middle of it. A listener that resolves the service again, with `get()` or `getSync()`, used to run while the invalidated dependency was still being destroyed, which constructed the dependent up to three times. It is now constructed once. Every listener runs even when one throws; the first error rejects the promise after the teardown is complete.
- A service resolved while an invalidation is running is no longer constructed against a dependency that is being destroyed and then constructed again. The container waits for the destruction first, also when the dependency is several services down.
- `UnitTestContainer` with `allowUnregistered: true` gives the auto-mock to `inject()`, `optional()` and `asyncInject()` of an unlisted token inside a listed service as well. Before, only a direct `container.get()` received it and the injection failed. Each token has one auto-mock. Without `allowUnregistered` nothing changes.
- JSDoc of the testing containers: `expectInitialized()`, `expectDestroyed()` and `expectNotDestroyed()` see only what `recordLifecycleEvent()` reported; the `expectCalled*()` helpers see `recordMethodCall()` reports on `TestContainer` and calls made through the proxy returned by `get()` on `UnitTestContainer`.

### Performance

Measured on Node 24 in production mode on the same machine, 1.0.0 → 2.0.0:

| Operation                                                                       | 1.0.0   | 2.0.0   |
| ------------------------------------------------------------------------------- | ------- | ------- |
| `get` of a ready singleton                                                      | 0.39 µs | 0.06 µs |
| `get` of a transient with one dependency                                        | 4.7 µs  | 0.14 µs |
| Create a scope, resolve a request-scoped service with two dependencies, dispose | 5.6 µs  | 0.39 µs |

## [1.0.0] - 2026-01-08

### Added

- **Legacy Decorator Support**: New `@navios/di/legacy-compat` export for projects that cannot use Stage 3 decorators
  - `Injectable` and `Factory` decorators compatible with TypeScript experimental decorators
  - `createClassContext` and `createMethodContext` utilities for building custom legacy decorators
  - Useful for projects with `experimentalDecorators: true`, Bun, or certain bundler configurations

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

## [0.9.0] - 2025-12-23

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

## [0.4.0] - 2025-09-19

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

- See [Migration Guide](https://navios.tech/docs/di/reference/migrating-to-2) for detailed migration steps
- Old request context API is no longer available
- Update middleware code to use `ScopedContainer` pattern

## [0.3.0] - 2025-09-18

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

## [0.2.0] - 2025-08-28

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

## [0.1.0] - 2025-05-13

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
