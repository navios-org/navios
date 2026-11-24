# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - Unreleased

The adapter is rewritten on the `@navios/core` 2.0 adapter contract. It no longer contains guard, validation or error-handling logic; those run in core and are the same on every adapter.

### Breaking

- **CORS and multipart are adapter options.** `defineFastifyEnvironment({ cors, multipart })` replaces `app.enableCors()` and `app.enableMultipart()`.
- **Stream handlers no longer receive `FastifyReply` as an argument.** Return a `ReadableStream` or an async iterable, or use `ctx.raw.reply` to take over the response.
- **`inject(FastifyRequestToken)` and the other per-request tokens are removed.** Use `ctx.raw.request` and `ctx.raw.reply`.
- **Fastify schema validation and `fastify-type-provider-zod` are no longer used.** Routes are registered without schemas, and error bodies are the `application/problem+json` documents produced by core.
- Requires `@navios/core` 2.0.

### Added

- **`FastifyEnvironment`** for the `Register` declaration, which types `ctx.raw` as `{ request: FastifyRequest; reply: FastifyReply }` and `app.getServer()` as `FastifyInstance`.
- **`configure` option**: a function called with the Fastify instance before routes are registered.
- **Taking over the response**: when a handler has sent the response through `ctx.raw.reply`, the adapter writes nothing.
- **`app.inject()`** through `fastify.inject()`.
- **`ctx.signal`** aborts when the client disconnects before the response is complete.
- The `@navios/core/conformance` suite runs against the adapter over real HTTP, including its cases for a request body over `bodyLimit` and a file over `multipart.limits.fileSize`.
- An HTTP benchmark against raw Fastify: `yarn bench`.
- Serves `response: 'void'` endpoints (204, no body) and per-status `responses` endpoints.

### Changed

- **Closing does not wait for keep-alive connections.** Responses sent while the server closes carry `connection: close`, and connections that become idle, or that never sent a request, are dropped.
- **Guards run before the body is parsed and validated.** JSON bodies are collected as text and parsed when the pipeline asks for the body. `bodyLimit` still applies.
- A malformed JSON body is a 400 problem response with `source: 'body'`.
- Errors raised by Fastify itself (for example 413 and 415) are answered as `application/problem+json`.
- Multipart files arrive as `File` objects, and the whole body is validated against `requestSchema`.
- A request scope is released when the response finishes or the connection closes, and only when the request created one.

### Removed

- The Fastify handler-adapter services for endpoints, streams and multipart, and their tokens.
- The `fastify-type-provider-zod` and `zod` dependencies.

### Fixed

- **Response validation is on by default.** The adapter treated an unset `validateResponses` as off, although the documented default is on.
- **An unauthenticated request no longer gets validation details.** Validation used to run before guards.
- **Response bodies are validated for statuses other than 200.**
- **A multipart body over one of `multipart.limits` is answered with 413 `application/problem+json`**, not 500. This covers `fileSize`, `files`, `fields` and `parts`; the other 4xx errors of `@fastify/multipart` keep their status as well. A field over `fieldSize`, which `@fastify/multipart` truncates silently, is rejected with 413 too.

### Performance

Measured with `yarn bench --check`: Node 24.22, production mode, `fastify.inject`, best of 7 rounds. The baseline is raw Fastify doing the same Zod validation by hand. Run-to-run variation is a few tenths of a microsecond.

| Case                                                  | Raw Fastify | Navios 2.0 | Overhead | 1.x overhead |
| ----------------------------------------------------- | ----------- | ---------- | -------- | ------------ |
| GET, response schema                                  | 7.40 µs     | 7.38 µs    | about 0  | +2.7 µs      |
| POST, query + body + response schema                  | 23.14 µs    | 23.40 µs   | +0.26 µs | +1.7 µs      |
| GET with one guard                                    | 7.40 µs     | 7.61 µs    | +0.21 µs | +3.5 µs      |
| GET reading one request value                         | 7.40 µs     | 7.99 µs    | +0.59 µs | n/a          |
| GET using one request-scoped service (2 dependencies) | 7.40 µs     | 8.70 µs    | +1.30 µs | +16.8 µs     |

- ESM output is 8 KB, down from 110 KB.

## [1.0.0] - 2026-01-09

### Added

