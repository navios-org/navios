import { registerInjectable } from '@navios/di'
import {
  createNoopMeter,
  metrics,
  context as otelContext,
  propagation,
  trace,
} from '@opentelemetry/api'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import {
  AlwaysOffSampler,
  AlwaysOnSampler,
  BatchSpanProcessor,
  ConsoleSpanExporter,
  NodeTracerProvider,
  SimpleSpanProcessor,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-node'
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'

import type { AttributeValue, Meter, Tracer } from '@opentelemetry/api'
import type { Resource } from '@opentelemetry/resources'
import type { MetricReader } from '@opentelemetry/sdk-metrics'
import type { SpanExporter, SpanProcessor } from '@opentelemetry/sdk-trace-node'

import type { OtelConfig, ResolvedOtelConfig } from '../interfaces/index.mjs'

const ATTR_DEPLOYMENT_ENVIRONMENT = 'deployment.environment'

/**
 * Resolves configuration with defaults applied.
 */
export function resolveOtelConfig(config: OtelConfig): ResolvedOtelConfig {
  return {
    ...config,
    autoInstrument: {
      http: config.autoInstrument?.http ?? true,
    },
    metrics: {
      enabled: config.metrics?.enabled ?? false,
    },
    sampling: {
      ratio: config.sampling?.ratio ?? 1.0,
    },
    includeNaviosAttributes: config.includeNaviosAttributes ?? false,
    ignoreRoutes: config.ignoreRoutes ?? [],
    registerGlobally: config.registerGlobally ?? true,
  }
}

/**
 * The part of a logger the setup service writes to.
 */
export interface OtelSetupLogger {
  debug(message: string): void
  warn(message: string): void
  error(message: string, ...rest: unknown[]): void
}

/**
 * Owns the OpenTelemetry SDK objects of an application: the tracer provider
 * and, when metrics are enabled, the meter provider.
 *
 * The plugin creates and initialises one instance and provides it, so a
 * service can inject it to flush on demand:
 *
 * ```typescript
 * @Injectable()
 * class JobRunner {
 *   private readonly otel = inject(OtelSetupService)
 *
 *   async runOnce() {
 *     await this.work()
 *     await this.otel.forceFlush()
 *   }
 * }
 * ```
 */
export class OtelSetupService {
  private tracerProvider: NodeTracerProvider | null = null
  private meterProvider: MeterProvider | null = null
  private resolved: ResolvedOtelConfig | null = null
  private activeTracer: Tracer | null = null
  private activeMeter: Meter | null = null
  private ownsGlobalMeter = false
  private logger: OtelSetupLogger | null = null

  /**
   * Creates the providers. A second call is ignored.
   */
  async initialize(config: OtelConfig, logger?: OtelSetupLogger): Promise<void> {
    if (this.resolved !== null) {
      ;(logger ?? this.logger)?.warn('OtelSetupService already initialized, skipping')
      return
    }
    this.logger = logger ?? null
    const resolved = resolveOtelConfig(config)
    const resource = this.createResource(resolved)

    await this.initializeTracing(resolved, resource)
    if (resolved.metrics.enabled) {
      await this.initializeMetrics(resolved, resource)
    }
    this.resolved = resolved
    this.logger?.debug(`OpenTelemetry initialized for service: ${resolved.serviceName}`)
  }

  /**
   * Exports what is buffered without shutting anything down.
   */
  async forceFlush(): Promise<void> {
    await Promise.all([this.tracerProvider?.forceFlush(), this.meterProvider?.forceFlush()])
  }

  /**
   * Flushes pending spans and metrics and shuts the providers down. The
   * plugin calls this when the application closes.
   */
  async shutdown(): Promise<void> {
    if (this.resolved === null) {
      return
    }
    const { tracerProvider, meterProvider } = this
    this.resolved = null
    this.tracerProvider = null
    this.meterProvider = null

    await Promise.all([
      tracerProvider?.shutdown().catch((error) => {
        this.logger?.error('Error shutting down TracerProvider', error)
      }),
      meterProvider?.shutdown().catch((error) => {
        this.logger?.error('Error shutting down MeterProvider', error)
      }),
    ])

    // Take back the globals this service registered, so that a provider that
    // is shut down does not stay the process-wide one.
    const globalProvider = trace.getTracerProvider() as { getDelegate?: () => unknown }
    if (tracerProvider !== null && globalProvider.getDelegate?.() === tracerProvider) {
      trace.disable()
      otelContext.disable()
      propagation.disable()
    }
    if (this.ownsGlobalMeter) {
      metrics.disable()
      this.ownsGlobalMeter = false
    }
    this.logger?.debug('OpenTelemetry shut down')
  }

  /**
   * The resolved configuration. Throws before `initialize()`.
   */
  getConfig(): ResolvedOtelConfig {
    if (this.resolved === null) {
      throw new Error('[Navios] OtelSetupService is not initialized.')
    }
    return this.resolved
  }

  /**
   * The application's tracer, or a no-op tracer before `initialize()`.
   */
  getTracer(): Tracer {
    return this.activeTracer ?? trace.getTracer('navios-otel')
  }

  /**
   * The application's meter. It is a no-op meter unless metrics are enabled.
   */
  getMeter(): Meter {
    return this.activeMeter ?? createNoopMeter()
  }

  private createResource(config: ResolvedOtelConfig): Resource {
    const attributes: Record<string, AttributeValue> = {
      ...config.resourceAttributes,
      [ATTR_SERVICE_NAME]: config.serviceName,
    }
    if (config.serviceVersion) {
      attributes[ATTR_SERVICE_VERSION] = config.serviceVersion
    }
    if (config.environment) {
      attributes[ATTR_DEPLOYMENT_ENVIRONMENT] = config.environment
    }
    return resourceFromAttributes(attributes)
  }

  private async initializeTracing(config: ResolvedOtelConfig, resource: Resource): Promise<void> {
    const exporter = await this.createSpanExporter(config)
    const spanProcessors: SpanProcessor[] = []
    if (exporter) {
      // Console output is immediate; real exporters are batched.
      spanProcessors.push(
        config.exporter === 'console'
          ? new SimpleSpanProcessor(exporter)
          : new BatchSpanProcessor(exporter),
      )
    }
    if (config.spanProcessors) {
      spanProcessors.push(...config.spanProcessors)
    }

    this.tracerProvider = new NodeTracerProvider({
      resource,
      sampler: this.createSampler(config),
      spanProcessors,
    })
    if (config.registerGlobally) {
      // Also installs the AsyncLocalStorage context manager and the W3C
      // trace-context and baggage propagators.
      this.tracerProvider.register()
    }
    this.activeTracer = this.tracerProvider.getTracer(config.serviceName, config.serviceVersion)
  }

  private async createSpanExporter(config: ResolvedOtelConfig): Promise<SpanExporter | null> {
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
          this.logger?.error(
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

  private async initializeMetrics(config: ResolvedOtelConfig, resource: Resource): Promise<void> {
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
        this.logger?.warn(
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

    this.meterProvider = new MeterProvider({ resource, readers })
    if (config.registerGlobally) {
      this.ownsGlobalMeter = metrics.setGlobalMeterProvider(this.meterProvider)
    }
    this.activeMeter = this.meterProvider.getMeter(config.serviceName, config.serviceVersion)
  }
}

registerInjectable(OtelSetupService)
