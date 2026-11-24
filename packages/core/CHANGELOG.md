# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - Unreleased

The request pipeline, the application class and the adapter contract are rewritten. Endpoint declarations made with `@navios/builder` are unchanged. See [docs/migration.md](./docs/migration.md) for a 1.x to 2.0 guide.

### Breaking

- **Controllers are singletons.** A controller that injects a request-scoped service fails at `init()` with a scope mismatch. Per-request data comes from the `RequestContext` passed to each handler.
- **Guards receive a `RequestContext`** instead of `AbstractExecutionContext`: `canActivate(ctx)`. Guards are singletons, and they run before the request is validated and before the body is read. Only `true` lets a request through; 1.x accepted any truthy value.
- **Every error response is `application/problem+json`** unless the endpoint declares a body for that status in `errorSchema`. This changes the body of `HttpException` responses, validation errors (now `source` and `errors: [{ path, message }]`) and not-found responses.
- **The message of an unexpected error is no longer sent to the client.** The response is a generic 500 problem. Opt in with `exposeErrorDetails: true`.
- **Status codes come from the declaration.** `@HttpCode` is removed; declare `responses: { 201: schema }` and return `reply(201, body)`. An endpoint declared with `responses` must return `reply()`.
- **`@Multipart` and `@Stream` are removed.** `@Endpoint` and `handler()` serve every endpoint; `body: 'multipart'` and `response: 'stream' | 'text' | 'blob' | 'void'` in the declaration decide how. Stream handlers return a `ReadableStream` or an async iterable and no longer receive the native reply.
- **`EndpointParams` / `EndpointResult` are renamed** `HandlerParams` / `HandlerResult`, so that they no longer collide with the builder's client-side types.
- **`@Module({ overrides })` is removed.** Use `@Module({ providers: [provide(Token, Impl)] })`. Providers are application-wide.
- **`app.enableCors()`, `app.enableMultipart()` and `app.setGlobalPrefix()` are removed.** CORS and multipart are options of the adapter factory; the prefix is the `globalPrefix` application option.
- **Plugins have one shape.** `definePlugin({ name, dependsOn?, setup(api, options) })` replaces the ten staged `define…Plugin` helpers and the legacy `NaviosPlugin`.
- **The adapter contract is new.** `HttpAdapter` (`register`, `setNotFound`, `ready`, `listen`, `inject`, `close`) with `RouteInput` and `RouteResult` replaces the handler-adapter services. Adapters written for 1.x do not work.
- **`@navios/core/legacy-compat` shrinks** to `Controller`, `Module`, `Endpoint`, `UseGuards`, `UseInterceptors`, `Injectable`, `Factory` and `AttributeFactory`.
- **`@navios/di` 2.0** is re-exported, with its own breaking changes: registries and priorities are removed, a singleton cannot depend on a request-scoped service, `container.beginRequest()` is `container.createScope()`.

### Added

- **`handler()` field form.** `getUser = handler(getUser, ({ urlParams }, ctx) => ...)` defines a handler as a class field with parameters and return type inferred from the declaration. An options object carries `guards`, `interceptors` and `attributes`.
- **`RequestContext`**, passed to guards, interceptors and handlers: `id`, `method`, `path`, `urlParams`, `query`, `route`, `headers`, `cookies`, `signal`, `reply.header()`, `reply.cookie()`, `onFinish()` and `raw`.
- **`Register` declaration** that types `ctx.raw` and `app.getServer()` for the application's adapter.
- **Context keys**: `createContextKey<T>(name)` with `ctx.set`, `ctx.get`, `ctx.find` and `ctx.has`, a typed way for a guard to hand data to a handler.
- **Request values**: `@RequestValue()` classes whose `resolve(ctx)` computes a value at most once per request on first `ctx.get()`, with an optional `dispose(value, ctx)`. `@Module({ requestValues })` builds them while the application initialises.
- **`ctx.use(Token)` and `ctx.resolve(Token)`** for request-scoped services. The DI scope is created on first use, so requests that do not use one have no scope. `RequestContextToken` gives the context inside such a service.
- **`requestScopedServices: 'allow' | 'warn' | 'forbid'`** application option.
- **Interceptors**: `Interceptor.intercept(ctx, next)`, attached with `app.intercept()`, `@Module({ interceptors })`, `@Controller({ interceptors })`, `@UseInterceptors()` or `handler()` options.
- **`app.mapError(ErrorClass, mapper)`** maps domain errors to responses; the most specific registered class wins.
- **`reply(status, body)` for declared error statuses.** A status in `errorSchema` can be returned with a type-checked body.
- **`TooManyRequestsException` (429) and `UnprocessableEntityException` (422).** `HttpException` now extends `Error` and accepts a `cause`.
- **`problem()`**, `ValidationError` and the replaceable responders `NotFoundResponderToken`, `ForbiddenResponderToken`, `ValidationErrorResponderToken` and `InternalServerErrorResponderToken`.
- **Server-sent events**: `sseStream(source)` answers a `response: 'stream'` endpoint with `text/event-stream`; `sse(event, payload)` creates a typed, validated event from an event declaration.
- **Module `prefix`**, composed through imports after the application's `globalPrefix`. A prefix may have URL parameters.
- **`app.routes()`** returns the compiled routes as `RouteInfo`; `ctx.route` is the same object. `AttributeFactory.get/getAll/has` read attributes from a `RouteInfo`, resolving handler, then controller, then module.
- **Lifecycle**: `onApplicationBootstrap()` and `onApplicationShutdown(signal?)` on any singleton, `app.enableShutdownHooks()`, the `shutdownTimeout` option, and `await using` support.
- **`app.inject(request)`** handles a request in process on any adapter.
- **`@navios/core/testing`**: `defineInMemoryEnvironment()`, an adapter without a server, and `createTestClient(app)`, a typed wrapper over `app.inject()`.
- **`@navios/core/conformance`**: `runAdapterConformance()`, the behaviour every adapter must show, run over real HTTP with any test runner.
- **`asyncContext` option and `currentContext()`** for code that cannot receive the context as an argument.
- **`validateResponses: 'always' | 'development' | 'never'`** and **`exposeErrorDetails`** application options.
- **Standard Schema everywhere.** Endpoint schemas, attribute schemas and `provideConfig({ schema })` accept any Standard Schema library.
- **`createMultipartCollector(schema)`** for adapters, which builds a multipart body from parts.
- `response: 'void'` endpoints (204, no body) and per-status `responses` endpoints.

