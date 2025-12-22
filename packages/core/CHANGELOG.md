# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
