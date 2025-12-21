# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

