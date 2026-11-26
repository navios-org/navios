# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0-alpha.1] - Unreleased

### Breaking

- **`@navios/core/transport` exports less.** A transport that imports these from it, `@navios/commander` included, changes the import:
  - `constructedInstances` is part of `@navios/di/internal`, which follows no semver. Import it from there and list `@navios/di` as a peer dependency.
  - `hasModuleMetadata` is removed; `getModuleMetadata` throws for a class that is not a module.
  - The types that `@navios/core` exports are no longer exported a second time: `Transport`, `TransportFactory`, `TransportInstance`, `Guard`, `GuardClass`, `Interceptor`, `InterceptorClass`, `ExecutionContext`, `HandlerInfo`, `AttributeMap`, `ClassType` and `LoggerService`. Import them from `@navios/core`. `TransportDefinition` and `TransportHost` stay.
- **`ConfigServiceInterface` and `isLogLevel` are removed** from `@navios/core`. `ConfigService` is the configuration service, and `filterLogLevels` reads levels from a setting.
- **`BasicExecutionContextInit` has no `signal`**, which no transport passed: the signal of a `BasicExecutionContext` is its own and never aborts.
- **`HandlerInfo.module` is a `ClassType`**, no longer `| null`: every transport sets it.
- **`ConsoleLogger`'s protected `printMessages()` takes no `requestId`**, which nothing passed: the id is that of `currentContext()` when the `requestId` option is on. `getRequestId()` and `printAsJson()`, protected as well, print the id they are given without checking the option again.
- **`handlerChain` builds the `HandlerInfo`.** It takes the `controller` and the `handlerName` of the handler besides `node`, `owner` and `member`, and returns `{ info, outer, inner }`: `info` is what the handler's contexts carry as `ctx.handler`, its guards in `info.guards`. `HandlerChain.guards` and `HandlerChain.interceptors` are removed. `resolveChain` takes what `handlerChain` returns, the guards in `info.guards`.

### Added

- **`executeChain(host, ctx, chain, handler, onDenied)`** in `@navios/core/transport`: `runChain` with a context of the transport's own, in the async context when `host.asyncContext` is set, and `ctx.finish()` afterwards, whatever the outcome.
- **`moduleClasses(node, entry)`** in `@navios/core/transport`: the classes a module lists under an option of a transport, once each. Something that is not a class fails with the module and the option, as an import cycle between files leaves `undefined` behind.
- **`classMetadata(key, what, decorator)`** in `@navios/core/transport`: `define`, `get` and `has` for what a class decorator stores on a class. Only the class itself carries it, not a subclass, and `get` throws `Users is not a controller. Make sure it is decorated with @Controller.` for a class without it.
- **`ownMetadata(metadata, key, create)` and `requireMetadata(context)`** in `@navios/core/transport`, for decorators that keep their own entries in decorator metadata: the entry of this class, created from what its parent has, and the metadata of a context that has to have one.
- **`settledWithin(work, ms)` and `MAX_DELAY_MS`** in `@navios/core/transport`: whether a promise settles within `ms`, for a transport's `stop(timeoutMs)`. A longer time than a timer takes is cut to `MAX_DELAY_MS`.

### Fixed

- **A schema that answers with a thenable that is not a native promise**, such as a promise of another realm, is refused by `AttributeFactory.createAttribute` and `provideConfig` as one that answers with a promise is. It was taken for a result without issues, so the value was `undefined`.

## [2.0.0-alpha.0] - 2026-11-26

`@navios/core` is now the part of Navios that does not depend on HTTP. The HTTP framework it was in 1.x is `@navios/server`, which is built on this package and re-exports it. The changes to the HTTP framework itself are listed in the changelog of `@navios/server`.

### Breaking