### Changed

- **One stage order on every adapter**: interceptors enter, guards, request validation (URL parameters, query, then body), handler, response validation, interceptors exit, error mapping.
- **Response validation is the same on every adapter** and is on by default. It strips fields the schema does not declare. A body that fails its schema is a 500.
- **Module guards and interceptors are computed per application** as a union over the import graph. Class metadata is not modified, so two applications in one process do not affect each other and the result does not depend on import order.
- **`onModuleInit` runs in dependency order**, one module at a time, imported modules first.
- **`app.close()`** waits for in-flight requests, runs shutdown hooks and disposes the container, which runs `onServiceDestroy`. `app.dispose()` is an alias.
- **`logger: false`** binds a no-op logger; an object passed as `logger` is used as the output of every injected `Logger`.
- **`provideConfig({ schema, load })`** validates the loaded value and types the service from the schema.
- **Multipart bodies** are collected into one object of strings and `File` values and validated as a whole, identically on every adapter.
- `zod` is no longer a dependency of `@navios/core`.

### Removed

- `@HttpCode`, `@Header`, `@Multipart`, `@Stream` and their parameter types.
- `AbstractExecutionContext`, `CanActivate`, and the `Request`, `Reply` and `ExecutionContext` injection tokens.
- `AbstractHandlerAdapterService`, `InstanceResolverService`, `GuardRunnerService`, and the endpoint, multipart and stream adapter tokens.
- The staged plugin system: `PluginStages`, the stage context types and the ten `define…Plugin` helpers.
- `TestingModule`.
- `ZodBaseEndpointOptions`, `ZodEndpointOptions` and `ZodSchemaSlots`.
- `@Module({ overrides })`, `@Injectable({ priority })` and `@Injectable({ registry })`.

### Fixed

- **Guards run before validation on every adapter.** On Fastify 1.x an unauthenticated request with an invalid body received the 400 validation response and the guard was never called.
- **A response body is validated for the status actually sent.** With `@HttpCode(201)` on Fastify 1.x the schema was registered for 200 only and a non-conforming 201 body was sent unvalidated.
- **`app.close()` disposes the container**, so `onServiceDestroy` hooks run.
- **Declaring the same method and path twice is an error at `init()`** that names both handlers.
- **Importing a module no longer changes another application's guards.**

### Performance

Measured with `yarn bench --check` in `packages/adapter-fastify`: Node 24.22, production mode, `fastify.inject`, best of 7 rounds. The baseline is raw Fastify doing the same Zod validation by hand. Run-to-run variation is a few tenths of a microsecond.

| Case                                                  | Raw Fastify | Navios 2.0 | Overhead | 1.x overhead |
| ----------------------------------------------------- | ----------- | ---------- | -------- | ------------ |
| GET, response schema                                  | 7.40 µs     | 7.38 µs    | about 0  | +2.7 µs      |
| POST, query + body + response schema                  | 23.14 µs    | 23.40 µs   | +0.26 µs | +1.7 µs      |
| GET with one guard                                    | 7.40 µs     | 7.61 µs    | +0.21 µs | +3.5 µs      |
| GET reading one request value                         | 7.40 µs     | 7.99 µs    | +0.59 µs | n/a          |
| GET using one request-scoped service (2 dependencies) | 7.40 µs     | 8.70 µs    | +1.30 µs | +16.8 µs     |

- ESM output is 78 KB, down from 298 KB.

### Added after the first 2.0 draft

- `result(kind, body)` for custom response kinds; response encoders run inside the pipeline and receive the request context.
- `registerController` and `registerModule` for code built without a decorator transform; `attributes` in controller and module options.
- `ctx.onFinish(callback)` and `ctx.responseStatus`.

### Known limitations

- `headersSchema` and `cookiesSchema` are validated by core when a declaration carries them, but `@navios/builder` does not accept them yet.
- `createTestClient` returns the raw status and body. It is not the builder client and does not validate or type the response.
- `requestScopedServices` is checked at the first `ctx.use()` of a token, not at `init()`.
- A cycle between request values is detected only when they read each other synchronously.
- `@navios/otel*`, `@navios/openapi*`, `@navios/adapter-xml`, `@navios/schedule`, `@navios/queues`, `@navios/microservice` and `@navios/jwt` are not ported to this version yet.

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

## [1.0.0-alpha.1] - 2026-01-22

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

## [0.7.1] - 2025-12-18

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

---

## [Unreleased]

### Planned

- Additional adapter implementations
- Enhanced middleware support
- WebSocket support
- Performance optimizations
