# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.1] - 2025-12-18

### Added

- **Plugin System**: New plugin architecture allowing third-party extensions to integrate with Navios applications
  - `NaviosPlugin` interface for defining plugins with registration hooks
  - `PluginContext` interface providing access to modules, server, container, and module loader
  - `PluginDefinition` type for plugin factory functions
  - `app.usePlugin()` method for registering plugins on NaviosApplication
- **Module Extensions**: New `ModuleLoaderService.extendModules()` method allowing plugins to dynamically add modules or controllers to the application after initial module loading

### Changed

- Enhanced JSDoc documentation for `AbstractHttpAdapterInterface` with comprehensive type parameter documentation and method descriptions

### Fixed

- Fixed logger setup in `NaviosFactory` to properly handle early return when logger is disabled
- Fixed package.json exports to use correct CommonJS file extensions (`.cjs` and `.d.cts`)

---

## [0.7.0] - 2025-12-18

### Added

- **Testing Module**: New `TestingModule` class and `createTestingModule` function for easier testing setup with dependency overrides
- **Config Service**: New `ConfigService` for managing application configuration with type-safe access
- **Logger System**: Comprehensive logging system with multiple log levels (error, warn, log, debug, verbose, fatal) and customizable output
- **Attribute Factory**: `AttributeFactory` for creating custom metadata decorators that can be applied to modules, controllers, and endpoints
- **Exception Classes**: Complete set of HTTP exception classes:
  - `HttpException` (base class)
  - `BadRequestException`
  - `UnauthorizedException`
  - `ForbiddenException`
  - `NotFoundException`
  - `ConflictException`
  - `InternalServerErrorException`
- **Decorators**: Full set of decorators for building Navios applications:
  - `@Module()` - Define application modules
  - `@Controller()` - Define request controllers
  - `@Endpoint()` - Define HTTP endpoints with type-safe request/response schemas
  - `@Multipart()` - Define multipart/form-data endpoints for file uploads
  - `@Stream()` - Define streaming endpoints
  - `@UseGuards()` - Apply guards to controllers or endpoints
  - `@Header()` - Set custom response headers
  - `@HttpCode()` - Set custom HTTP status codes
- **Legacy-Compatible Decorators**: Complete set of decorators compatible with TypeScript experimental decorators, available from `@navios/core/legacy-compat`:
  - All standard decorators (`@Module`, `@Controller`, `@Endpoint`, `@Multipart`, `@Stream`, `@UseGuards`, `@Header`, `@HttpCode`) with legacy decorator API support
  - Seamless conversion from experimental decorator format to Stage 3 format internally
  - Full type safety and feature parity with standard decorators
- **Core Application APIs**:
  - `NaviosFactory.create()` - Factory method for creating Navios applications
  - `NaviosApplication` - Main application class with methods for:
    - `init()` - Initialize the application
    - `listen()` - Start the HTTP server
    - `setGlobalPrefix()` - Set a global URL prefix
    - `enableCors()` - Enable CORS support
    - `enableMultipart()` - Enable multipart/form-data support
    - `getServer()` - Get the underlying HTTP server instance
    - `getContainer()` - Get the dependency injection container
    - `dispose()` / `close()` - Clean up resources
- **Guards System**: `CanActivate` interface for implementing request guards (authentication, authorization, etc.)
- **Type Utilities**: Type-safe utilities for endpoint parameters and results:
  - `EndpointParams<T>` - Extract typed parameters from endpoint definitions
  - `EndpointResult<T>` - Extract typed return values from endpoint definitions
  - `MultipartParams<T>` - Extract typed parameters for multipart endpoints
  - `StreamParams<T>` - Extract typed parameters for stream endpoints
- **Dependency Injection**: Full integration with `@navios/di` for dependency injection
- **Adapter Support**: Adapter-based architecture supporting multiple HTTP server implementations (Fastify, Bun)

### Features

- **Type Safety**: Full TypeScript support with type inference for endpoints, requests, and responses
- **Zod Integration**: Built-in support for Zod schema validation for request/response validation
- **Modular Architecture**: Organize code into modules with clear boundaries and dependency management
- **Extensible**: Custom attributes system for adding metadata to modules, controllers, and endpoints
- **Testing Support**: Comprehensive testing utilities for unit and integration tests

### Documentation

- Complete README with getting started guide
- Comprehensive documentation in `/docs` covering:
  - Quick Start Guide
  - Application Setup and Configuration
  - Modules, Controllers, and Endpoints
  - Services and Dependency Injection
  - Guards and Exception Handling
  - Attributes System
  - HTTP Server Adapters
  - Testing Guide

### Dependencies

- `@navios/di` - Dependency injection container
- `@navios/builder` (peer dependency) - Type-safe API definitions
- `zod` (peer dependency) - Schema validation

---

## [Unreleased]

### Planned

- Additional adapter implementations
- Enhanced middleware support
- WebSocket support
- Performance optimizations