- **The HTTP framework moved to `@navios/server`.** Controllers, `@Endpoint`, `handler()`, `RequestContext`, `HttpException` and the other errors, `reply()`, `NaviosFactory`, `NaviosApplication`, the adapter contract, SSE and request values are exported from `@navios/server`. An HTTP application replaces the import specifier `@navios/core` with `@navios/server`, including `@navios/core/testing`, `@navios/core/legacy-compat` and the `declare module` of `Register`.
- **`@navios/core/conformance` moved** to `@navios/server/conformance`.
- **`@navios/builder` is no longer a peer dependency.**
- **`Guard` and `Interceptor` are generic.** `Guard<Ctx>` and `Interceptor<Ctx, Result>` default to `ExecutionContext`, the context every transport provides. `@navios/server` exports the HTTP-typed versions under the same names.
- **`currentContext()` returns an `ExecutionContext`.** The one from `@navios/server` returns the `RequestContext`.
- **`@Module` knows `imports`, `providers`, `guards`, `interceptors` and `attributes`.** `prefix`, `controllers` and `requestValues` are added by `@navios/server`. `ModuleMetadata` keeps options of transports in `entries`.
- **`buildModuleGraph(roots)` takes no prefix** and returns nodes with `entries`, `importers`, `isRoot` and `disputed` in place of `prefix`, `controllers` and `requestValues`. It is exported from `@navios/core/transport`.
- **The plugin API has no HTTP members.** `adapter`, `encoder` and `mapError` are on the HTTP transport, `api.transport(httpTransport)`, and `onBootstrap` hooks receive no arguments.
- **`@navios/di` 2.0** has its own breaking changes: registries and priorities are removed, a singleton cannot depend on a request-scoped service, `container.beginRequest()` is `container.createScope()`. What applications use of it is re-exported by name.
- **Guards run before the interceptors of the module, the class and the handler.** Interceptors of the application stay outside the guards. `handlerChain` returns the two groups as `outer` and `inner`. Only `true` from a guard lets the handler run.
- **`provideConfig` returns an `InjectionToken<ConfigService<…>>`**, which can be replaced like any other token. `load` runs once per container, and at once when it is synchronous. `ConfigService` logs nothing and can be created with `new`. `ConfigServiceToken`, `ConfigServiceOptions`, `ConfigServiceOptionsSchema`, `PathImpl` and `PathImpl2` are removed. `get()` is never typed `undefined`, and `getOrThrow()` and `getOrDefault()` neither `undefined` nor `null`.
- **`envInt`** throws for a variable that is not an integer. It used to take `12abc` for 12 and to return `NaN` for `abc`.
- **The provider of a token is chosen by who provides it**: the application's container and options, plugins, modules, the default. A module wins over what it imports, and a module of the application over one that a plugin adds; two modules that provide different things for a token without one importing the other are an error where one of them would be used, and so is a provider that comes after its token was resolved. `providers` takes what `provide()` returns and refuses anything else.
- **Modules cannot import each other in a cycle**, and a class can be made a module once.
- **An application that fails to initialise or to start is closed**, its container included.
- **`enableShutdownHooks()` ends the process**: when everything the signal closes is closed, the process gets the signal again, or exits with its code when it is process 1. `{ exit: false }` turns that off. A signal during a `close()` waits for it.
- **The console logger** prints `log` and above when `NODE_ENV` is `production` and uses colours when stdout is a terminal. `setup()` changes the options it is given. With `json`, an error is an `error` object on the line of its message, with its own fields and the errors it holds. `filterLogLevels` throws for a level that does not exist; `isLogLevelEnabled` and `loggerOptionsSchema` are no longer exported.
- **`Logger` is transient**: every injection has its own instance.
- **`getModuleMetadata` and `hasModuleMetadata`** are exported from `@navios/core/transport`; `ModuleMetadataKey` is not exported.

### Added

- **`createApplication(AppModule, options)`** and `Application`: an application that hosts zero or more transports sharing one module graph, container, plugin set and lifecycle. `init()`, `start()`, `close()`, `transport(factory)`.
- **Transports.** `defineTransport` in `@navios/core/transport`, with the module graph, `describeHandlerClass`, `handlerChain`, `resolveChain`, `runChain` and `BasicExecutionContext` for transport authors.
- **`shutdownTimeout`** bounds every step of `close()`, each hook on its own. A step that takes longer is logged and left behind.
- **A plugin can provide the logger**, as can a module it adds. What is logged before all plugins are set up is written then.
- **`ExecutionContext`**, `HandlerInfo` and `ExecutionContextToken`: what a guard, an interceptor or a request-scoped service can rely on with any transport.
- **Open `@Module` options.** A transport package adds its own option by declaration merging. An option that no transport of the running application reads is ignored, so one module can serve several transports.
- **`@navios/core/testing`** with `fakeTransport`.
- **A warning when two copies of the package are loaded.**

