# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0-alpha.4] - 2026-01-09

### Changed

- **Test Suite Updates**: Updated endpoint scanner tests to include `customEntries` field in module metadata
  - Aligns with new `ModuleMetadata` interface from `@navios/core`

### Dependencies

- Updated to support `@navios/core` ^1.0.0-alpha.4

## [1.0.0-alpha.3] - 2026-01-08

### Added

- **Comprehensive Test Suite**: Added unit tests for OpenAPI services
  - `endpoint-scanner.service.spec.mts` - Endpoint scanner tests
  - `openapi-generator.service.spec.mts` - OpenAPI generator tests

### Dependencies

- Updated to support `@navios/core` ^1.0.0-alpha.3

## [1.0.0-alpha.2] - 2026-01-07

### Added

- **Error Schema Support in OpenAPI**: New `buildErrorResponses()` method in `PathBuilderService`
  - Automatically generates OpenAPI response schemas from `errorSchema` configuration
  - Error responses are added alongside success responses in the generated specification
  - Supports all endpoint types: standard endpoints, multipart, and streams

### Changed

- **Updated Builder Types**: Services now use `EndpointOptions` and `BaseEndpointOptions` from `@navios/builder`
  - `EndpointScannerService.DiscoveredEndpoint.config` - Updated type to `EndpointOptions | BaseEndpointOptions`
  - `PathBuilderService.buildParameters()` - Updated type signature
  - `PathBuilderService.buildRequestBody()` - Updated type signature
  - `PathBuilderService.buildJsonRequestBody()` - Updated type signature
  - `PathBuilderService.buildMultipartRequestBody()` - Updated type signature
- **Improved Endpoint Type Detection**: `getEndpointType()` now returns `'unknown'` for unrecognized adapter tokens instead of defaulting to `'endpoint'`
  - Unknown endpoint types only generate error responses, not success responses
- **New buildUnknownResponses Method**: Handles response generation for unknown endpoint types

### Dependencies

- Updated to support `@navios/core` ^1.0.0-alpha.2
- Updated to support `@navios/builder` ^1.0.0-alpha.2

## [0.9.1] - 2026-01-05

### Added

- **Legacy-Compatible Decorators**: Added `@navios/openapi/legacy-compat` export with legacy decorator versions of all OpenAPI decorators for TypeScript experimental decorators support:
  - `ApiTag` - Group endpoints under tags
  - `ApiOperation` - Full operation metadata
  - `ApiSummary` - Quick summary shorthand
  - `ApiDeprecated` - Mark endpoints as deprecated
  - `ApiSecurity` - Specify security requirements
  - `ApiExclude` - Exclude endpoints from documentation
  - `ApiStream` - Specify stream content type and metadata
- **Type Tests**: Added comprehensive type tests for legacy-compat decorators

### Dependencies

- Updated to support `@navios/core` ^0.9.3

## [0.9.0] - 2025-12-23

### Dependencies

- Updated to support `@navios/core` ^0.9.0
- Updated to support `@navios/di` ^0.9.0

## [0.8.0] - 2025-12-21

### Changed

- **Test Import Paths**: Updated `TestContainer` import from `@navios/di` to `@navios/di/testing`

### Dependencies

- Compatible with `@navios/core` ^0.8.0

## [0.7.0] - 2025-12-18

### Added

- **Core OpenAPI Package**: Initial release of the core OpenAPI package for Navios
- **OpenAPI 3.1 Support**: Full support for OpenAPI 3.1 specification generation
- **Automatic Endpoint Discovery**: Automatic discovery of endpoints from Navios controllers
- **Zod Schema Conversion**: Automatic conversion of Zod schemas to OpenAPI schemas
- **Decorator System**: Comprehensive decorator system for API documentation:
  - `@ApiTag` - Group endpoints under tags in the documentation
  - `@ApiOperation` - Full operation metadata (summary, description, operationId, deprecated)
  - `@ApiSummary` - Quick summary shorthand decorator
  - `@ApiDeprecated` - Mark endpoints as deprecated with optional reason
  - `@ApiSecurity` - Specify security requirements for endpoints
  - `@ApiExclude` - Exclude endpoints from documentation
  - `@ApiStream` - Specify content type and metadata for stream endpoints
- **Service Architecture**: Core services for OpenAPI generation:
  - `OpenApiGeneratorService` - Main service for generating OpenAPI specifications
  - `EndpointScannerService` - Discovers endpoints from controllers
  - `MetadataExtractorService` - Extracts decorator metadata from endpoints
  - `SchemaConverterService` - Converts Zod schemas to OpenAPI schemas
  - `PathBuilderService` - Builds OpenAPI path items from endpoint definitions
- **Schema Metadata Support**: Support for rich schema metadata via Zod `.meta()` method
- **Endpoint Type Support**: Support for all endpoint types:
  - Standard HTTP endpoints
  - Multipart/form-data endpoints
  - Stream endpoints
- **Type Safety**: Full TypeScript support with comprehensive type definitions
- **Provider Package Architecture**: Designed to work with provider packages for runtime-specific UI integration

