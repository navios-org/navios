import { InjectionToken } from '@navios/core'

import type { AttributeValue } from '@opentelemetry/api'
import type { SpanProcessor } from '@opentelemetry/sdk-trace'

/**
 * Configuration for auto-instrumentation features.
 */
export interface AutoInstrumentConfig {
  /**
   * Trace incoming HTTP requests: one server span per request that matches
   * a route. When `false` the plugin registers no interceptor.
   * @default true
   */
  http?: boolean
  /**
   * Trace the handlers of the application's other transports, those that
   * run guards and interceptors around a handler, such as queue messages or
   * commands: one span per run, named `<transport> <Class>.<handler>`.
   * The jobs of `@navios/schedule` are not run that way and get no span from
   * this; mark the class with `@Traced` to trace its methods.
   *
   * `'auto'` traces them in an application that has no HTTP transport. In
   * one that serves HTTP as well, set `true`: the interceptor is then also
   * placed around every route, where it does nothing but pass the call on.
   * @default 'auto'
   */
  transports?: boolean | 'auto'
}

/**
 * Configuration for metrics collection.
 */
export interface MetricsConfig {
  /**
   * Create a meter provider and export what is recorded through
   * `MeterToken`. The plugin records no metrics of its own.
   */
  enabled: boolean
}

/**
 * Configuration for sampling.
 */
export interface SamplingConfig {
  /**
   * Sampling ratio from 0.0 to 1.0.
   * 1.0 means sample all traces, 0.5 means sample 50%.
   * @default 1.0
   */
  ratio?: number
}

/**
 * Options of the OTLP exporters, which send over HTTP.
 */
export interface OtlpExporterOptions {
  /**
   * URL of the OTLP/HTTP traces endpoint. With metrics enabled, metrics go to
   * the same URL with `/traces` replaced by `/metrics`.
   * @example 'http://localhost:4318/v1/traces'
   */
  endpoint?: string

  /**
   * Additional headers to send with each request.
   * Useful for authentication.
   */
  headers?: Record<string, string>
}

/**
 * Main configuration for OpenTelemetry integration.
 */
export interface OtelConfig {
  /**
   * Name of the service.
   * This appears in traces and helps identify the source.
   */
  serviceName: string

  /**
   * Version of the service.
   */
  serviceVersion?: string

  /**
   * Deployment environment (e.g., 'production', 'staging', 'development').
   */
  environment?: string

  /**
   * Exporter type for traces.
   * - 'otlp': Send traces to an OTLP-compatible backend (Jaeger, Tempo, etc.)
   * - 'console': Print traces to console (useful for development)
   * - 'none': Disable trace export (tracing still works, just not exported)
   */
  exporter: 'otlp' | 'console' | 'none'

  /**
   * Options for the exporter.
   */
  exporterOptions?: OtlpExporterOptions

  /**
   * Auto-instrumentation configuration.
   * When not provided, defaults to `{ http: true }`.
   */
  autoInstrument?: AutoInstrumentConfig

  /**
   * Metrics configuration.
   */
  metrics?: MetricsConfig

  /**
   * Include Navios-specific span attributes.
   * When true, adds attributes like:
   * - navios.controller
   * - navios.handler
   * - navios.module
   * @default false
   */
  includeNaviosAttributes?: boolean

  /**
   * Sampling configuration.
   */
  sampling?: SamplingConfig

  /**
   * Additional resource attributes to add to all spans.
   */
  resourceAttributes?: Record<string, AttributeValue>

  /**
   * Request paths that get no server span. A pattern matches the whole path;
   * `*` matches any run of characters.
   * @example ['/health', '/metrics', '/docs/*']
   */
  ignoreRoutes?: string[]

  /**
   * Span processors added after the one created for `exporter`. Use it to
   * send spans to an exporter this package does not create itself, or to
   * collect them in a test.
   */
  spanProcessors?: SpanProcessor[]

  /**
   * Register the tracer provider globally. This also installs the SDK's
   * context manager (`AsyncLocalStorage`) and the W3C propagators, which is
   * what carries the active span across `await` and lets the plugin read an
   * incoming `traceparent` header.
   *
   * With `false` the plugin still creates its own tracer provider and sends
   * its spans to the configured exporter and `spanProcessors`, but registers
   * nothing process-wide. Context propagation and header extraction then
   * depend on a context manager and a propagator registered elsewhere, for
   * example by an OpenTelemetry SDK the process already runs.
   * @default true
   */
  registerGlobally?: boolean
}

/**
 * Resolved configuration with defaults applied.
 */
export interface ResolvedOtelConfig extends OtelConfig {
  autoInstrument: Required<AutoInstrumentConfig>
  metrics: Required<MetricsConfig>
  sampling: Required<SamplingConfig>
  includeNaviosAttributes: boolean
  ignoreRoutes: string[]
  registerGlobally: boolean
}

/**
 * Injection token for the resolved OpenTelemetry configuration.
 *
 * This token provides access to the fully resolved configuration
 * with all defaults applied.
 *
 * @example
 * ```typescript
 * import { inject, Injectable } from '@navios/core'
 * import { OtelConfigToken } from '@navios/otel'
 *
 * @Injectable()
 * class MyService {
 *   private readonly config = inject(OtelConfigToken)
 *
 *   shouldIncludeNaviosAttributes(): boolean {
 *     return this.config.includeNaviosAttributes
 *   }
 * }
 * ```
 */
export const OtelConfigToken = InjectionToken.create<ResolvedOtelConfig>('OtelConfig')

/**
 * Resolves configuration with defaults applied.
 */
export function resolveOtelConfig(config: OtelConfig): ResolvedOtelConfig {
  return {
    ...config,
    autoInstrument: {
      http: config.autoInstrument?.http ?? true,
      transports: config.autoInstrument?.transports ?? 'auto',
    },
    metrics: {
      enabled: config.metrics?.enabled ?? false,
    },
    sampling: {
      ratio: config.sampling?.ratio ?? 1.0,
    },
    includeNaviosAttributes: config.includeNaviosAttributes ?? false,
    ignoreRoutes: config.ignoreRoutes ?? [],
    registerGlobally: config.registerGlobally ?? true,
  }
}