### Fixed

- **`close()` called again while a shutdown is in flight** returns that shutdown instead of resolving at once. From something the shutdown waits for it resolves at once; from something `init()` or `start()` waits for it rejects, instead of waiting for itself, and closes afterwards. `start()` called from something `init()` waits for does the same.
- **Hooks run in dependency order**: `onApplicationBootstrap` for dependencies first, `onApplicationShutdown` for dependents first, once per object, and only for objects the container built that declare them.
- **What a destroy hook throws** goes to the application's logger.
- **A subclass inherits what decorators attached to its base class**, guards and endpoints included, with the decorators of `@navios/core/legacy-compat` as well, and from a module that `registerModule` made one.
- **A configuration that fails validation** is reported with the paths of what is wrong and without its values.
- **The console logger** prints an error that is passed without a context, and neither throws for what it is given nor prints nothing when it is created with `new`.
- **A `close()` that rejects after a signal** from `enableShutdownHooks()` is reported through the logger instead of becoming an unhandled rejection.
- **`providers` of a module are applied before anything is resolved**, so `@Module({ providers: [provide(LoggerOutput, …)] })` takes effect. Providers of modules that a plugin adds are applied after the plugins are set up.
- **`buildModuleGraph` visits a module once** however many paths reach it; diamond imports used to cost exponential time. Inherited guards and interceptors now always come before the module's own, and what a shared module inherits no longer depends on the path that reached it first. Import paths that give it different values of an attribute are an error where a handler would inherit the attribute.
- **An `undefined` entry in `imports`**, the usual sign of an import cycle between files, throws an error that names the importing module.
- **A plugin registered twice with different options**, and two plugins of one name, throw instead of dropping the second registration.
- **The second-copy warning** also covers copies loaded only through `@navios/core/transport`, `/testing` or `/legacy-compat`.
- **An `onFinish` callback that throws** is reported to the application's logger; it used to be dropped silently.

## [1.1.0] - 2026-01-15

### Added

- **Staged Plugin System**: New comprehensive plugin lifecycle with 10 stages for fine-grained control over application initialization
  - `pre:modules-traverse` - Before module tree traversal (container only)
  - `post:modules-traverse` - After module tree traversal (modules available)
  - `pre:adapter-resolve` - Before adapter is resolved from container (ideal for DI modifications)
  - `post:adapter-resolve` - After adapter is resolved
  - `pre:adapter-setup` - Before adapter setup
  - `post:adapter-setup` - After adapter setup
  - `pre:modules-init` - Before route registration
  - `post:modules-init` - After route registration (legacy plugin default)
  - `pre:ready` - Before adapter signals ready
  - `post:ready` - After adapter signals ready (app fully initialized)
- **Stage-Specific Context Types**: Each stage provides appropriate context
  - `ContainerOnlyContext` - Container access only (early stages)
  - `ModulesLoadedContext` - Container + modules + moduleLoader (pre-adapter stages)
  - `FullPluginContext<TAdapter>` - Full context with typed adapter (post-adapter stages)
- **Plugin Factory Functions**: Convenient factory functions for creating staged plugins
  - `definePreModulesTraversePlugin()` - Create pre:modules-traverse plugins
  - `definePostModulesTraversePlugin()` - Create post:modules-traverse plugins
  - `definePreAdapterResolvePlugin()` - Create pre:adapter-resolve plugins (ideal for instrumentation)
  - `definePostAdapterResolvePlugin<TAdapter>()()` - Create post:adapter-resolve plugins
  - `definePreAdapterSetupPlugin<TAdapter>()()` - Create pre:adapter-setup plugins
  - `definePostAdapterSetupPlugin<TAdapter>()()` - Create post:adapter-setup plugins
  - `definePreModulesInitPlugin<TAdapter>()()` - Create pre:modules-init plugins
  - `definePostModulesInitPlugin<TAdapter>()()` - Create post:modules-init plugins
  - `definePreReadyPlugin<TAdapter>()()` - Create pre:ready plugins
  - `definePostReadyPlugin<TAdapter>()()` - Create post:ready plugins
