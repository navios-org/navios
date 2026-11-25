# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0-alpha.0] - Unreleased

**This package is deprecated.** The OpenTelemetry plugin is adapter-neutral in 2.0 and lives in `@navios/otel`. This package re-exports it so that existing imports resolve.

### Breaking

- `defineOtelPlugin` is now `otelPlugin` from `@navios/otel` under its old name. `app.usePlugin(defineOtelPlugin(options))` keeps working.
- Removed `OtelFastifyPlugin`, `createOnRequestHook`, `createOnResponseHook` and `createOnErrorHook`. Requests are traced by an interceptor, not by Fastify hooks.
- Removed `request.otelSpan`. Use `ctx.find(RequestSpan)` with `RequestSpan` from `@navios/otel`.
- A request that matches no route no longer gets a span.
- `http.response_content_length` is no longer set on request spans.

### Changed

- The peer dependencies are `@navios/core`, `@navios/server` and `@navios/otel` only.
- `FastifyOtelPluginOptions` is an alias of `OtelPluginOptions` from `@navios/otel`.

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
