import type { OtelConfig } from '@navios/otel'

/**
 * Options for the Fastify OpenTelemetry plugin.
 */
export interface FastifyOtelPluginOptions extends OtelConfig {
  /**
   * Routes to ignore for tracing.
   * Supports glob patterns.
   * @example ['/health', '/metrics', '/docs/*']
   */
  ignoreRoutes?: string[]

  /**
   * Whether to propagate trace context to downstream services.
   * When true, the plugin will inject trace headers into outgoing requests.
   * @default true
   */
  propagateContext?: boolean
}