- **Plugin Stage Constants**: `PluginStages` object with all stage names as constants
- **Stage Order Array**: `PLUGIN_STAGES_ORDER` array defining execution order

### Changed

- **Legacy Plugin Deprecation**: `NaviosPlugin` interface now deprecated in favor of staged plugins
  - Legacy plugins automatically map to `post:modules-init` stage
  - `PluginDefinition` type deprecated in favor of `StagedPluginDefinition`
- **Plugin Context Types**: `PluginContext` type deprecated, use stage-specific context types instead

### Dependencies

- Updated internal plugin execution to support staged lifecycle

## [1.0.0] - 2026-01-09

### Added

- **Stable Release**: First stable release of @navios/core
  - Production-ready framework for building type-safe HTTP servers
  - Comprehensive feature set with unified adapter architecture
  - Full TypeScript support with end-to-end type safety

## [1.0.0-alpha.4] - 2026-01-09

### Added

- **Unified Adapter Architecture**: New abstract adapter system supporting multiple adapter types (HTTP, CLI, etc.)
  - `AbstractAdapterInterface` - Base interface for all adapters with lifecycle methods (`setupAdapter`, `onModulesInit`, `ready`, `dispose`)
  - `AdapterEnvironment` - Base interface for adapter environments with type-safe options
  - `HttpAdapterEnvironment` - Extended environment interface for HTTP adapters with server, CORS, multipart, and listen options types
  - `DefaultAdapterEnvironment` - Default environment with unknown types for generic usage
  - `AdapterToken` - New injection token for accessing the current adapter instance
  - `AdapterFactory` - Factory for creating adapter instances from environment definitions
- **Type-Safe Application Generic**: `NaviosApplication<TEnvironment>` now accepts an environment type parameter
  - All adapter-specific methods (`configure`, `enableCors`, `enableMultipart`, `listen`, `getServer`) are now properly typed based on the environment
  - Environment types provide IntelliSense for adapter-specific options
- **Enhanced Plugin System**: Plugins are now typed with adapter constraints
  - `NaviosPlugin<TOptions, TAdapter>` - Second type parameter for adapter-specific plugins
  - `PluginContext<TAdapter>` - Typed context with adapter access
  - Plugins can access `context.adapter` instead of `context.server` for better type safety
- **Module Custom Entries**: New `customEntries` property on `ModuleMetadata` for adapter-specific module data
  - Allows adapters to store custom metadata on modules (e.g., commands for CLI adapter)
- **Console Logger Tests**: Added comprehensive test suite for `ConsoleLoggerService`

### Changed

- **Renamed Environment Methods**: `getHttpToken` renamed to `getToken` for adapter-agnostic naming
- **Renamed Environment Property**: `httpTokens` renamed to `tokens` in environment definitions
- **Application Configuration**: New `configure()` method replaces `setupHttpServer()` for pre-init configuration
  - Configuration options are merged with adapter defaults
  - Must be called before `init()` for options to take effect
- **Plugin Context**: `PluginContext.server` replaced with `PluginContext.adapter` for accessing the adapter instance
  - Use `context.adapter.getServer()` for HTTP server access
  - `context.globalPrefix` removed; use `context.adapter.getGlobalPrefix()` instead
- **Abstract HTTP Adapter**: `AbstractHttpAdapterInterface` now extends `AbstractAdapterInterface`
  - Added `configure(options)` method for pre-init configuration
  - Method signatures updated for environment-based typing

### Breaking Changes

