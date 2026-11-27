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
  ParentBasedSampler,
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
import type { Sampler, SpanExporter } from '@opentelemetry/sdk-trace'

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
 * The sampler for the configured `sampling.ratio`. The ratio decides for a
 * span without a parent; a span with a parent, local or from an incoming
 * `traceparent` header, follows the decision of the parent.
 */
export function createSampler(config: ResolvedOtelConfig): Sampler {
  return new ParentBasedSampler({ root: createRootSampler(config.sampling.ratio) })
}

function createRootSampler(ratio: number): Sampler {
  if (ratio >= 1.0) {
    return new AlwaysOnSampler()
  }
  if (ratio <= 0.0) {
    return new AlwaysOffSampler()
  }
  return new TraceIdRatioBasedSampler(ratio)
}

const TRACES_PATH = /\/v1\/traces(\/?)$/

/**
 * Where metrics are sent: `metrics.endpoint`, else the traces endpoint with
 * its `/v1/traces` path suffix replaced by `/v1/metrics`. `undefined`, which
 * leaves the choice to the exporter, when there is nothing to derive it from.
 */
export function metricsEndpoint(config: ResolvedOtelConfig): string | undefined {
  if (config.metrics.endpoint !== undefined) {
    return config.metrics.endpoint
  }
  const traces = config.exporterOptions?.endpoint
  if (traces === undefined) {
    return undefined
  }
  let url: URL
  try {
    url = new URL(traces)
  } catch {
    return undefined
  }
  if (!TRACES_PATH.test(url.pathname)) {
    return undefined
  }
  url.pathname = url.pathname.replace(TRACES_PATH, '/v1/metrics$1')
  return url.toString()
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
      // Imported on demand so that the exporter stays optional. Only a
      // failed import means the package is missing; what the exporter itself
      // throws is the caller's to see.
      let exporters: typeof import('@opentelemetry/exporter-trace-otlp-http')
      try {
        exporters = await import('@opentelemetry/exporter-trace-otlp-http')
      } catch (cause) {
        logger?.error(
          'Failed to load @opentelemetry/exporter-trace-otlp-http. ' +
            'Please install it as a dependency.',
        )
        throw new Error('@opentelemetry/exporter-trace-otlp-http is required for OTLP exporter', {
          cause,
        })
      }
      return new exporters.OTLPTraceExporter({
        url: config.exporterOptions?.endpoint,
        headers: config.exporterOptions?.headers,
      })
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
    let exporters: typeof import('@opentelemetry/exporter-metrics-otlp-http')
    try {
      exporters = await import('@opentelemetry/exporter-metrics-otlp-http')
    } catch {
      logger?.warn(
        'Failed to load @opentelemetry/exporter-metrics-otlp-http. ' +
          'Metrics will not be exported.',
      )
      return readers
    }
    const url = metricsEndpoint(config)
    if (url === undefined && config.exporterOptions?.endpoint !== undefined) {
      logger?.warn(
        `The metrics endpoint cannot be derived from "${config.exporterOptions.endpoint}", ` +
          'which does not end in /v1/traces. Set metrics.endpoint; until then the metrics ' +
          'exporter uses its own default.',
      )
    }
    readers.push(
      new PeriodicExportingMetricReader({
        exporter: new exporters.OTLPMetricExporter({
          url,
          headers: config.exporterOptions?.headers,
        }),
        exportIntervalMillis: 60000,
      }),
    )
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
