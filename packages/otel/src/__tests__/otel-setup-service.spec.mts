import { createServer } from 'node:http'
import type { IncomingMessage, Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { context as otelContext, propagation, ROOT_CONTEXT, trace } from '@opentelemetry/api'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { OtelSetupService } from '../index.mjs'
import { resolveOtelConfig } from '../otel-config.mjs'
import { metricsEndpoint } from '../sdk/providers.mjs'

import type { OtelConfig } from '../index.mjs'

interface OtlpBody {
  resourceSpans: {
    resource: { attributes: { key: string; value: { stringValue?: string } }[] }
    scopeSpans: { scope: { name: string }; spans: { name: string; traceId: string }[] }[]
  }[]
  resourceMetrics: { scopeMetrics: { metrics: { name: string }[] }[] }[]
}

describe('OtelSetupService', () => {
  const services: OtelSetupService[] = []
  const servers: Server[] = []

  async function setUp(config: Partial<OtelConfig>): Promise<OtelSetupService> {
    const service = new OtelSetupService()
    services.push(service)
    await service.initialize({ serviceName: 'setup-test', exporter: 'none', ...config })
    return service
  }

  /** A stand-in for an OTLP collector: keeps every request it receives. */
  async function startCollector() {
    const requests: { url?: string; headers: IncomingMessage['headers']; body: OtlpBody }[] = []
    const server = createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on('data', (chunk) => chunks.push(chunk))
      req.on('end', () => {
        requests.push({
          url: req.url,
          headers: req.headers,
          body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
        })
        res.writeHead(200, { 'content-type': 'application/json' }).end('{}')
      })
    })
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as AddressInfo
    return { requests, endpoint: `http://127.0.0.1:${port}/v1/traces` }
  }

  afterEach(async () => {
    vi.restoreAllMocks()
    await Promise.all(services.splice(0).map((service) => service.shutdown()))
    await Promise.all(
      servers.splice(0).map((server) => new Promise<unknown>((resolve) => server.close(resolve))),
    )
  })

  describe('exporters', () => {
    it('sends spans to an OTLP endpoint, with the resource and the headers', async () => {
      const collector = await startCollector()
      const service = await setUp({
        exporter: 'otlp',
        serviceVersion: '1.2.3',
        exporterOptions: { endpoint: collector.endpoint, headers: { 'x-api-key': 'test-key' } },
      })

      const span = service.getTracer().startSpan('job')
      span.end()
      // Batched: nothing is sent before a flush.
      expect(collector.requests).toHaveLength(0)
      await service.forceFlush()

      expect(collector.requests).toHaveLength(1)
      const [{ headers, body }] = collector.requests
      expect(headers['x-api-key']).toBe('test-key')
      const [{ resource, scopeSpans }] = body.resourceSpans
      const attributes = Object.fromEntries(
        resource.attributes.map(({ key, value }) => [key, value.stringValue]),
      )
      expect(attributes).toMatchObject({
        'service.name': 'setup-test',
        'service.version': '1.2.3',
      })
      expect(scopeSpans[0].scope.name).toBe('setup-test')
      expect(scopeSpans[0].spans).toMatchObject([
        { name: 'job', traceId: span.spanContext().traceId },
      ])
    })

    it('sends metrics to the OTLP endpoint next to the one for traces', async () => {
      const collector = await startCollector()
      const service = await setUp({
        exporter: 'otlp',
        exporterOptions: { endpoint: collector.endpoint },
        metrics: { enabled: true },
      })

      service.getMeter().createCounter('jobs').add(1)
      await service.forceFlush()

      const request = collector.requests.find(({ url }) => url === '/v1/metrics')
      expect(request?.body.resourceMetrics[0].scopeMetrics[0].metrics).toMatchObject([
        { name: 'jobs' },
      ])
    })

    it('sends metrics to metrics.endpoint when it is set', async () => {
      const collector = await startCollector()
      const service = await setUp({
        exporter: 'otlp',
        exporterOptions: { endpoint: collector.endpoint },
        metrics: { enabled: true, endpoint: collector.endpoint.replace('/v1/traces', '/custom') },
      })

      service.getMeter().createCounter('jobs').add(1)
      await service.forceFlush()

      expect(collector.requests.map(({ url }) => url)).toEqual(['/custom'])
    })

    it('derives the metrics endpoint only from a /v1/traces path', () => {
      const derive = (endpoint?: string, metrics?: string) =>
        metricsEndpoint(
          resolveOtelConfig({
            serviceName: 'x',
            exporter: 'otlp',
            exporterOptions: { endpoint },
            metrics: { enabled: true, endpoint: metrics },
          }),
        )

      expect(derive('http://localhost:4318/v1/traces')).toBe('http://localhost:4318/v1/metrics')
      expect(derive('http://traces.internal:4318/v1/traces')).toBe(
        'http://traces.internal:4318/v1/metrics',
      )
      expect(derive('https://otlp.example/otlp/v1/traces/?key=1')).toBe(
        'https://otlp.example/otlp/v1/metrics/?key=1',
      )
      // Not the traces URL, and not a guess: the exporter's own default.
      expect(derive('http://traces.internal:4318/ingest')).toBeUndefined()
      expect(derive(undefined)).toBeUndefined()
      expect(derive('http://localhost:4318/v1/traces', 'http://metrics:9000/in')).toBe(
        'http://metrics:9000/in',
      )
    })

    it('warns when the metrics endpoint cannot be derived from the traces endpoint', async () => {
      const logger = { debug: vi.fn(), warn: vi.fn(), error: vi.fn() }
      const service = new OtelSetupService()
      services.push(service)
      await service.initialize(
        {
          serviceName: 'setup-test',
          exporter: 'otlp',
          exporterOptions: { endpoint: 'http://127.0.0.1:9/ingest' },
          metrics: { enabled: true },
        },
        logger,
      )

      expect(logger.warn).toHaveBeenCalledTimes(1)
      expect(logger.warn.mock.calls[0][0]).toContain('metrics.endpoint')
    })

    it('writes spans to the console as they end', async () => {
      const dir = vi.spyOn(console, 'dir').mockImplementation(() => {})
      const service = await setUp({ exporter: 'console' })

      service.getTracer().startSpan('job').end()
      await service.forceFlush()

      expect(dir).toHaveBeenCalledTimes(1)
      expect(dir.mock.calls[0][0]).toMatchObject({ name: 'job' })
    })
  })

  describe('sampling', () => {
    it.each([
      [1, true],
      [0, false],
    ])('records with ratio %d: %s', async (ratio, recording) => {
      const service = await setUp({ sampling: { ratio } })

      expect(service.getTracer().startSpan('job').isRecording()).toBe(recording)
    })

    it.each([
      [1, 0, false],
      [0, 1, true],
      [0.5, 0, false],
      [0.5, 1, true],
    ])(
      'follows the decision of the parent: ratio %d under a parent with flags %d records: %s',
      async (ratio, traceFlags, recording) => {
        const service = await setUp({ sampling: { ratio } })
        const parent = trace.setSpanContext(ROOT_CONTEXT, {
          traceId: '0af7651916cd43dd8448eb211c80319c',
          spanId: 'b7ad6b7169203331',
          traceFlags,
          isRemote: true,
        })

        const span = service.getTracer().startSpan('job', {}, parent)
        expect(span.isRecording()).toBe(recording)
        expect(span.spanContext().traceFlags).toBe(traceFlags)
      },
    )
  })

  describe('registerGlobally', () => {
    it('installs the provider, a context manager and the W3C propagators', async () => {
      await setUp({})

      const span = trace.getTracer('anywhere').startSpan('outer')
      expect(span.isRecording()).toBe(true)

      await otelContext.with(trace.setSpan(ROOT_CONTEXT, span), async () => {
        await Promise.resolve()
        // The context manager carries the active span across an await.
        expect(trace.getActiveSpan()).toBe(span)

        const baggage = propagation.createBaggage({ tenant: { value: 'acme' } })
        const carrier: Record<string, string> = {}
        propagation.inject(propagation.setBaggage(otelContext.active(), baggage), carrier)
        const { traceId, spanId } = span.spanContext()
        expect(carrier.traceparent).toBe(`00-${traceId}-${spanId}-01`)
        expect(carrier.baggage).toBe('tenant=acme')

        const extracted = propagation.extract(ROOT_CONTEXT, carrier)
        expect(trace.getSpanContext(extracted)).toMatchObject({ traceId, spanId })
        expect(propagation.getBaggage(extracted)?.getEntry('tenant')?.value).toBe('acme')
      })
    })

    it('registers nothing when it is false', async () => {
      const service = await setUp({ registerGlobally: false })

      expect(service.getTracer().startSpan('own').isRecording()).toBe(true)
      expect(trace.getTracer('anywhere').startSpan('global').isRecording()).toBe(false)
      expect(propagation.fields()).toEqual([])
    })

    it('takes the registration back on shutdown', async () => {
      const service = await setUp({})
      expect(propagation.fields()).toContain('traceparent')

      await service.shutdown()

      expect(trace.getTracer('anywhere').startSpan('late').isRecording()).toBe(false)
      expect(propagation.fields()).toEqual([])
      const span = trace.wrapSpanContext({
        traceId: 'a'.repeat(32),
        spanId: 'b'.repeat(16),
        traceFlags: 1,
      })
      otelContext.with(trace.setSpan(ROOT_CONTEXT, span), () => {
        expect(trace.getActiveSpan()).toBeUndefined()
      })
    })
  })
})
