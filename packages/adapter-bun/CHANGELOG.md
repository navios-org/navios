# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - Unreleased

The adapter is rewritten on the `@navios/core` 2.0 adapter contract. It no longer contains guard, validation or error-handling logic; those run in core and are the same on every adapter.

### Breaking

- **CORS is an adapter option.** `defineBunEnvironment({ cors })` replaces `app.enableCors()`.
- **Stream handlers no longer return a `Response`.** Return a `ReadableStream` or an async iterable from an endpoint declared with `response: 'stream'`.
- **The per-request injection tokens are removed.** Use `ctx.raw.request` and `ctx.raw.server`.
- **Error bodies are `application/problem+json`** documents produced by core. A denied guard used to answer with the text `Forbidden`.
- **Response validation is on by default**, as on Fastify. It used to be opt-in on Bun.
- Requires `@navios/core` 2.0.

### Added

- **`BunEnvironment`** for the `Register` declaration, which types `ctx.raw` as `{ request: Request; server: Server | null }` and `app.getServer()` as the Bun `Server`.
- **`serve` option** for extra `Bun.serve` options.
- **`errorSchema` is honoured**: a declared error status is sent with its declared body.
- **`app.inject()`** runs a request through the route handlers and CORS handling without a socket.
- The `@navios/core/conformance` suite runs against the adapter over real HTTP under `bun test`.
- Serves `response: 'void'` endpoints (204, no body) and per-status `responses` endpoints.

### Changed

- **CORS headers are applied once per response** in the adapter, including error and not-found responses, instead of in each handler branch.
- `close()` waits for in-flight requests up to the application's `shutdownTimeout`, then stops the server forcibly.
- A malformed JSON body is a 400 problem response with `source: 'body'`.
- A result that cannot be written, such as a body `JSON.stringify` rejects, is a 500 problem response.
- Multipart bodies need no option. Fields and files are collected into one object and validated against `requestSchema`.
- A request scope is released when the response body has been sent, at the end of a stream, or when the client disconnects.

### Removed

- `BunFakeReply` and the Bun handler-adapter services for endpoints, streams and multipart, with their tokens.

### Fixed

- **A handler result that fails its response schema is a 500.** It used to be answered as a 400 validation error, as if the request were at fault.

### Performance

- ESM output is 15 KB, down from 97 KB.
- The request pipeline is the one measured in the `@navios/adapter-fastify` changelog. No Bun-specific benchmark has been run.

## [1.1.0] - 2026-01-15

### Added

- **BunControllerAdapterToken**: New injection token for `BunControllerAdapterService`
  - Allows overriding the default controller adapter with custom implementations
  - Enables instrumentation, tracing, and middleware-like behavior
  - Used by `@navios/otel-bun` for OpenTelemetry tracing integration

### Dependencies

- Updated to support `@navios/core` ^1.1.0 with staged plugin system

## [1.0.0] - 2026-01-09

### Added

- **Stable Release**: First stable release of @navios/adapter-bun
  - Production-ready Bun HTTP adapter for Navios framework
  - Optimized for Bun runtime performance
  - Full feature parity with other adapters

## [1.0.0-alpha.4] - 2026-01-09

### Added

- **BunEnvironment Type**: New `BunEnvironment` interface for type-safe application configuration
  - Provides typed access to Bun-specific options throughout the application
  - Includes types for `Server`, `BunCorsOptions`, `BunListenOptions`, and `BunApplicationOptions`
  - Use with `NaviosFactory.create<BunEnvironment>(...)` for full type safety
- **AdapterToken Support**: Environment now registers adapter with `AdapterToken` for unified adapter access

### Changed

- **Environment Definition**: `defineBunEnvironment()` now returns `tokens` instead of `httpTokens`
  - Aligns with new unified adapter architecture in `@navios/core`
- **Application Service**: Implements new `AbstractAdapterInterface` lifecycle methods
  - `setupAdapter()` replaces direct configuration; merges with `configure()` options
  - `configure()` method for pre-init configuration (called before `init()`)
- **Listen Options**: Changed `host` parameter to `hostname` in `BunListenOptions`
  - Aligns with Bun's native `Serve.Options` type
