# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0-alpha.4] - 2026-01-09

### Changed

- **Environment Definition**: `defineXmlEnvironment()` now returns `tokens` instead of `httpTokens`
  - Aligns with new unified adapter architecture in `@navios/core`

### Dependencies

- Updated to support `@navios/core` ^1.0.0-alpha.4
- Updated to support `@navios/adapter-bun` ^1.0.0-alpha.4
- Updated to support `@navios/adapter-fastify` ^1.0.0-alpha.4

## [1.0.0-alpha.3] - 2026-01-08

### Added

- **Comprehensive Test Suite**: Added unit tests for XML stream adapter
  - `xml-stream-adapter.service.spec.mts` - XML stream adapter tests

### Dependencies

- Updated to support `@navios/core` ^1.0.0-alpha.3

## [1.0.0-alpha.2] - 2026-01-07

### Changed

- **Simplified XmlStreamParams Type**: Refactored `XmlStreamParams<T>` type to use new `RequestArgs` and `Simplify` types from `@navios/builder`
  - Cleaner type inference with support for `urlParamsSchema`
  - Server-side handlers receive `z.output` types (parsed/transformed values)
- **Updated XmlStream Decorator**: Completely refactored to use `BaseEndpointOptions` from `@navios/builder`
  - Multiple overloads for handlers with/without parameters and reply object
  - Better type inference for endpoint parameters
  - Improved JSDoc documentation
- **Updated declareXmlStream Function**: Now uses `StreamHandler` type from `@navios/builder`
  - Returns properly typed handler with config attached
  - Better integration with endpoint declaration patterns
- **New XmlStreamConfig Interface**: Separated config types for better type composition
  - `XmlStreamConfig` extends `BaseEndpointOptions` with XML-specific options
  - `BaseXmlStreamConfig` for backward compatibility with explicit type parameters

### Dependencies

- Updated to support `@navios/core` ^1.0.0-alpha.2
- Updated to support `@navios/builder` ^1.0.0-alpha.2

## [0.9.0] - 2025-12-23

### Dependencies

- Updated to support `@navios/core` ^0.9.0
- Updated to support `@navios/di` ^0.9.0

## [0.8.0] - 2025-12-21

### Added

- **Static/Dynamic Handler Branching**: New handler result types for optimized request handling
  - Always returns dynamic handler due to `renderToXml` requiring ScopedContainer
  - Aligns with `@navios/core` 0.8.0 `HandlerResult` interface

### Changed

- **Handler Result Types**: `provideHandler()` now returns `Promise<HandlerResult>` instead of direct handler function
- **Build Tooling**: Switched from `esbuild` to `@swc/core` for transpilation (bun-plugin)

### Dependencies

- Requires `@navios/core` ^0.8.0

## [0.7.1] - 2025-12-20

### Fixed

- Fixed package.json exports to use correct CommonJS file extensions (`.cjs` and `.d.cts`)

## [0.7.0] - 2025-12-18

### Added

- **Comprehensive JSDoc Documentation**: Added detailed JSDoc comments to all public APIs including:
  - `defineXmlEnvironment` function with configuration examples
  - `defineTag` function with tag creation and validation examples
  - `renderToXml` function and `RenderOptions` interface
  - `Component` decorator with all overloads and usage patterns
  - `XmlStream` decorator and `declareXmlStream` function
  - `CData` and `DangerouslyInsertRawXml` components
  - `XmlStreamAdapterService` class
  - Type definitions and interfaces (`XmlComponent`, `ComponentClass`, `BaseXmlStreamConfig`, `TagComponent`, `XmlStreamParams`)
  - `MissingContainerError` error class
- **Enhanced README**: Improved documentation with better examples and clearer API reference

### Documentation

- Complete JSDoc comments for better IDE support and developer experience
- Updated README with comprehensive examples and API documentation
- Clarified usage patterns for JSX-based XML generation
- Added examples for different XML formats (RSS, Atom, Sitemap)
