# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0-alpha.0] - 2026-11-26

### Added

- **`openApiPlugin(options)`**, one adapter-neutral plugin made with `definePlugin`. It builds the document from `app.routes()` and serves it as JSON, optionally YAML, with the Scalar page, through ordinary Navios routes. No adapter package is needed.
- **Any Standard Schema.** JSON Schema comes from the Standard JSON Schema extension (`~standard.jsonSchema`, implemented by Zod 4 and ArkType), `input` for request slots and `output` for responses; otherwise from the new `toJsonSchema(schema, io)` option; otherwise the slot is an unconstrained schema and one warning naming the endpoint is logged at `init()`.
- `generateOpenApiDocument(routes, options)`, `extractOpenApiMetadata(route)`, `SchemaConverter`, `describeMultipartFields`, `toOpenApiPath`, `extractUrlParamNames`.
- Options `disableJson` and `transformDocument`. Slashes around `jsonPath`, `yamlPath` and `docsPath` do not matter.
- `response: 'void'` endpoints are described as `No content`, and per-status `responses` endpoints get one response entry per declared status.
- Upload fields declared with `z.instanceof(File)` or `z.instanceof(Blob)` are described as binary strings; other custom schemas become unconstrained schemas instead of failing generation.
- `headersSchema`, `cookiesSchema` and `urlParamsSchema` are documented as parameters.
- Named schemas (`$defs`, for example Zod's `.meta({ id })`) are shared through `components.schemas`.
- The message of `ApiDeprecated(message)` is written to the operation as the specification extension `x-deprecated-message`. It used to be stored and left out of the document.
- Attributes work on modules, on `handler()` fields and in `handler(endpoint, { attributes: [...] }, fn)`. `ApiExclude`, `ApiSecurity` and `ApiDeprecated` on a controller or module apply to every handler below; `ApiTag` descriptions reach the document's tag list.

### Changed

- Type tests are type-checked: Vitest's typecheck ran `tsc` with `tsconfig.lib.json`, which excludes `*.spec-d.mts`. It now uses `tsconfig.typecheck.json`.
- **Breaking:** requires `@navios/core` 2.0. Routes are read from `RouteInfo` instead of module and controller metadata.
- **Breaking:** documented paths are full route paths (global and module prefixes included). `servers` is no longer filled from the global prefix.
- **Breaking:** the routes serving the document get the application's global prefix on every adapter.
- **Breaking:** the response of a route follows its declaration (`responses`, `response: 'void' | 'stream' | 'blob' | 'text'`), as core answers it. `@HttpCode` no longer exists, so there is no status override.
- **Breaking:** `ApiDeprecated()` without a message stores `{}` and `ApiTag(name)` stores `{ name }` (no `undefined` keys).
- Attribute values are validated by hand-written Standard Schemas. `zod` and `zod-openapi` are no longer dependencies; `@scalar/core` is.
- Upload fields are recognised from JSON Schema instead of Zod internals: in a multipart body, an unconstrained field is a binary string.
- No decorator syntax in the sources; the SWC plugin is gone from the build.

### Removed

- **Breaking:** the packages `@navios/openapi-fastify` and `@navios/openapi-bun`. `openApiPlugin(options)` from this package replaces their `defineOpenApiPlugin(options)`, and `OpenApiPluginOptions` replaces `FastifyOpenApiPluginOptions` and `BunOpenApiPluginOptions`. Their option schemas, controller factories and services have no replacement.
- **Breaking:** `OpenApiGeneratorService`, `EndpointScannerService`, `MetadataExtractorService`, `PathBuilderService`, `SchemaConverterService` and `DiscoveredEndpoint`. Use the functions listed above.
- **Breaking:** the type `OpenApiGeneratorOptions`. Use `OpenApiDocumentOptions`.
- **Breaking:** the `oas31` types of `zod-openapi` in the public API; the package exports its own document types.

## [1.0.0] - 2026-01-09

### Added

- **Stable Release**: First stable release of @navios/openapi
  - Production-ready OpenAPI integration for Navios framework
  - Automatic OpenAPI schema generation from Navios endpoints
  - Support for OpenAPI 3.0 specification

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

## [0.7.0] - 2025-12-20

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
