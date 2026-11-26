// Configuration
export { OtelConfigToken } from './otel-config.mjs'
export type {
  AutoInstrumentConfig,
  MetricsConfig,
  OtelConfig,
  OtlpExporterOptions,
  ResolvedOtelConfig,
  SamplingConfig,
} from './otel-config.mjs'

// SDK setup
export { MeterToken } from './sdk/meter-token.mjs'
export { OtelSetupService } from './sdk/otel-setup-service.mjs'
export type { OtelSetupLogger } from './sdk/otel-setup-service.mjs'
export { TracerToken } from './sdk/tracer-token.mjs'

// Tracing: spans, the active span and trace context propagation
export {
  extractTraceContext,
  getCurrentSpan,
  injectTraceContext,
  parentContext,
  RequestSpan,
} from './tracing/context.mjs'
export type { HeaderCarrier } from './tracing/context.mjs'
export { recordSpanError } from './tracing/span.mjs'

// @Traced / @Traceable
export { traceInstance } from './traced/trace-instance.mjs'
export { Traceable, Traced } from './traced/traced.mjs'
export type { TracedOptions } from './traced/traced-metadata.mjs'
export { TracedProxyFactory } from './traced/traced-proxy-factory.mjs'

// Handlers of transports other than HTTP. The HTTP request span is in
// `@navios/otel/http`.
export { OtelHandlerInterceptor } from './otel-handler-interceptor.mjs'

// Plugin
export { otelPlugin } from './otel-plugin.mjs'
export type { OtelPluginOptions } from './otel-plugin.mjs'
