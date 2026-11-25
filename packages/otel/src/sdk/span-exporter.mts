import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node'

import type { SpanExporter } from '@opentelemetry/sdk-trace-node'

import type { ResolvedOtelConfig } from '../config/otel-config.mjs'

import type { OtelSetupLogger } from './otel-setup-logger.mjs'

/**
 * The span exporter for the configured `exporter`, or `null` for `'none'`.
 */
export async function createSpanExporter(
  config: ResolvedOtelConfig,
  logger: OtelSetupLogger | null,
): Promise<SpanExporter | null> {
  switch (config.exporter) {
    case 'console':
      return new ConsoleSpanExporter()

    case 'otlp': {
      // Imported on demand so that the exporter stays optional.
      try {
        const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http')
        return new OTLPTraceExporter({
          url: config.exporterOptions?.endpoint,
          headers: config.exporterOptions?.headers,
        })
      } catch {
        logger?.error(
          'Failed to load @opentelemetry/exporter-trace-otlp-http. ' +
            'Please install it as a dependency.',
        )
        throw new Error('@opentelemetry/exporter-trace-otlp-http is required for OTLP exporter')
      }
    }

    case 'none':
      return null

    default:
      throw new Error(`Unknown exporter type: ${config.exporter}`)
  }
}
