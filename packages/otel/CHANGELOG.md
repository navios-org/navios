# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0-alpha.1] - Unreleased

### Changed

- **BREAKING**: `@navios/otel/legacy-compat` exports the decorators `Traced` and `Traceable` and the type `TracedOptions`, as the documentation says. `extractTracedMetadata`, `getTracedMetadata`, `hasTracedMetadata`, `getTraceableServices`, `TracedMetadataKey` and the types `TracedMetadata`, `ClassTracedMetadata` and `MethodTracedMetadata` are no longer exported from it.
- **BREAKING**: the legacy `Traced` and `Traceable` are built with `legacy()` of `@navios/core/legacy-compat` and accept only the legacy call shapes. Before, they also accepted a standard decorator call; use `Traced` and `Traceable` of `@navios/otel` for standard decorators.

### Removed

- **BREAKING**: the span helpers written for the removed `@navios/otel-fastify` and `@navios/otel-bun`, which nothing in the package used any more: `SpanFactoryService` with the types `HttpSpanOptions` and `ChildSpanOptions`, `HttpAttributes`, `createHttpRequestAttributes`, `parseUrlAttributes`, `NaviosAttributes` and `createNaviosAttributes`. Start a span with the tracer of `TracerToken`; `parentContext()` is the context to start a child span in when no context manager is registered.

- **BREAKING**: `TraceContextService` is removed. Its methods wrapped functions the package exports: use `getCurrentSpan()`, `extractTraceContext(headers)`, `context.with(trace.setSpan(context.active(), span), fn)` of `@opentelemetry/api` instead of `runWithSpan(span, fn)`, and `trace.setSpan()` instead of `createContextWithSpan()`. `runWithSpanContext()`, `getCurrentSpanContext()` and the type `SpanContext`, which only it used, are removed too; the active baggage is `propagation.getBaggage(context.active())`.

### Added

- `injectTraceContext(headers)` adds the trace context of the current span to outgoing headers and returns them. It replaces `TraceContextService.injectIntoHeaders()`.

### Fixed

- A subclass of a `@Traced` or `@Traceable` class that is not decorated itself is no longer traced with the metadata of its parent by `traceInstance()` and `TracedProxyFactory.wrap()`. Only what a class is decorated with itself counts, as with `@Schedulable()`.
- `@Traceable` on a subclass adds to the span name and attributes it inherits, as `@Traced` does. Before, it replaced them, so the subclass lost the name and the attributes of its parent.

## [2.0.0-alpha.0] - 2026-11-26

Ported to the 2.0 APIs of `@navios/di` and `@navios/core`. The package is now adapter-neutral and complete on its own: it no longer needs `@navios/otel-fastify` or `@navios/otel-bun`. Its main entry depends on `@navios/core` only and works in an application without HTTP; `@navios/server` is an optional peer dependency, needed for HTTP request spans.

### Breaking

- **The packages `@navios/otel-fastify` and `@navios/otel-bun` are removed.** `OtelPluginOptions` replaces `FastifyOtelPluginOptions` and `BunOtelPluginOptions`. `otelPlugin(options)` is one plugin, so the loop over the result of the Bun `defineOtelPlugin` goes away. Removed with them: `request.otelSpan` on Fastify (use `ctx.find(RequestSpan)`), the `http.response_content_length` attribute on Fastify and the `guard:<name>` child spans on Bun.
- **One plugin, `otelPlugin(options)`.** It starts the SDK, traces HTTP requests, traces `@Traced` services and shuts the SDK down. It replaces `defineOtelPlugin` from the adapter packages and `defineOtelTracingPlugin` from this one; `defineOtelTracingPlugin` and `OtelTracingPluginOptions` are removed.
- **HTTP requests are traced by an interceptor**, `OtelHttpInterceptor`, on every adapter. It is exported from `@navios/otel/http`, together with `compileIgnoreRoutes` and `instrumentHttp`; the plugin loads that entry by itself when the application serves HTTP. A request that matches no route gets no span (1.x on Fastify created one). The span ends when the response has finished, including a streamed body, and reports the final status, including one produced by an `app.mapError()` mapper. The status is set as `http.status_code` and `http.response.status_code`.
- **Removed options that did nothing or can no longer be honoured:** `autoInstrument.handlers`, `autoInstrument.guards`, `propagateContext`, `metrics.requestDuration` and `metrics.errorCount`. A request has one server span covering guards, validation and the handler.
- **The OpenTelemetry SDK is no longer bundled into the build.** `@opentelemetry/context-async-hooks`, `core`, `resources`, `sdk-metrics`, `sdk-trace` and `semantic-conventions` are regular dependencies; the two OTLP exporters are optional peer dependencies.
- **OpenTelemetry SDK 3 throughout.** The deprecated `@opentelemetry/sdk-trace-node` 2.x is replaced by `@opentelemetry/sdk-trace` 3.x. The peer range of `@opentelemetry/api` is `>=1.10.0 <1.11.0` and that of the OTLP exporters `>=0.300.0 <0.400.0`. A span processor passed in `spanProcessors` must come from `@opentelemetry/sdk-trace`, where it takes an options object: `new BatchSpanProcessor({ exporter })`. The 3.x trace SDK reads no environment variables, so the `OTEL_BSP_*` settings and the span limits (`OTEL_SPAN_*_LIMIT`, `OTEL_ATTRIBUTE_*_LIMIT`) have no effect any more.
- **`http.url` is the request path** without the query string.
- **`@Traced` services are instrumented in place** through `container.decorate` instead of being re-registered under a `:original` token behind a wrapper factory. `createTracedWrapperFactory` is removed. The object the container returns is the service itself rather than a `Proxy` around it.
- **The package's own `AsyncLocalStorage` store is removed**, with `getSpanContextStore()`. The active span lives in the OpenTelemetry context. `getCurrentSpan()`, `getCurrentSpanContext()` and `runWithSpanContext()` remain and read or write that context.
- **`OtelSetupService` no longer registers tokens itself** and takes no injected dependencies. The plugin creates it and provides it; `initialize(config, logger?)` takes an optional logger.
- `TRACED_METADATA_KEY` is removed, deprecated since 1.0.0-alpha.3. Use `TracedMetadataKey`.
- `SpanFactoryService` and `TracedProxyFactory` use the tracer provided by the plugin instead of the global one.

