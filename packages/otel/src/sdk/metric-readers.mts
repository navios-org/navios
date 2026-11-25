import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'

import type { MetricReader } from '@opentelemetry/sdk-metrics'

import type { ResolvedOtelConfig } from '../config/otel-config.mjs'

import type { OtelSetupLogger } from './otel-setup-logger.mjs'

/**
 * The metric readers for the configured `exporter`. There is none for
 * `'none'`, or when the OTLP metrics exporter is not installed.
 */
export async function createMetricReaders(
  config: ResolvedOtelConfig,
  logger: OtelSetupLogger | null,
): Promise<MetricReader[]> {
  const readers: MetricReader[] = []

  if (config.exporter === 'otlp') {
    try {
      const { OTLPMetricExporter } = await import('@opentelemetry/exporter-metrics-otlp-http')
      readers.push(
        new PeriodicExportingMetricReader({
          exporter: new OTLPMetricExporter({
            url: config.exporterOptions?.endpoint?.replace('/traces', '/metrics'),
            headers: config.exporterOptions?.headers,
          }),
          exportIntervalMillis: 60000,
        }),
      )
    } catch {
      logger?.warn(
        'Failed to load @opentelemetry/exporter-metrics-otlp-http. ' +
          'Metrics will not be exported.',
      )
    }
  } else if (config.exporter === 'console') {
    const { ConsoleMetricExporter } = await import('@opentelemetry/sdk-metrics')
    readers.push(
      new PeriodicExportingMetricReader({
        exporter: new ConsoleMetricExporter(),
        exportIntervalMillis: 10000,
      }),
    )
  }
  return readers
}