- **Stable Release**: First stable release of @navios/adapter-fastify
  - Production-ready Fastify HTTP adapter for Navios framework
  - High performance HTTP server with rich plugin ecosystem
  - Full Node.js compatibility and comprehensive middleware support

## [1.0.0-alpha.4] - 2026-01-09

### Added

- **FastifyEnvironment Type**: New `FastifyEnvironment` interface for type-safe application configuration
  - Provides typed access to Fastify-specific options throughout the application
  - Includes types for `FastifyInstance`, `FastifyCorsOptions`, `FastifyMultipartOptions`, `FastifyListenOptions`, and `FastifyApplicationOptions`
  - Use with `NaviosFactory.create<FastifyEnvironment>(...)` for full type safety
- **AdapterToken Support**: Environment now registers adapter with `AdapterToken` for unified adapter access

### Changed

- **Environment Definition**: `defineFastifyEnvironment()` now returns `tokens` instead of `httpTokens`
  - Aligns with new unified adapter architecture in `@navios/core`
- **Application Service**: Implements new `AbstractAdapterInterface` lifecycle methods
  - `setupAdapter()` replaces `setupHttpServer()`; merges with `configure()` options
  - `configure()` method for pre-init configuration (called before `init()`)
- **Interface Simplification**: `FastifyApplicationServiceInterface` now extends `AbstractHttpAdapterInterface<FastifyEnvironment>`
  - Removed redundant method signatures inherited from base interface
- **Documentation Updates**: Updated JSDoc examples to use new `configure()` + `init()` pattern

### Breaking Changes

- **Setup Method**: `setupHttpServer()` replaced with `configure()` + `init()`
  - Before: `await app.setupHttpServer({ logger: true, trustProxy: true })`
  - After: `app.configure({ logger: true, trustProxy: true }); await app.init()`

### Dependencies

- Updated to support `@navios/core` ^1.0.0-alpha.4

## [1.0.0-alpha.3] - 2026-01-08

### Added

- **Custom Validator Compiler**: Added `FastifyValidatorCompilerService` to handle Zod v4 schema validation using `zod/v4/core` APIs
  - Uses `safeParse` from `zod/v4/core` for schema validation
  - Properly returns Zod errors for validation failures
- **Abstract Base Class**: New `AbstractFastifyHandlerAdapterService` base class for Fastify adapters
  - Provides shared argument parsing logic (query, body, URL params)
  - Extends `AbstractHandlerAdapterService` from `@navios/core`
  - Reduces code duplication across endpoint, stream, and multipart adapters
- **Comprehensive Test Suite**: Added unit tests for all services
  - `application.service.spec.mts` - Application service tests
  - `endpoint-adapter.service.spec.mts` - Endpoint adapter tests
  - `multipart-adapter.service.spec.mts` - Multipart adapter tests
  - `stream-adapter.service.spec.mts` - Stream adapter tests
  - `validator-compiler.service.spec.mts` - Validator compiler tests

### Changed

- **Zod v4 Core Support**: Updated error handling to support both `ZodError` and `$ZodError` from `zod/v4/core`
- **Validator Compiler**: Replaced `fastify-type-provider-zod` validator compiler with custom `FastifyValidatorCompilerService`
- **Refactored Adapter Architecture**: All adapter services now extend the new abstract base class
  - `FastifyEndpointAdapterService` extends `FastifyStreamAdapterService`
  - `FastifyStreamAdapterService` extends `AbstractFastifyHandlerAdapterService`
  - `FastifyMultipartAdapterService` extends `FastifyEndpointAdapterService`
- **Simplified Handler Creation**: Handler creation logic moved to base class with template method pattern
  - Concrete adapters implement `createStaticHandler()` and `createDynamicHandler()`
  - Common logic (argument preparation, controller resolution) handled by base class

### Dependencies

- Changed peer dependency from `@navios/di` to `@navios/builder`
- Updated to support `@navios/core` ^1.0.0-alpha.3

## [1.0.0-alpha.2] - 2026-01-07

### Changed

- **Updated Builder Types**: Adapter services now use `EndpointOptions` from `@navios/builder` instead of legacy `BaseEndpointConfig`
  - `FastifyEndpointAdapterService.hasSchema()` - Updated type signature
  - `FastifyEndpointAdapterService.provideSchema()` - Updated type signature
  - `FastifyEndpointAdapterService.provideHandler()` - Updated type signature
  - `FastifyMultipartAdapterService.prepareArguments()` - Updated type signature
  - `FastifyStreamAdapterService` - Updated to use `BaseEndpointOptions`

