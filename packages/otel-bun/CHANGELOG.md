# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0-alpha.3] - 2026-01-18

### Changed

- Updated to use `@navios/otel@1.0.0-alpha.3` with enhanced tracing features
- Now supports automatic service tracing via `@Traced` and `@Traceable` decorators from `@navios/otel`

### Notes

- The `defineOtelTracingPlugin` from `@navios/otel` can be used alongside `defineOtelPlugin` from this package for automatic service tracing

## [1.0.0-alpha.2] - 2026-01-16

### Changed

- **BREAKING: OpenTelemetry SDK v2.x Compatibility**
  - Updated test fixtures to use `resourceFromAttributes()` instead of `new Resource()`
  - Updated test fixtures to use `spanProcessors` constructor option instead of `addSpanProcessor()`
  - Requires `@navios/otel@1.0.0-alpha.2` or later

## [1.0.0-alpha.1] - 2026-01-15

### Added

- **Bun Adapter OpenTelemetry Plugin**
  - `defineOtelPlugin` function for easy plugin registration
  - Two-stage plugin architecture:
    - `pre:adapter-resolve` - Registers traced controller adapter with priority 100
    - `post:modules-init` - Initializes OTel SDK after modules loaded

- **Traced Controller Adapter**
  - `TracedBunControllerAdapterService` extending base `BunControllerAdapterService`
  - Three optimized handler paths:
    - Static handler without guards (fastest path)
    - Static handler with static guards
    - Dynamic handler with DI container per request
  - Per-request span context propagation using `runWithSpanContext`

- **Request Tracing**
  - Automatic HTTP span creation for incoming requests
  - Parent context extraction from incoming headers
  - Response status and content-length recording
  - Error recording with proper exception handling

- **Route Filtering**
  - `ignoreRoutes` option with glob pattern support
  - Skip tracing for health checks, metrics endpoints, etc.

- **Guard Tracing**
  - Optional tracing of guard execution
  - Enabled via `autoInstrument.handlers` configuration

- **Configuration**
  - `BunOtelPluginOptions` extending core `OtelConfig`
  - `propagateContext` option for header injection (default: true)
  - All core OTel configuration options supported

- **DI Integration**
  - `BunOtelOptionsToken` for configuration injection
  - Proper service registration with priority handling

### Notes

This is an alpha release. The API is subject to change based on feedback. Please report any issues or suggestions.

### Known Limitations

- Uses `bun:test` instead of vitest (different from main test setup)
- Handler optimization paths need load testing validation
