# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0-alpha.0] - Unreleased

The adapter is rewritten on the adapter contract of `@navios/server` 2.0, the package that now holds the HTTP layer of Navios. It no longer contains guard, validation or error-handling logic; those run in the request pipeline of `@navios/server` and are the same on every adapter.

### Breaking

- **CORS is an adapter option.** `defineBunEnvironment({ cors })` replaces `app.enableCors()`.
- **Stream handlers no longer return a `Response`.** Return a `ReadableStream` or an async iterable from an endpoint declared with `response: 'stream'`.
- **The per-request injection tokens are removed.** Use `ctx.raw.request` and `ctx.raw.server`.
- **Error bodies are `application/problem+json`** documents produced by `@navios/server`. A denied guard used to answer with the text `Forbidden`.
- **Response validation is on by default**, as on Fastify. It used to be opt-in on Bun.
- **A body is JSON only when its content type says so.** Text is a string, and a body of another type, or of none, is a 415 for an endpoint that reads it, as on Fastify. Every body was parsed as JSON, so a browser could send one across sites without a CORS preflight.
- **JSON with a `__proto__` or `constructor.prototype` key is a 400**, as on Fastify.
- Requires `@navios/server` 2.0, with `@navios/core` 2.0.

### Added

- **`BunEnvironment`** for the `Register` declaration, which types `ctx.raw` as `{ request: Request; server: Server | null }` and `app.getServer()` as the Bun `Server`.
- **`serve` option** for extra `Bun.serve` options. With `serve.unix` the server listens on a unix socket.
- **WebSockets**: with `serve.websocket`, a handler upgrades its request with `ctx.raw.server.upgrade()`, whatever its endpoint declares. `BunEnvironment<Data>` and `defineBunEnvironment<Data>()` type the data of the sockets.
- **`errorSchema` is honoured**: a declared error status is sent with its declared body.
- **`app.inject()`** runs a request through the route handlers and CORS handling without a socket. It rejects once the application is closed.
- **`ctx.ip`** is the address of the connection, also for a chunked body. **`ctx.rawBody()`** gives the bytes of a body, also of a multipart one before it is decoded.
- The `@navios/server/conformance` suite runs against the adapter over real HTTP under `bun test`.
- Serves `response: 'void'` endpoints (204, no body) and per-status `responses` endpoints.

### Changed

- **CORS headers are applied once per response** in the adapter, including error and not-found responses, instead of in each handler branch. A preflight request to a path with an `OPTIONS` route is answered by the adapter as well.
- **The `origin` function is asked before the handler runs, and may return a promise of its answer** instead of calling back, or the answer itself when it takes no callback. The answer is compared with the origin, like the option itself: a boolean, a string, a `RegExp` or a list. An error of it is a logged 500; it was ignored, and an `async` function that did not call back left the request without an answer.
- `close()` waits for in-flight requests up to the application's `shutdownTimeout`, then stops the server forcibly. It does not wait for connections without a request, or for WebSockets.
- **An event stream is not subject to `serve.idleTimeout`**, with which Bun closes a connection that is quiet for 10 seconds. That of `sseStream()` is opened with a comment: Bun holds back the headers of a response until its first bytes.
- **A URL parameter that is not valid percent-encoding is a 400**, as on Fastify. Bun puts replacement characters in its place.
- **An error that Bun raises while it sends a response is logged and answered with a 500 problem response**, for example for a `Bun.file()` that is not there. Bun answered with its own error page. `serve.error` replaces this.
- An endpoint with a method that Bun's router does not know makes the application fail to start, naming the route.
- A malformed JSON body is a 400 problem response with `source: 'body'`.
- A result that cannot be written, such as a body `JSON.stringify` rejects or a web `Response`, is a 500 problem response.
- Multipart bodies need no option. Fields and files are collected into one object and validated against `requestSchema`.
- A request is released at the end of a stream, when the client disconnects, or, for a body in memory, right after it was handed to Bun, which does not tell when it has been sent.

### Removed

- `BunFakeReply` and the Bun handler-adapter services for endpoints, streams and multipart, with their tokens.
- `calculateCorsHeaders`, `calculatePreflightHeaders`, `isPreflight`, `applyCorsToResponse` and `CorsHeaders`. CORS is the `cors` option.

### Fixed

- **A request body over `serve.maxRequestBodySize` is answered with 413 `application/problem+json`**, as on Fastify, for JSON, text and multipart bodies. Bun answered it with an empty 413 before the adapter saw the request. The adapter now enforces the limit itself: a `content-length` over the limit is rejected before guards run, and a body without one is counted while it is read.
- **The body limit holds for a body that the handler reads itself.** A body without a declared length (chunked transfer encoding) was only counted when the pipeline read it, so a handler calling `ctx.raw.request.text()` could be sent any amount. Reading the body of `ctx.raw.request` now fails with a 413 once it is over the limit.
- **A path with characters outside ASCII can be served**, and a `:` in a path is a colon: what followed it was taken for a URL parameter.
- **Query keys such as `constructor` and `__proto__` are ordinary keys.** `?constructor=x` gave `[Function, 'x']`, and `?__proto__=y` replaced the prototype of the query object. The query object has no prototype, as on Fastify.
- **A multipart body that cannot be parsed is a 400** problem response with `source: 'body'`, not a 500.
- **CORS: `Vary: Origin` is sent whenever the answer depends on the origin**, including to an origin that is not allowed and to a request without one. A cache could otherwise serve a response without CORS headers to an allowed origin.
- **CORS keeps a `Vary` header set by the handler** and adds `Origin` to it. It used to replace the header.
- **CORS: a `RegExp` with the flag `g` gives every request the same answer.** It allowed every other one.
- **CORS: `origin: ['*']` with `credentials: true` is rejected when the adapter is created**, like `origin: '*'`. It failed on every request with Bun's own error page.
- **A stream that cannot be sent is closed.**
- **An error while a stream is sent is logged by the application**, not printed by Bun.
- **A client that disconnects while it sends the body is not an application error.** The request ends as a 400 and nothing is logged.
- **`ctx.path`, `ctx.query` and `ctx.headers` work in `onFinish` and in the `finally` of a stream**, after Bun has let go of the request.
- **`app.inject()` chooses the route that a request over HTTP reaches.** It took the first route registered that matched and ignored a trailing slash, so a static route declared after a param route, and `/users/`, behaved differently in tests.
- **A handler result that fails its response schema is a 500.** It used to be answered as a 400 validation error, as if the request were at fault.

### Performance

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