- **Environment Definition Format**: `httpTokens` property renamed to `tokens`
  - Before: `{ httpTokens: new Map([...]) }`
  - After: `{ tokens: new Map([...]) }`
- **Plugin Context API**: `context.server` and `context.globalPrefix` removed
  - Before: `const server = context.server`
  - After: `const server = context.adapter.getServer()`
  - Before: `const prefix = context.globalPrefix`
  - After: `const prefix = context.adapter.getGlobalPrefix()`
- **Application Setup**: `setupHttpServer()` replaced with `configure()`
  - Before: `await app.setupHttpServer({ logger: true })`
  - After: `app.configure({ logger: true }); await app.init()`

### Dependencies

- Updated to support unified adapter architecture across all packages

## [1.0.0-alpha.3] - 2026-01-08

### Added

- **Abstract Handler Adapter Base Class**: New `AbstractHandlerAdapterService` base class for HTTP handler adapters
  - Provides shared logic for controller resolution (singleton vs request-scoped)
  - Automatic sync/async detection for argument formatting
  - Standardized handler generation with static/dynamic branching
  - Supports all adapter types: endpoint, stream, and multipart
- **New Handler Adapter Types**: Exported types for adapter implementations
  - `ArgumentGetterFn<TRequest>` - Function type for extracting data from requests
  - `FormatArgumentsFn<TRequest>` - Function type for formatting arguments
  - `AbstractStaticHandler<TRequest, TReply>` - Static handler type for singleton controllers
  - `AbstractDynamicHandler<TRequest, TReply>` - Dynamic handler type for request-scoped controllers
  - `AbstractHandlerResult<TRequest, TReply>` - Union type for handler results
  - `HandlerContext<TConfig>` - Context passed to handler creation methods
- **Enhanced Handler Adapter Interface**: Extended `AbstractHttpHandlerAdapterInterface` with new optional methods
  - `buildFormatArguments()` - Builds optimized formatArguments function from getters
  - `hasSchema()` - Checks if handler has validation schemas
  - `provideSchema()` - Provides schema information for framework registration

### Changed

- **Legacy-Compat DI Re-exports**: `Injectable`, `Factory`, `createClassContext`, and `createMethodContext` are now re-exported from `@navios/di/legacy-compat` instead of being defined locally
  - Removes code duplication between core and di packages
  - Ensures consistent behavior across the framework

### Removed

- **Local DI Decorators**: Removed local `Injectable` and `Factory` decorator implementations from legacy-compat (now imported from `@navios/di/legacy-compat`)
- **Context Compat Module**: Removed `context-compat.mts` module (functionality moved to `@navios/di`)

### Dependencies

- Updated to support `@navios/di` with legacy-compat exports

## [1.0.0-alpha.2] - 2026-01-07

### Added

- **Module Overrides**: New `overrides` option in `@Module()` decorator for service override classes
  - Service override classes are imported for side effects to ensure their `@Injectable` decorators execute
  - Overrides should use the same `InjectionToken` as the original service with a higher priority
  - `ModuleLoaderService` validates overrides and logs warnings if override is not active or not registered
  - Useful for testing and swapping implementations without modifying original modules

### Changed

- **Simplified Endpoint Type Utilities**: Refactored `EndpointParams<T>` type to use new `RequestArgs` type from `@navios/builder`
  - Cleaner type inference with support for `urlParamsSchema`
  - Server-side handlers receive `z.output` types (parsed/transformed values)
  - Client-side receives `z.input` types (raw input values)
- **Updated Builder Types**: All adapters and decorators now use `EndpointOptions` and `BaseEndpointOptions` from `@navios/builder` instead of legacy `BaseEndpointConfig`
- **Legacy Decorator Improvements**: Simplified type definitions in legacy-compat decorators for better maintainability

### Dependencies

- Updated to support `@navios/builder` ^1.0.0-alpha.2 with new `RequestArgs` type system

## [1.0.0-alpha.1] - 2026-01-07

### Added

