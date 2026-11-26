import { Container } from '@navios/di'
import {
  context as otelContext,
  propagation,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api'
import { InMemorySpanExporter, SimpleSpanProcessor, TracerProvider } from '@opentelemetry/sdk-trace'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  OtelConfigToken,
  OtelSetupService,
  resolveOtelConfig,
  TraceContextService,
  Traced,
  TracedProxyFactory,
  TracerToken,
} from '../index.mjs'
import { registerTracerProvider } from '../sdk/register-tracer-provider.mjs'

describe('services', () => {
  let container: Container
  let exporter: InMemorySpanExporter
  let provider: TracerProvider

  beforeEach(() => {
    exporter = new InMemorySpanExporter()
    provider = new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter })] })
    registerTracerProvider(provider)
    container = new Container()
    container.provide(TracerToken, { value: provider.getTracer('test') })
    container.provide(OtelConfigToken, {
      value: resolveOtelConfig({
        serviceName: 'test',
        exporter: 'none',
        includeNaviosAttributes: true,
      }),
    })
  })

  afterEach(async () => {
    await container.dispose()
    await provider.shutdown()
    trace.disable()
    otelContext.disable()
    propagation.disable()
  })

  describe('TraceContextService', () => {
    it('makes a span active for the duration of a function, across awaits', async () => {
      const service = await container.get(TraceContextService)
      const span = provider.getTracer('test').startSpan('outer')

      expect(service.getCurrentSpan()).toBeUndefined()
      const seen = await service.runWithSpan(span, async () => {
        await new Promise((resolve) => setTimeout(resolve, 1))
        return service.getCurrentSpan()
      })

      expect(seen).toBe(span)
      expect(service.getCurrentSpan()).toBeUndefined()
    })

    it('injects the active span into headers and extracts it again', async () => {
      const service = await container.get(TraceContextService)
      const span = provider.getTracer('test').startSpan('client-call')
      const headers: Record<string, string> = {}

      service.runWithSpan(span, () => service.injectIntoHeaders(headers))

      const { traceId, spanId } = span.spanContext()
      expect(headers.traceparent).toBe(`00-${traceId}-${spanId}-01`)

      for (const carrier of [headers, new Headers(headers)]) {
        const extracted = trace.getSpanContext(service.extractFromHeaders(carrier))
        expect(extracted).toMatchObject({ traceId, spanId, isRemote: true })
      }
    })

    it('extracts nothing from headers without trace context', async () => {
      const service = await container.get(TraceContextService)

      expect(trace.getSpanContext(service.extractFromHeaders({ accept: '*/*' }))).toBeUndefined()
    })
  })

  describe('TracedProxyFactory', () => {
    it('instruments an object the container did not build, in place and once', async () => {
      @Traced({ name: 'report' })
      class ReportBuilder {
        label = 'q3'
        build() {
          return `built ${this.label}`
        }
      }
      const factory = await container.get(TracedProxyFactory)
      const builder = new ReportBuilder()

      const traced = factory.wrap(builder, ReportBuilder)
      expect(traced).toBe(builder)
      expect(factory.wrap(traced, ReportBuilder)).toBe(builder)
      expect(Object.keys(builder)).toEqual(['label'])

      expect(traced.build()).toBe('built q3')
      expect(exporter.getFinishedSpans().map((span) => span.name)).toEqual(['report.build'])
    })

    it('returns an instance of an unmarked class untouched', async () => {
      class Plain {
        run() {
          return 1
        }
      }
      const factory = await container.get(TracedProxyFactory)
      const plain = new Plain()

      expect(factory.wrap(plain, Plain)).toBe(plain)
      expect(Object.getOwnPropertyNames(plain)).toEqual([])
    })
  })

  describe('OtelSetupService', () => {
    it('hands out no-op instruments before it is initialized', async () => {
      const setup = await container.get(OtelSetupService)

      expect(() => setup.getConfig()).toThrow('not initialized')
      expect(typeof setup.getTracer().startSpan).toBe('function')
      expect(typeof setup.getMeter().createCounter).toBe('function')
      await expect(setup.shutdown()).resolves.toBeUndefined()
    })

    it('ignores a second initialize and creates a meter when metrics are enabled', async () => {
      const warnings: string[] = []
      const logger = { debug() {}, warn: (message: string) => warnings.push(message), error() {} }
      const setup = new OtelSetupService()

      await setup.initialize(
        {
          serviceName: 'first',
          exporter: 'none',
          registerGlobally: false,
          metrics: { enabled: true },
        },
        logger,
      )
      await setup.initialize({ serviceName: 'second', exporter: 'none' }, logger)

      expect(setup.getConfig().serviceName).toBe('first')
      expect(warnings).toEqual(['OtelSetupService already initialized, skipping'])
      const counter = setup.getMeter().createCounter('jobs')
      expect(() => counter.add(1)).not.toThrow()
      await setup.shutdown()
    })

    it('rejects an unknown exporter', async () => {
      const setup = new OtelSetupService()

      await expect(
        setup.initialize({ serviceName: 'x', exporter: 'zipkin' as never }),
      ).rejects.toThrow('Unknown exporter type: zipkin')
    })
  })
})
