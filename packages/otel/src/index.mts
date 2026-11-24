// Decorators
export {
  // Decorators
  Traceable,
  Traced,
  // Metadata helpers
  TracedMetadataKey,
  getTracedMetadata,
  extractTracedMetadata,
  hasTracedMetadata,
  getTraceableServices,
  // Deprecated - use TracedMetadataKey
  TRACED_METADATA_KEY,
} from './decorators/index.mjs'
export type {
  ClassTracedMetadata,
  MethodTracedMetadata,
  TracedMetadata,
} from './decorators/index.mjs'

// Interceptors
export { compileIgnoreRoutes, OtelHttpInterceptor } from './interceptors/index.mjs'

// Interfaces
export type {
  AutoInstrumentConfig,
  MetricsConfig,
  OtelConfig,
  OtlpExporterOptions,
  ResolvedOtelConfig,
  SamplingConfig,
  TracedOptions,
} from './interfaces/index.mjs'

// Plugins
export { otelPlugin } from './plugins/index.mjs'
export type { OtelPluginOptions } from './plugins/index.mjs'

// Services
export {
  extractTraceContext,
  OtelSetupService,
  resolveOtelConfig,
  SpanFactoryService,
  TraceContextService,
  TracedProxyFactory,
  traceInstance,
} from './services/index.mjs'
export type {
  ChildSpanOptions,
  HeaderCarrier,
  HttpSpanOptions,
  OtelSetupLogger,
} from './services/index.mjs'

// Request context key and active-span helpers
export {
  getCurrentSpan,
  getCurrentSpanContext,
  RequestSpan,
  runWithSpanContext,
} from './stores/index.mjs'
export type { SpanContext } from './stores/index.mjs'

// Tokens
export { MeterToken, OtelConfigToken, TracerToken } from './tokens/index.mjs'

// Utils
export {
  createHttpRequestAttributes,
  createNaviosAttributes,
  HttpAttributes,
  NaviosAttributes,
  parentContext,
  parseUrlAttributes,
  recordSpanError,
} from './utils/index.mjs'
