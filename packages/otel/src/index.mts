// Configuration
export { OtelConfigToken, resolveOtelConfig } from './config/index.mjs'
export type {
  AutoInstrumentConfig,
  MetricsConfig,
  OtelConfig,
  OtlpExporterOptions,
  ResolvedOtelConfig,
  SamplingConfig,
} from './config/index.mjs'

// SDK setup
export { MeterToken, OtelSetupService, TracerToken } from './sdk/index.mjs'
export type { OtelSetupLogger } from './sdk/index.mjs'

// Tracing: spans, the active span and trace context propagation
export {
  extractTraceContext,
  getCurrentSpan,
  injectTraceContext,
  parentContext,
  recordSpanError,
  RequestSpan,
} from './tracing/index.mjs'
export type { HeaderCarrier } from './tracing/index.mjs'

// @Traced / @Traceable
export {
  extractTracedMetadata,
  getTraceableServices,
  getTracedMetadata,
  hasTracedMetadata,
  Traceable,
  Traced,
  TracedMetadataKey,
  TracedProxyFactory,
  traceInstance,
} from './traced/index.mjs'
export type {
  ClassTracedMetadata,
  MethodTracedMetadata,
  TracedMetadata,
  TracedOptions,
} from './traced/index.mjs'

// Handlers of transports other than HTTP. The HTTP request span is in
// `@navios/otel/http`.
export { OtelHandlerInterceptor } from './handlers/index.mjs'

// Plugin
export { otelPlugin } from './otel-plugin.mjs'
export type { OtelPluginOptions } from './otel-plugin.mjs'