- **RFC 7807 Problem Details Error Responses**: New standardized error response system using RFC 7807 Problem Details format
  - `ErrorResponseProducerService` - Central service for producing standardized error responses
  - `FrameworkError` enum - Explicit error type specification (NotFound, Forbidden, InternalServerError, ValidationError)
  - Customizable error responders with dependency injection support:
    - `NotFoundResponderService` - Handles 404 Not Found errors
    - `ForbiddenResponderService` - Handles 403 Forbidden errors (used by guards)
    - `InternalServerErrorResponderService` - Handles 500 Internal Server errors
    - `ValidationErrorResponderService` - Handles 400 Validation errors with structured Zod error details
  - All responders registered with low priority (-10) for easy override
  - `ErrorResponder` interface for custom responder implementations
  - `ProblemDetails` interface following RFC 7807 specification
  - `ErrorResponse` interface with status code, payload, and headers
- **Guard Error Handling Enhancement**: `GuardRunnerService` now uses `ErrorResponseProducerService` for standardized error responses
  - Guard rejections now return RFC 7807 compliant responses
  - Guard execution errors produce standardized internal server error responses

### Changed

- **Error Response Format**: Error responses now use RFC 7807 Problem Details format instead of simple JSON
  - Content-Type header set to `application/problem+json`
  - Responses include `type`, `title`, `status`, and `detail` fields
  - Validation errors include structured `errors` field with Zod validation details
  - HttpException responses remain backward compatible (preserved original format)

### Breaking Changes

- **Error Response Format**: Non-HttpException errors now return RFC 7807 Problem Details format
  - Previous format: `{ message: "..." }`
  - New format: `{ type: "about:blank", title: "...", status: 404, detail: "..." }`
  - HttpException responses are unchanged for backward compatibility

## [0.9.3] - 2026-01-05

### Fixed

- **LegacyAttributeFactory Type Fix**: Fixed type definitions for `LegacyClassAttribute` and `LegacyClassSchemaAttribute` to properly support method decorators. Changed from complex function intersection types to simpler `ClassDecorator & MethodDecorator` types that TypeScript can correctly resolve.

## [0.9.2] - 2026-01-05

### Added

- **Legacy-Compatible Factory Decorator**: Added `Factory` decorator to `@navios/core/legacy-compat` for use with TypeScript experimental decorators, following the same pattern as the `Injectable` decorator

## [0.9.1] - 2026-01-02

### Added

- **Legacy-Compatible Injectable Decorator**: Added `Injectable` decorator to `@navios/core/legacy-compat` for use with TypeScript experimental decorators
- **Legacy-Compatible AttributeFactory**: Added `LegacyAttributeFactory` (also exported as `AttributeFactory`) to `@navios/core/legacy-compat` for creating custom attribute decorators with legacy decorator support
- **Context Compatibility Exports**: Exported `createClassContext` and `createMethodContext` utilities from `@navios/core/legacy-compat` for building custom legacy-compatible decorators

### Changed

- **AttributeFactory Navios-Managed Support**: Updated `AttributeFactory` to support classes with Navios-managed metadata (not just `@Controller` and `@Module`)
- **Stream Decorator Bun Compatibility**: Updated `@Stream` decorator type to support handlers without `reply` parameter for Bun runtime compatibility

## [0.9.0] - 2025-12-23

### Added

- **Priority and Scope Options in Decorators**: Extended decorator options to leverage new DI features
  - `@Controller()` now accepts `priority?: number` and `scope?: InjectableScope` options
  - `@Module()` now accepts `priority?: number` and `registry?: Registry` options
- **New TestingModule API**: Completely refactored testing module with improved ergonomics
  - New `TestingModule.create()` static method as the primary entry point
  - Fluent API with `overrideProvider(token).useValue()` / `.useClass()` for mocking
  - Automatic request scope creation on `init()` for proper request-scoped service resolution
  - New `getScopedContainer()` method for accessing the request-scoped container
  - Comprehensive assertion helpers delegated from `TestContainer`:
    - `expectResolved()`, `expectNotResolved()` - service resolution tracking
    - `expectSingleton()`, `expectTransient()`, `expectRequestScoped()` - scope assertions
    - `expectCalled()`, `expectCalledWith()`, `expectCallCount()` - method call assertions
    - `recordMethodCall()`, `getMethodCalls()` - manual call tracking
    - `getDependencyGraph()`, `getSimplifiedDependencyGraph()` - debugging utilities
