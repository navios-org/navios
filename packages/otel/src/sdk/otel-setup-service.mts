import { registerInjectable } from '@navios/di'
import {
  createNoopMeter,
  metrics,
  context as otelContext,
  propagation,
  trace,
} from '@opentelemetry/api'
import { MeterProvider } from '@opentelemetry/sdk-metrics'
import { BatchSpanProcessor, SimpleSpanProcessor, TracerProvider } from '@opentelemetry/sdk-trace'

import type { Meter, Tracer } from '@opentelemetry/api'
import type { Resource } from '@opentelemetry/resources'
import type { SpanProcessor } from '@opentelemetry/sdk-trace'

import { resolveOtelConfig } from '../otel-config.mjs'

import type { OtelConfig, ResolvedOtelConfig } from '../otel-config.mjs'

import {
  createMetricReaders,
  createResource,
  createSampler,
  createSpanExporter,
  registerTracerProvider,
} from './providers.mjs'

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
  private tracerProvider: TracerProvider | null = null
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
    const resource = createResource(resolved)

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

  private async initializeTracing(config: ResolvedOtelConfig, resource: Resource): Promise<void> {
    const exporter = await createSpanExporter(config, this.logger)
    const spanProcessors: SpanProcessor[] = []
    if (exporter) {
      // Console output is immediate; real exporters are batched.
      spanProcessors.push(
        config.exporter === 'console'
          ? new SimpleSpanProcessor({ exporter })
          : new BatchSpanProcessor({ exporter }),
      )
    }
    if (config.spanProcessors) {
      spanProcessors.push(...config.spanProcessors)
    }

    this.tracerProvider = new TracerProvider({
      resource,
      sampler: createSampler(config),
      spanProcessors,
    })
    if (config.registerGlobally) {
      registerTracerProvider(this.tracerProvider)
    }
    this.activeTracer = this.tracerProvider.getTracer(config.serviceName, config.serviceVersion)
  }

  private async initializeMetrics(config: ResolvedOtelConfig, resource: Resource): Promise<void> {
    const readers = await createMetricReaders(config, this.logger)

    this.meterProvider = new MeterProvider({ resource, readers })
    if (config.registerGlobally) {
      this.ownsGlobalMeter = metrics.setGlobalMeterProvider(this.meterProvider)
    }
    this.activeMeter = this.meterProvider.getMeter(config.serviceName, config.serviceVersion)
  }
}

registerInjectable(OtelSetupService)