### Added

- `autoInstrument.transports` and `OtelHandlerInterceptor`: one span per handler run of a transport other than HTTP (a queue message, a job), named `<transport> <Class>.<handler>`. The default, `'auto'`, traces them in an application that has no HTTP transport; set `true` in one that serves HTTP as well.
- `RequestSpan`: a request-context key holding the request's server span (`ctx.find(RequestSpan)`).
- The request span is the active OpenTelemetry span while the request is handled, and each traced method runs with its own span active, so nested spans get the right parent.
- `ignoreRoutes` is part of `OtelConfig`. `*` may appear anywhere in a pattern.
- `spanProcessors`: extra span processors, for custom exporters and for tests.
- `registerGlobally`: set to `false` to keep the provider, context manager and propagators out of the process-wide registration.
- `MeterToken` is always provided; it is a no-op meter unless metrics are enabled.
- `OtelSetupService.forceFlush()` and `getConfig()`.
- `traceInstance()`, `extractTraceContext()`, `parentContext()`, `recordSpanError()`, `resolveOtelConfig()`.
- `TraceContextService.extractFromHeaders()` accepts a web `Headers` object and `ctx.headers` as well as a plain record.
- Without a context manager, a `@Traced` method called during a request is parented to the request span when the application runs with `asyncContext: true`.

### Changed

- Shutting down takes back the process-wide tracer provider, context manager and propagators if this package registered them.
- `#private` members work on traced services.
- The package's own classes are registered with `registerInjectable`; the build no longer needs a decorator transform.

## [1.0.0-alpha.3] - 2026-01-18

### Added

- **Automatic Service Tracing via Plugin**
  - New `defineOtelTracingPlugin` plugin that automatically wraps `@Traced`/`@Traceable` decorated services with tracing proxies
  - Services are wrapped at the DI level with higher priority, ensuring all consumers get traced instances
  - Supports parameterized services by preserving token schemas

- **@Traceable Decorator**
  - New class decorator to mark services for tracing proxy wrapping without tracing all methods
  - Use with method-level `@Traced` for selective tracing
  - Example: `@Traceable({ name: 'order-service' })` marks the class for wrapping

- **Enhanced @Traced Decorator**
  - Now fully functional with automatic span creation
  - Class-level: traces all public methods automatically
  - Method-level: traces specific methods only (requires `@Traceable` or `@Traced` on class)
  - Supports custom span names and attributes
  - Properly handles sync and async methods with error recording

- **TracedProxyFactory Service**
  - Internal service for creating Proxy wrappers around traced services
  - Performance optimizations: pre-wraps explicitly traced methods, lazy-wraps class-level methods with caching
  - Pre-computes span names and attributes for minimal per-call overhead

- **Metadata Helpers**
  - `getTracedMetadata(context, target?)` - get/create metadata during decoration
  - `extractTracedMetadata(target)` - extract metadata from decorated class at runtime
  - `hasTracedMetadata(target)` - check if class has traced metadata
  - `getTraceableServices()` - get all registered traceable service classes
  - `TracedMetadataKey` symbol for metadata storage

- **Legacy Decorator Support**
  - `@Traceable` decorator available via `@navios/otel/legacy-compat`
  - Legacy `@Traced` method decorator now delegates to Stage 3 decorator via `createMethodContext`

### Changed

- `@Traced` decorator now uses `context.metadata` pattern (Stage 3 decorators) for metadata storage
- Deprecated `TRACED_METADATA_KEY` in favor of `TracedMetadataKey`

## [1.0.0-alpha.2] - 2026-01-16

### Changed

- **BREAKING: OpenTelemetry SDK v2.x Compatibility**
  - Replaced `new Resource()` with `resourceFromAttributes()` function
  - Replaced deprecated `addSpanProcessor()` with `spanProcessors` constructor option in `NodeTracerProvider`
  - Updated `@opentelemetry/resources` to `^2.4.0`
  - Updated `@opentelemetry/sdk-metrics` to `^2.4.0`
  - Updated `@opentelemetry/sdk-trace-node` to `^2.4.0`

### Notes

- This release requires OpenTelemetry JS SDK 2.x. If you are using SDK 1.x, please use `@navios/otel@1.0.0-alpha.1`.

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