- **Interface Simplification**: `BunApplicationServiceInterface` now extends `AbstractHttpAdapterInterface<BunEnvironment>`
  - Removed redundant method signatures inherited from base interface
- **Documentation Updates**: Updated JSDoc examples to use new `configure()` + `init()` pattern

### Breaking Changes

- **Listen Options**: `host` renamed to `hostname`
  - Before: `await server.listen({ port: 3000, host: 'localhost' })`
  - After: `await server.listen({ port: 3000, hostname: 'localhost' })`
- **Setup Method**: `setupHttpServer()` replaced with `configure()` + `init()`
  - Before: `await app.setupHttpServer({ development: true })`
  - After: `app.configure({ development: true }); await app.init()`

### Dependencies

- Updated to support `@navios/core` ^1.0.0-alpha.4

## [1.0.0-alpha.3] - 2026-01-08

### Added

- **Abstract Base Class**: New `AbstractBunHandlerAdapterService` base class for Bun adapters
  - Provides shared argument parsing logic (query, body, URL params)
  - Extends `AbstractHandlerAdapterService` from `@navios/core`
  - Reduces code duplication across endpoint, stream, and multipart adapters
- **Comprehensive Test Suite**: Added unit tests for all adapter services
  - `cors.util.spec.mts` - CORS utility tests
  - `endpoint-adapter.service.spec.mts` - Endpoint adapter tests
  - `multipart-adapter.service.spec.mts` - Multipart adapter tests
  - `stream-adapter.service.spec.mts` - Stream adapter tests

### Changed

- **Refactored Adapter Architecture**: All adapter services now extend the new abstract base class
  - `BunEndpointAdapterService` extends `AbstractBunHandlerAdapterService`
  - `BunStreamAdapterService` extends `AbstractBunHandlerAdapterService`
  - `BunMultipartAdapterService` extends `BunEndpointAdapterService`
- **Simplified Handler Creation**: Handler creation logic moved to base class with template method pattern
  - Concrete adapters implement `createStaticHandler()` and `createDynamicHandler()`
  - Common logic (argument preparation, controller resolution) handled by base class

### Dependencies

- Updated to support `@navios/core` ^1.0.0-alpha.3

## [1.0.0-alpha.2] - 2026-01-07

### Changed

- **Updated Builder Types**: Adapter services now use `EndpointOptions` from `@navios/builder` instead of legacy `BaseEndpointConfig`
  - `BunEndpointAdapterService.hasSchema()` - Updated type signature
  - `BunEndpointAdapterService.provideSchema()` - Updated type signature
  - `BunEndpointAdapterService.provideHandler()` - Updated type signature
  - `BunMultipartAdapterService.prepareArguments()` - Updated type signature
  - `BunStreamAdapterService` - Updated to use `BaseEndpointOptions`
- **Removed TypeScript Suppression Comments**: Cleaned up `@ts-expect-error` comments in multipart adapter that are no longer needed

### Dependencies

- Updated to support `@navios/core` ^1.0.0-alpha.2
- Updated to support `@navios/builder` ^1.0.0-alpha.2

## [1.0.0-alpha.1] - 2026-01-07

### Added

- **CORS Support**: Full CORS (Cross-Origin Resource Sharing) implementation for the Bun adapter
  - Support for all standard CORS options: `origin`, `methods`, `allowedHeaders`, `exposedHeaders`, `credentials`, `maxAge`, `cacheControl`
  - Dynamic origin validation with support for:
    - String origins (exact match)
    - Boolean values (`true` for all origins, `false` to disable)
    - RegExp patterns for flexible origin matching
    - Arrays of origin patterns
    - Function-based dynamic origin validation
  - Automatic preflight (OPTIONS) request handling
  - CORS headers applied to all responses including error responses and 404s
  - Proper `Vary` header handling for cache compatibility
  - Security validation (prevents wildcard origin with credentials)
- **New CORS Utilities Module**: `src/utils/cors.util.mts` with comprehensive CORS utilities
  - `calculateCorsHeaders()` - Calculates CORS headers for regular requests
  - `calculatePreflightHeaders()` - Calculates headers for OPTIONS preflight requests
  - `isPreflight()` - Detects preflight requests
  - `applyCorsToResponse()` - Applies CORS headers to Response objects
  - `BunCorsOptions` interface extending core CORS options with function-based origin support
