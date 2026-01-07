# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