- **New UnitTestingModule**: Lightweight testing module for isolated unit tests
  - Does NOT load Navios modules or create an application
  - Uses `UnitTestContainer` with strict mode by default
  - Automatic method call tracking via Proxy
  - Auto-mocking mode for unregistered dependencies
  - Provider-based configuration: `UnitTestingModule.create({ providers: [...] })`
  - Methods: `get()`, `close()`, `enableAutoMocking()`, `disableAutoMocking()`
  - Lifecycle assertions: `expectInitialized()`, `expectDestroyed()`, `expectNotDestroyed()`

### Changed

- **Registry Support in NaviosFactory**: Factory now passes `options.registry` to Container constructor
  - Allows custom registries to be used when creating applications
- **NaviosApplication Options Simplified**: Merged `NaviosApplicationContextOptions` into `NaviosApplicationOptions`
  - Added `registry?: Registry` option directly to application options
- **NaviosEnvironment**: Changed `setupHttpEnvironment()` to merge tokens instead of replacing
  - Allows multiple adapters to contribute HTTP tokens
- **Module Loader Service**: Uses `getInjectableToken()` for more reliable module name resolution
- **Legacy Decorators Type Fix**: Fixed URL parameter type inference in multipart and stream decorators
  - URL parameters now correctly typed as `string` instead of `string | number`

### Deprecated

- `createTestingModule()` function is deprecated in favor of `TestingModule.create()`

### Dependencies

- Updated to `@navios/di` 0.9.0 with priority system, unified storage architecture, and enhanced testing utilities

## [0.8.0] - 2025-12-21

### Added

- **Handler Result Types**: New `HandlerResult`, `StaticHandler`, and `DynamicHandler` types for optimized handler dispatch
  - Enables static/dynamic branching for performance optimization in adapters
  - Pre-resolved controllers can use static handlers without per-request container creation
- **Response Validation Control**: New `validateResponses?: boolean` option in `NaviosApplicationOptions`
  - Allows disabling response validation for performance in production
- **Request ID Control**: New `enableRequestId?: boolean` option for async local storage optimization
  - Can be disabled when request ID tracking is not needed
- **Static Guard Execution**: New `runGuardsStatic()` method in `GuardRunnerService`
  - Allows running pre-resolved guard instances for improved performance
- **Registry Support in Controllers**: `@Controller()` decorator now accepts optional `registry` parameter
  - Enables custom registries for controller-level dependency overrides
- **NaviosOptionsToken**: New injection token for accessing application options from services
- **InstanceResolverService Export**: Now exported from `@navios/core/services`

### Changed

- **Handler Adapter Interface**: `provideHandler()` now returns `Promise<HandlerResult>` instead of direct handler function
  - Enables adapters to distinguish between static and dynamic handlers
- **Endpoint Decorator Flexibility**: Now supports optional parameters and no-parameter handlers
- **Logger Cleanup**: Removed debug console.log statements

### Performance

- Static/dynamic handler branching eliminates unnecessary container creation for singleton controllers
- Guards can be pre-resolved at startup for faster request handling
- Response validation can be disabled for production performance

## [0.7.1] - 2025-12-20

### Added

- **Plugin System**: New plugin architecture allowing third-party extensions to integrate with Navios applications
  - `NaviosPlugin` interface for defining plugins with registration hooks
  - `PluginContext` interface providing access to modules, server, container, and module loader
  - `PluginDefinition` type for plugin factory functions
  - `app.usePlugin()` method for registering plugins on NaviosApplication
- **Module Extensions**: New `ModuleLoaderService.extendModules()` method allowing plugins to dynamically add modules or controllers to the application after initial module loading

### Changed

- Enhanced JSDoc documentation for `AbstractHttpAdapterInterface` with comprehensive type parameter documentation and method descriptions

### Fixed

