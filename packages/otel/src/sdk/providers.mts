import { context as otelContext, propagation, trace } from '@opentelemetry/api'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import {
  CompositePropagator,
  W3CBaggagePropagator,
  W3CTraceContextPropagator,
} from '@opentelemetry/core'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import {
  AlwaysOffSampler,
  AlwaysOnSampler,
  ConsoleSpanExporter,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace'
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions'

import type { AttributeValue, TracerProvider } from '@opentelemetry/api'
import type { Resource } from '@opentelemetry/resources'
import type { MetricReader } from '@opentelemetry/sdk-metrics'
import type { SpanExporter } from '@opentelemetry/sdk-trace'

import type { ResolvedOtelConfig } from '../otel-config.mjs'

import type { OtelSetupLogger } from './otel-setup-service.mjs'

/**
 * The resource that describes the service: its name, version, environment
 * and the configured `resourceAttributes`.
 */
export function createResource(config: ResolvedOtelConfig): Resource {
  const attributes: Record<string, AttributeValue> = {
    ...config.resourceAttributes,
    [ATTR_SERVICE_NAME]: config.serviceName,
  }
  if (config.serviceVersion) {
    attributes[ATTR_SERVICE_VERSION] = config.serviceVersion
  }
  if (config.environment) {
    attributes[ATTR_DEPLOYMENT_ENVIRONMENT_NAME] = config.environment
  }
  return resourceFromAttributes(attributes)
}

/**
 * The sampler for the configured `sampling.ratio`.
 */
export function createSampler(config: ResolvedOtelConfig) {
  const ratio = config.sampling.ratio
  if (ratio >= 1.0) {
    return new AlwaysOnSampler()
  }
  if (ratio <= 0.0) {
    return new AlwaysOffSampler()
  }
  return new TraceIdRatioBasedSampler(ratio)
}

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

/**
 * Makes `provider` the process-wide tracer provider, together with an
 * `AsyncLocalStorage` context manager and the W3C trace-context and baggage
 * propagators. The API keeps what is already registered.
 */
export function registerTracerProvider(provider: TracerProvider): void {
  trace.setGlobalTracerProvider(provider)
  otelContext.setGlobalContextManager(new AsyncLocalStorageContextManager().enable())
  propagation.setGlobalPropagator(
    new CompositePropagator({
      propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
    }),
  )
}
