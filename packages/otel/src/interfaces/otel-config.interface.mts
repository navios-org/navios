import type { AttributeValue } from '@opentelemetry/api'

/**
 * Configuration for auto-instrumentation features.
 */
export interface AutoInstrumentConfig {
  /**
   * Instrument all incoming HTTP requests.
   * Creates a span for each request with standard HTTP attributes.
   * @default true
   */
  http?: boolean

  /**
   * Instrument controller handler methods.
   * Creates child spans for each handler execution.
   * @default true
   */
  handlers?: boolean

  /**
   * Instrument guard execution.
   * Creates child spans for guard checks.
   * @default false
   */
  guards?: boolean
}

/**
 * Configuration for metrics collection.
 */
export interface MetricsConfig {
  /**
   * Enable metrics collection.
   */
  enabled: boolean

  /**
   * Track request duration as a histogram.
   * @default true when metrics.enabled is true
   */
  requestDuration?: boolean

  /**
   * Track error count.
   * @default true when metrics.enabled is true
   */
  errorCount?: boolean
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
 * Options for OTLP exporter.
 */
export interface OtlpExporterOptions {
  /**
   * OTLP endpoint URL.
   * @example 'http://localhost:4317' for gRPC
   * @example 'http://localhost:4318/v1/traces' for HTTP
   */
  endpoint?: string

  /**
   * Additional headers to send with each request.
   * Useful for authentication.
   */
  headers?: Record<string, string>

  /**
   * Use HTTP protocol instead of gRPC.
   * @default true
   */
  useHttp?: boolean
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
   * When not provided, defaults to { http: true, handlers: true, guards: false }
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
   * - navios.guard
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
}

/**
 * Options for the @Traced decorator.
 */
export interface TracedOptions {
  /**
   * Custom span name.
   * If not provided, defaults to class.method name.
   */
  name?: string

  /**
   * Additional attributes to add to spans.
   */
  attributes?: Record<string, AttributeValue>
}

/**
 * Resolved configuration with defaults applied.
 */
export interface ResolvedOtelConfig extends OtelConfig {
  autoInstrument: Required<AutoInstrumentConfig>
  metrics: Required<MetricsConfig>
  sampling: Required<SamplingConfig>
  includeNaviosAttributes: boolean
}
