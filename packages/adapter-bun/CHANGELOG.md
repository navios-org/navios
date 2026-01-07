# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
