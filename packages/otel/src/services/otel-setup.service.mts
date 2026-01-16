import type { Meter, Tracer } from '@opentelemetry/api'
import type { SpanExporter } from '@opentelemetry/sdk-trace-node'
import type { MetricReader } from '@opentelemetry/sdk-metrics'

import { Container, inject, Injectable, Logger } from '@navios/core'
import { metrics, trace } from '@opentelemetry/api'
import {
  resourceFromAttributes,
  type Resource,
} from '@opentelemetry/resources'
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions'

// Deployment environment attribute
const ATTR_DEPLOYMENT_ENVIRONMENT = 'deployment.environment'
import {
  AlwaysOffSampler,
  AlwaysOnSampler,
  BatchSpanProcessor,
  ConsoleSpanExporter,
  NodeTracerProvider,
  SimpleSpanProcessor,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-node'
import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics'

import type { OtelConfig, ResolvedOtelConfig } from '../interfaces/index.mjs'

import { MeterToken, OtelConfigToken, TracerToken } from '../tokens/index.mjs'

/**
 * Resolves configuration with defaults applied.
 */
function resolveConfig(config: OtelConfig): ResolvedOtelConfig {
  return {
    ...config,
    autoInstrument: {
      http: config.autoInstrument?.http ?? true,
      handlers: config.autoInstrument?.handlers ?? true,
      guards: config.autoInstrument?.guards ?? false,
    },
    metrics: {
      enabled: config.metrics?.enabled ?? false,
      requestDuration: config.metrics?.requestDuration ?? true,
      errorCount: config.metrics?.errorCount ?? true,
    },
    sampling: {
      ratio: config.sampling?.ratio ?? 1.0,
    },
    includeNaviosAttributes: config.includeNaviosAttributes ?? false,
  }
}

/**
 * Service responsible for initializing and managing OpenTelemetry SDK.
 *
 * This service handles:
 * - Creating and configuring the TracerProvider
 * - Creating and configuring the MeterProvider (if metrics enabled)
 * - Registering tracer and meter instances in the DI container
 * - Graceful shutdown of providers
 *
 * @example
 * ```typescript
 * // Usually used via the plugin, but can be used directly:
 * const setupService = await container.get(OtelSetupService)
 * await setupService.initialize({
 *   serviceName: 'my-service',
 *   exporter: 'console',
 *   autoInstrument: { http: true },
 * })
 *
 * // Later, during shutdown:
 * await setupService.shutdown()
 * ```
 */
@Injectable()
export class OtelSetupService {
  private readonly container = inject(Container)
  private readonly logger = inject(Logger, { context: OtelSetupService.name })

  private tracerProvider: NodeTracerProvider | null = null
  private meterProvider: MeterProvider | null = null
  private initialized = false

  /**
   * Initializes the OpenTelemetry SDK with the provided configuration.
   *
   * @param config - OpenTelemetry configuration
   */
  async initialize(config: OtelConfig): Promise<void> {
    if (this.initialized) {
      this.logger.warn('OtelSetupService already initialized, skipping')
      return
    }

    const resolvedConfig = resolveConfig(config)

    // Register config in container
    this.container.addInstance(OtelConfigToken, resolvedConfig)

    // Create resource
    const resource = this.createResource(resolvedConfig)

    // Initialize tracing
    await this.initializeTracing(resolvedConfig, resource)

    // Initialize metrics if enabled
    if (resolvedConfig.metrics.enabled) {
      await this.initializeMetrics(resolvedConfig, resource)
    }

    this.initialized = true
    this.logger.debug(
      `OpenTelemetry initialized for service: ${resolvedConfig.serviceName}`,
    )
  }

  /**
   * Shuts down OpenTelemetry providers gracefully.
   *
   * This should be called during application shutdown to ensure
   * all pending traces and metrics are flushed.
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) {
      return
    }

    const shutdownPromises: Promise<void>[] = []

    if (this.tracerProvider) {
      shutdownPromises.push(
        this.tracerProvider.shutdown().catch((err) => {
          this.logger.error('Error shutting down TracerProvider', err)
        }),
      )
    }

    if (this.meterProvider) {
      shutdownPromises.push(
        this.meterProvider.shutdown().catch((err) => {
          this.logger.error('Error shutting down MeterProvider', err)
        }),
      )
    }

    await Promise.all(shutdownPromises)
    this.initialized = false
    this.logger.debug('OpenTelemetry shut down')
  }

  /**
   * Creates the resource with service information.
   */
  private createResource(config: ResolvedOtelConfig): Resource {
    const attributes: Record<string, string> = {
      [ATTR_SERVICE_NAME]: config.serviceName,
    }

    if (config.serviceVersion) {
      attributes[ATTR_SERVICE_VERSION] = config.serviceVersion
    }

    if (config.environment) {
      attributes[ATTR_DEPLOYMENT_ENVIRONMENT] = config.environment
    }

    // Add custom resource attributes
    if (config.resourceAttributes) {
      for (const [key, value] of Object.entries(config.resourceAttributes)) {
        if (typeof value === 'string') {
          attributes[key] = value
        }
      }
    }

    return resourceFromAttributes(attributes)
  }

  /**
   * Initializes the TracerProvider and registers the tracer.
   */
  private async initializeTracing(
    config: ResolvedOtelConfig,
    resource: Resource,
  ): Promise<void> {
    // Create span exporter
    const exporter = await this.createSpanExporter(config)

    // Build span processors array
    const spanProcessors = exporter
      ? [
          // Use SimpleSpanProcessor for console (immediate output)
          // Use BatchSpanProcessor for production exporters (better performance)
          config.exporter === 'console'
            ? new SimpleSpanProcessor(exporter)
            : new BatchSpanProcessor(exporter),
        ]
      : []

    // Create tracer provider with span processors
    this.tracerProvider = new NodeTracerProvider({
      resource,
      sampler: this.createSampler(config),
      spanProcessors,
    })

    // Register provider globally
    this.tracerProvider.register()

    // Create and register tracer
    const tracer = trace.getTracer(config.serviceName, config.serviceVersion)
    this.container.addInstance(TracerToken, tracer)
  }

  /**
   * Creates a span exporter based on configuration.
   */
  private async createSpanExporter(
    config: ResolvedOtelConfig,
  ): Promise<SpanExporter | null> {
    switch (config.exporter) {
      case 'console':
        return new ConsoleSpanExporter()

      case 'otlp': {
        // Dynamically import OTLP exporter to keep it optional
        try {
          const { OTLPTraceExporter } = await import(
            '@opentelemetry/exporter-trace-otlp-http'
          )
          return new OTLPTraceExporter({
            url: config.exporterOptions?.endpoint,
            headers: config.exporterOptions?.headers,
          })
        } catch {
          this.logger.error(
            'Failed to load @opentelemetry/exporter-trace-otlp-http. ' +
              'Please install it as a dependency.',
          )
          throw new Error(
            '@opentelemetry/exporter-trace-otlp-http is required for OTLP exporter',
          )
        }
      }

      case 'none':
        return null

      default:
        throw new Error(`Unknown exporter type: ${config.exporter}`)
    }
  }

  /**
   * Creates a sampler based on configuration.
   */
  private createSampler(config: ResolvedOtelConfig) {
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
   * Initializes the MeterProvider and registers the meter.
   */
  private async initializeMetrics(
    config: ResolvedOtelConfig,
    resource: Resource,
  ): Promise<void> {
    const readers: MetricReader[] = []

    // Create metric reader based on exporter type
    if (config.exporter === 'otlp') {
      try {
        const { OTLPMetricExporter } = await import(
          '@opentelemetry/exporter-metrics-otlp-http'
        )
        const metricExporter = new OTLPMetricExporter({
          url: config.exporterOptions?.endpoint?.replace('/traces', '/metrics'),
          headers: config.exporterOptions?.headers,
        })
        readers.push(
          new PeriodicExportingMetricReader({
            exporter: metricExporter,
            exportIntervalMillis: 60000, // 1 minute
          }),
        )
      } catch {
        this.logger.warn(
          'Failed to load @opentelemetry/exporter-metrics-otlp-http. ' +
            'Metrics will not be exported.',
        )
      }
    } else if (config.exporter === 'console') {
      // For console exporter, use periodic console metric reader
      const { ConsoleMetricExporter } = await import(
        '@opentelemetry/sdk-metrics'
      )
      readers.push(
        new PeriodicExportingMetricReader({
          exporter: new ConsoleMetricExporter(),
          exportIntervalMillis: 10000, // 10 seconds for console
        }),
      )
    }

    // Create meter provider
    this.meterProvider = new MeterProvider({
      resource,
      readers,
    })

    // Register provider globally
    metrics.setGlobalMeterProvider(this.meterProvider)

    // Create and register meter
    const meter = metrics.getMeter(config.serviceName, config.serviceVersion)
    this.container.addInstance(MeterToken, meter)
  }

  /**
   * Gets the tracer instance.
   */
  getTracer(): Tracer {
    return trace.getTracer('navios-otel')
  }

  /**
   * Gets the meter instance.
   */
  getMeter(): Meter {
    return metrics.getMeter('navios-otel')
  }
}
