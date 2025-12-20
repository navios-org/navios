# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
