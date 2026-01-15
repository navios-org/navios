# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0-alpha.1] - 2026-01-15

### Added

- **Core OpenTelemetry Integration**
  - `OtelSetupService` for SDK initialization with TracerProvider and MeterProvider
  - Support for OTLP, console, and no-op exporters
  - Configurable sampling with ratio-based sampler (AlwaysOn, AlwaysOff, TraceIdRatio)

- **Tracing Utilities**
  - `SpanFactoryService` for creating HTTP spans, child spans, and guard spans
  - `TraceContextService` for W3C Trace Context propagation (traceparent/tracestate)
  - `SpanContextStore` using AsyncLocalStorage for context management through async operations

- **Decorators**
  - `@Traced` decorator for class-level and method-level automatic instrumentation
  - Legacy-compatible `@Traced` decorator via `@navios/otel/legacy-compat` for projects using TypeScript experimental decorators

- **DI Integration**
  - `TracerToken` for injecting OpenTelemetry Tracer
  - `MeterToken` for injecting OpenTelemetry Meter
  - `OtelConfigToken` for configuration injection

- **Semantic Conventions**
  - Standard OpenTelemetry HTTP attributes (method, url, status_code, etc.)
  - Navios-specific framework attributes (controller, handler, module, guard, service)
  - Attribute builder utilities for consistent span attributes

- **Configuration System**
  - Comprehensive `OtelConfig` interface with:
    - Service metadata (name, version, environment)
    - Exporter configuration with endpoint and headers
    - Auto-instrumentation toggles (http, handlers, guards)
    - Metrics configuration (requestDuration, errorCount)
    - Sampling ratio configuration
    - Resource attributes support

- **Lifecycle Management**
  - Graceful shutdown with provider cleanup
  - Error recording with proper status codes

### Notes

This is an alpha release. The API is subject to change based on feedback. Please report any issues or suggestions.

### Known Limitations

- Metrics feature implemented but needs real-world validation
- Baggage propagation is stubbed but not fully implemented
