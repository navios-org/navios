# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
