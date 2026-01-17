import type { BunOtelPluginOptions } from '@navios/otel-bun'

/**
 * Parse environment variables to build OTEL configuration.
 * All values can be configured via environment variables.
 */
export function getOtelConfig(): BunOtelPluginOptions {
  const env = process.env

  // Parse exporter type
  const exporterType = (env.OTEL_EXPORTER || 'console') as 'otlp' | 'console' | 'none'

  // Parse headers if provided
  let headers: Record<string, string> | undefined
  if (env.OTEL_HEADERS) {
    try {
      headers = JSON.parse(env.OTEL_HEADERS)
    } catch {
      console.warn('Failed to parse OTEL_HEADERS, ignoring')
    }
  }

  // Parse ignore routes
  const ignoreRoutes = env.OTEL_IGNORE_ROUTES
    ? env.OTEL_IGNORE_ROUTES.split(',').map((r) => r.trim())
    : ['/health']

  // Build configuration from environment variables
  const config: BunOtelPluginOptions = {
    // Service identification
    serviceName: env.OTEL_SERVICE_NAME || 'otel-bun-example',
    serviceVersion: env.OTEL_SERVICE_VERSION || '1.0.0',
    environment: env.OTEL_ENVIRONMENT || 'development',

    // Exporter configuration
    exporter: exporterType,
    exporterOptions: {
      endpoint: env.OTEL_TRACES_ENDPOINT || 'http://localhost:4318/v1/traces',
      headers,
      useHttp: env.OTEL_USE_HTTP !== 'false',
    },

    // Auto-instrumentation
    autoInstrument: {
      http: env.OTEL_AUTO_INSTRUMENT_HTTP !== 'false',
      handlers: env.OTEL_AUTO_INSTRUMENT_HANDLERS !== 'false',
      guards: env.OTEL_AUTO_INSTRUMENT_GUARDS === 'true',
    },

    // Navios-specific attributes
    includeNaviosAttributes: env.OTEL_INCLUDE_NAVIOS_ATTRIBUTES === 'true',

    // Metrics
    metrics: {
      enabled: env.OTEL_METRICS_ENABLED === 'true',
      requestDuration: env.OTEL_METRICS_REQUEST_DURATION !== 'false',
      errorCount: env.OTEL_METRICS_ERROR_COUNT !== 'false',
    },

    // Sampling
    sampling: {
      ratio: parseFloat(env.OTEL_SAMPLING_RATIO || '1.0'),
    },

    // Routes to ignore
    ignoreRoutes,
  }

  return config
}

/**
 * Log the current OTEL configuration for debugging.
 */
export function logOtelConfig(config: BunOtelPluginOptions): void {
  console.log('\n=== OpenTelemetry Configuration ===')
  console.log(`Service Name: ${config.serviceName}`)
  console.log(`Service Version: ${config.serviceVersion}`)
  console.log(`Environment: ${config.environment}`)
  console.log(`Exporter: ${config.exporter}`)

  if (config.exporter === 'otlp' && config.exporterOptions) {
    console.log(`Endpoint: ${config.exporterOptions.endpoint}`)
  }

  console.log(`Auto-Instrument HTTP: ${config.autoInstrument?.http}`)
  console.log(`Auto-Instrument Handlers: ${config.autoInstrument?.handlers}`)
  console.log(`Auto-Instrument Guards: ${config.autoInstrument?.guards}`)
  console.log(`Metrics Enabled: ${config.metrics?.enabled}`)
  console.log(`Sampling Ratio: ${config.sampling?.ratio}`)
  console.log(`Ignored Routes: ${config.ignoreRoutes?.join(', ')}`)
  console.log('===================================\n')
}
