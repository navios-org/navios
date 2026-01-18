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

// Factories
export { createTracedWrapperFactory } from './factories/index.mjs'

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
export { defineOtelTracingPlugin } from './plugins/index.mjs'
export type { OtelTracingPluginOptions } from './plugins/index.mjs'

// Services
export {
  OtelSetupService,
  SpanFactoryService,
  TraceContextService,
  TracedProxyFactory,
} from './services/index.mjs'
export type { ChildSpanOptions, HttpSpanOptions } from './services/index.mjs'

// Stores
export {
  getCurrentSpan,
  getCurrentSpanContext,
  getSpanContextStore,
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
  parseUrlAttributes,
} from './utils/index.mjs'
