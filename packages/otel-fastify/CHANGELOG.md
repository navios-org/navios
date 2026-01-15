# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0-alpha.1] - 2026-01-15

### Added

- **Fastify OpenTelemetry Plugin**
  - `defineOtelPlugin` function for easy plugin registration
  - Hook-based integration leveraging Fastify's native hook system

- **Lifecycle Hooks**
  - `onRequest` hook - Creates HTTP span, extracts parent context from headers
  - `onResponse` hook - Sets response status and content-length, ends span
  - `onError` hook - Records errors on spans with proper exception handling
  - `onClose` hook - Shuts down OTel SDK gracefully

- **Request Tracing**
  - Automatic HTTP span creation for incoming requests
  - Parent context extraction from incoming headers (W3C Trace Context)
  - Response status and content-length recording
  - Request ID and user-agent as span attributes

- **Span Access**
  - `FastifyRequest.otelSpan` property for manual span access
  - TypeScript module augmentation for proper typing

- **Route Filtering**
  - `ignoreRoutes` option with glob pattern support
  - Skip tracing for health checks, metrics endpoints, etc.

- **Configuration**
  - `FastifyOtelPluginOptions` extending core `OtelConfig`
  - `propagateContext` option for header injection (default: true)
  - All core OTel configuration options supported

### Notes

This is an alpha release. The API is subject to change based on feedback. Please report any issues or suggestions.

### Known Limitations

- E2E tests use `exporter: 'none'` - real OTLP integration needs validation
- Limited error scenario coverage in tests