- **Enhanced Error Handling**: Improved 404 error responses with proper CORS header application
- **Comprehensive CORS Testing**: Added extensive E2E test suite (`e2e/endpoints/cors.spec.mts`) covering:
  - Origin validation (string, boolean, RegExp, array, function)
  - Preflight request handling
  - Credentials support
  - Exposed headers
  - Method restrictions
  - Header restrictions
  - Max age configuration
  - Error response CORS headers

### Changed

- **Interface Updates**: `BunApplicationServiceInterface` now supports `BunCorsOptions` instead of `never` for CORS
- **Application Service**: `BunApplicationService.enableCors()` now accepts and processes CORS options
- **Controller Adapter**: All request handlers now apply CORS headers to responses
- **Request Handling**: Fallback handler now properly handles CORS preflight requests and applies CORS to 404 responses
- **Exports**: Added exports for interfaces and utilities in `src/index.mts`

### Fixed

- 404 responses now include proper CORS headers when CORS is enabled
- Preflight OPTIONS requests are now handled correctly at the adapter level

### Dependencies

- Updated to support `@navios/core` ^0.9.0

## [0.9.0] - 2025-12-23

### Dependencies

- Updated to support `@navios/core` ^0.9.0

## [0.8.0] - 2025-12-21

### Added

- **Static/Dynamic Handler Branching**: New `BunStaticHandler` and `BunDynamicHandler` types for optimized request handling
  - Static handlers for singleton controllers avoid per-request container creation
  - Dynamic handlers maintain full scoped container support when needed
- **Guard Pre-resolution**: Guards are now resolved at startup with fallback to dynamic resolution
- **Async Handler Detection**: Automatically detects if argument getters are async and uses appropriate formatting

### Changed

- **Handler Result Types**: `provideHandler()` now returns `Promise<BunHandlerResult>` instead of direct handler function
  - Aligns with `@navios/core` 0.8.0 `HandlerResult` interface
- **Controller Pre-resolution**: Controllers are pre-resolved during initialization for static handler optimization

### Performance

- Static handler path eliminates unnecessary scoped container creation for singleton controllers
- Pre-resolved guards reduce per-request resolution overhead
- Optimized argument formatting based on async detection

### Dependencies

- Requires `@navios/core` ^0.8.0

## [0.7.1] - 2025-12-18

### Added

- **Global Prefix Getter**: Added `getGlobalPrefix()` method to `BunApplicationService` to retrieve the current global route prefix, aligning with the `AbstractHttpAdapterInterface` contract

### Fixed

- Fixed package.json exports to use correct CommonJS file extensions (`.cjs` and `.d.cts` instead of `.js` and `.d.ts`)

### Changed

- Updated `@types/bun` dependency from `^1.3.4` to `^1.3.5`

---

## [0.7.0] - 2025-01-XX

### Added

- **Comprehensive JSDoc Documentation**: Added detailed JSDoc comments to all public APIs including:
  - `defineBunEnvironment` function with configuration options
  - `BunApplicationService` class and all methods (`setupHttpServer`, `initServer`, `ready`, `setGlobalPrefix`, `getServer`, `listen`, `dispose`)
  - Adapter services (`BunEndpointAdapterService`, `BunStreamAdapterService`, `BunMultipartAdapterService`)
  - `BunControllerAdapterService` class
  - Type definitions and interfaces (`BunApplicationOptions`, `BunListenOptions`, `BunApplicationServiceInterface`, `BunHandlerAdapterInterface`, `BunExecutionContext`)
  - Injection tokens (`BunApplicationServiceToken`, `BunServerToken`, `BunRequestToken`, `BunEndpointAdapterToken`, `BunStreamAdapterToken`, `BunMultipartAdapterToken`)
- **Enhanced README**: Improved documentation with better examples and clearer API reference

### Documentation

- Complete JSDoc comments for better IDE support and developer experience
- Updated README with comprehensive examples and API documentation
- Clarified usage patterns and configuration options
- Added examples for different server configurations and options
