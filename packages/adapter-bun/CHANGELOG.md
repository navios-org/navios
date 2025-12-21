# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