### Dependencies

- Updated to support `@navios/core` ^1.0.0-alpha.2
- Updated to support `@navios/builder` ^1.0.0-alpha.2

## [1.0.0-alpha.1] - 2026-01-22

### Changed

- **Error Response Format**: Updated to use RFC 7807 Problem Details format for framework-level errors
  - Validation errors (ZodError) now return Problem Details with structured error information
  - Not found routes return Problem Details format
  - Unhandled errors return Problem Details format
  - HttpException responses remain backward compatible (preserved original format)
- **Error Handling**: Integrated with `@navios/core` 1.0.0-alpha.1 error responder system
  - Uses `ErrorResponseProducerService` for standardized error responses
  - All error responses include `Content-Type: application/problem+json` header

### Dependencies

- Updated to support `@navios/core` ^1.0.0-alpha.1

## [0.9.0] - 2025-12-23

### Dependencies

- Updated to support `@navios/core` ^0.9.0
- Updated to support `@navios/di` ^0.9.0

## [0.8.0] - 2025-12-21

### Added

- **Static/Dynamic Handler Branching**: New `FastifyStaticHandler` and `FastifyDynamicHandler` types for optimized request handling
  - Static handlers for singleton controllers avoid per-request container creation
  - Dynamic handlers maintain full scoped container support when needed
- **Guard Pre-resolution**: Guards are now resolved at startup with fallback to dynamic resolution
- **Request Decoration**: Uses Fastify's `decorateRequest` to store scoped container for handler access
- **Lifecycle Hooks**: Added `onResponse` hook for non-blocking container cleanup

### Changed

- **Handler Result Types**: `provideHandler()` now returns `Promise<FastifyHandlerResult>` instead of direct handler function
  - Aligns with `@navios/core` 0.8.0 `HandlerResult` interface
- **Controller Pre-resolution**: Controllers are pre-resolved during initialization for static handler optimization
- **Multi-hook Architecture**: Separate `preHandler` and `handler` functions for optimized guard execution

### Performance

- Static handler path eliminates unnecessary scoped container creation for singleton controllers
- Pre-resolved guards reduce per-request resolution overhead
- Non-blocking container cleanup via `onResponse` hook

### Dependencies

- Requires `@navios/core` ^0.8.0

## [0.7.1] - 2025-12-18

### Added

- **Global Prefix Getter**: Added `getGlobalPrefix()` method to `FastifyApplicationService` to retrieve the current global route prefix, aligning with the `AbstractHttpAdapterInterface` contract

### Fixed

- Fixed package.json exports to use correct CommonJS file extensions (`.cjs` and `.d.cts` instead of `.js` and `.d.ts`)

### Changed

- Updated `zod` dependency from `^4.1.13` to `^4.2.1`

---

## [0.7.0] - 2025-12-18

### Added

- **Comprehensive JSDoc Documentation**: Added detailed JSDoc comments to all public APIs including:
  - `defineFastifyEnvironment` function with configuration options
  - `FastifyApplicationService` class and all methods (`setupHttpServer`, `initServer`, `ready`, `setGlobalPrefix`, `getServer`, `enableCors`, `enableMultipart`, `listen`, `dispose`)
  - Adapter services (`FastifyEndpointAdapterService`, `FastifyStreamAdapterService`, `FastifyMultipartAdapterService`)
  - `FastifyControllerAdapterService` class
  - Type definitions and interfaces (`FastifyApplicationOptions`, `FastifyApplicationServiceInterface`, `FastifyHandlerAdapterInterface`, `FastifyExecutionContext`)
  - Injection tokens (`FastifyApplicationServiceToken`, `FastifyServerToken`, `FastifyRequestToken`, `FastifyReplyToken`, `FastifyEndpointAdapterToken`, `FastifyStreamAdapterToken`, `FastifyMultipartAdapterToken`)
- **Enhanced README**: Improved documentation with better examples and clearer API reference

### Documentation

- Complete JSDoc comments for better IDE support and developer experience
- Updated README with comprehensive examples and API documentation
- Clarified usage patterns and configuration options
- Added examples for different server configurations, CORS, and multipart options
