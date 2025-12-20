# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.0] - 2025-12-18

### Added

- **Fastify OpenAPI Provider**: Initial release of the Fastify provider for OpenAPI documentation
- **Scalar UI Integration**: Interactive Scalar UI for exploring API documentation
- **OpenAPI Plugin**: `defineOpenApiPlugin()` function for easy integration with Navios applications
- **Automatic Spec Generation**: Automatic OpenAPI specification generation from Navios controllers
- **JSON Endpoint**: `/openapi.json` endpoint serving OpenAPI specification in JSON format
- **YAML Endpoint**: `/openapi.yaml` endpoint serving OpenAPI specification in YAML format (configurable)
- **Documentation UI**: `/docs` endpoint serving interactive Scalar UI documentation
- **Customizable Configuration**: Extensive configuration options:
  - OpenAPI info (title, version, description, contact, license, termsOfService)
  - Server definitions
  - Security schemes and global security requirements
  - Custom tags with descriptions
  - Customizable paths for JSON, YAML, and docs endpoints
  - Scalar UI theme configuration (default, alternate, moon, purple, solarized)
  - Option to disable YAML endpoint
- **Fastify Plugin Integration**: Seamless integration with Fastify's plugin system
- **Global Prefix Support**: Automatic respect for Fastify's global prefix configuration
- **Type Safety**: Full TypeScript support with comprehensive type definitions
- **All Core Decorators**: Full support for all decorators from `@navios/openapi`:
  - `@ApiTag`, `@ApiOperation`, `@ApiSummary`, `@ApiDeprecated`, `@ApiSecurity`, `@ApiExclude`, `@ApiStream`
- **Endpoint Type Support**: Support for all endpoint types (standard, multipart, stream)
- **Zod Schema Support**: Automatic conversion of Zod schemas to OpenAPI schemas