- Fixed logger setup in `NaviosFactory` to properly handle early return when logger is disabled
- Fixed package.json exports to use correct CommonJS file extensions (`.cjs` and `.d.cts`)

---

## [0.7.0] - 2025-12-18

### Added

- **Testing Module**: New `TestingModule` class and `createTestingModule` function for easier testing setup with dependency overrides
- **Config Service**: New `ConfigService` for managing application configuration with type-safe access
- **Logger System**: Comprehensive logging system with multiple log levels (error, warn, log, debug, verbose, fatal) and customizable output
- **Attribute Factory**: `AttributeFactory` for creating custom metadata decorators that can be applied to modules, controllers, and endpoints
- **Exception Classes**: Complete set of HTTP exception classes:
  - `HttpException` (base class)
  - `BadRequestException`
  - `UnauthorizedException`
  - `ForbiddenException`
  - `NotFoundException`
  - `ConflictException`
  - `InternalServerErrorException`
- **Decorators**: Full set of decorators for building Navios applications:
  - `@Module()` - Define application modules
  - `@Controller()` - Define request controllers
  - `@Endpoint()` - Define HTTP endpoints with type-safe request/response schemas
  - `@Multipart()` - Define multipart/form-data endpoints for file uploads
  - `@Stream()` - Define streaming endpoints
  - `@UseGuards()` - Apply guards to controllers or endpoints
  - `@Header()` - Set custom response headers
  - `@HttpCode()` - Set custom HTTP status codes
- **Legacy-Compatible Decorators**: Complete set of decorators compatible with TypeScript experimental decorators, available from `@navios/core/legacy-compat`:
  - All standard decorators (`@Module`, `@Controller`, `@Endpoint`, `@Multipart`, `@Stream`, `@UseGuards`, `@Header`, `@HttpCode`) with legacy decorator API support
  - Seamless conversion from experimental decorator format to Stage 3 format internally
  - Full type safety and feature parity with standard decorators
- **Core Application APIs**:
  - `NaviosFactory.create()` - Factory method for creating Navios applications
  - `NaviosApplication` - Main application class with methods for:
    - `init()` - Initialize the application
    - `listen()` - Start the HTTP server
    - `setGlobalPrefix()` - Set a global URL prefix
    - `enableCors()` - Enable CORS support
    - `enableMultipart()` - Enable multipart/form-data support
    - `getServer()` - Get the underlying HTTP server instance
    - `getContainer()` - Get the dependency injection container
    - `dispose()` / `close()` - Clean up resources
- **Guards System**: `CanActivate` interface for implementing request guards (authentication, authorization, etc.)
- **Type Utilities**: Type-safe utilities for endpoint parameters and results:
  - `EndpointParams<T>` - Extract typed parameters from endpoint definitions
  - `EndpointResult<T>` - Extract typed return values from endpoint definitions
  - `MultipartParams<T>` - Extract typed parameters for multipart endpoints
  - `StreamParams<T>` - Extract typed parameters for stream endpoints
- **Dependency Injection**: Full integration with `@navios/di` for dependency injection
- **Adapter Support**: Adapter-based architecture supporting multiple HTTP server implementations (Fastify, Bun)

### Features

- **Type Safety**: Full TypeScript support with type inference for endpoints, requests, and responses
- **Zod Integration**: Built-in support for Zod schema validation for request/response validation
- **Modular Architecture**: Organize code into modules with clear boundaries and dependency management
- **Extensible**: Custom attributes system for adding metadata to modules, controllers, and endpoints
- **Testing Support**: Comprehensive testing utilities for unit and integration tests

### Documentation

- Complete README with getting started guide
- Comprehensive documentation in `/docs` covering:
  - Quick Start Guide
  - Application Setup and Configuration
  - Modules, Controllers, and Endpoints
  - Services and Dependency Injection
  - Guards and Exception Handling
  - Attributes System
  - HTTP Server Adapters
  - Testing Guide

### Dependencies

- `@navios/di` - Dependency injection container
- `@navios/builder` (peer dependency) - Type-safe API definitions
- `zod` (peer dependency) - Schema validation
