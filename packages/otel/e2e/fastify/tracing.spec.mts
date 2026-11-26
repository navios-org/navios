import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { builder } from '@navios/builder'
import {
  Controller,
  handler,
  inject,
  Injectable,
  Module,
  NaviosFactory,
  NotFoundException,
} from '@navios/server'
import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api'
import { BatchSpanProcessor, SimpleSpanProcessor } from '@opentelemetry/sdk-trace'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import type { NaviosApplication } from '@navios/server'
import type { ReadableSpan, SpanExporter, SpanProcessor } from '@opentelemetry/sdk-trace'

import { otelPlugin, RequestSpan, Traced } from '../../src/index.mjs'

// The plugin is adapter-neutral. These tests run it on the real Fastify
// adapter, through Fastify's own router and request objects.

const api = builder()

const getUser = api.declareEndpoint({
  method: 'GET',
  url: '/users/$id',
  responseSchema: z.object({ id: z.string(), name: z.string() }),
})

const failing = api.declareEndpoint({
  method: 'GET',
  url: '/fail/$kind',
  responseSchema: z.object({ ok: z.boolean() }),
})

const health = api.declareEndpoint({
  method: 'GET',
  url: '/health',
  responseSchema: z.object({ status: z.string() }),
})

class CollectingExporter implements SpanExporter {
  readonly spans: ReadableSpan[] = []
  shutdowns = 0

  export(spans: ReadableSpan[], done: (result: { code: number }) => void): void {
    this.spans.push(...spans)
    done({ code: 0 })
  }

  async shutdown(): Promise<void> {
    this.shutdowns++
  }
}

@Traced({ name: 'user-service' })
@Injectable()
class UserService {
  async findName(id: string) {
    await new Promise((resolve) => setTimeout(resolve, 1))
    return `user-${id}`
  }
}

@Controller()
class AppController {
  private readonly users = inject(UserService)

  getUser = handler(getUser, async ({ urlParams }, ctx) => {
    ctx.get(RequestSpan).setAttribute('user.id', String(urlParams.id))
    return { id: String(urlParams.id), name: await this.users.findName(String(urlParams.id)) }
  })

  failing = handler(failing, ({ urlParams }) => {
    if (urlParams.kind === 'missing') {
      throw new NotFoundException('Nothing here')
    }
    throw new Error('unexpected failure')
  })

  health = handler(health, () => ({ status: 'ok' }))
}

@Module({ controllers: [AppController] })
class AppModule {}

describe('otel plugin on the Fastify adapter', () => {
  let app: NaviosApplication<any> | null = null

  async function start(exporter: CollectingExporter, processor?: SpanProcessor) {
    app = await NaviosFactory.create(AppModule, {
      adapter: defineFastifyEnvironment(),
      logger: false,
      plugins: [
        otelPlugin({
          serviceName: 'otel-fastify-test',
          exporter: 'none',
          spanProcessors: [processor ?? new SimpleSpanProcessor({ exporter })],
          ignoreRoutes: ['/health'],
        }),
      ],
    })
    await app.init()
    return app
  }

  afterEach(async () => {
    await app?.close()
    app = null
  })

  it('creates a server span per request with the route name and status', async () => {
    const exporter = new CollectingExporter()
    const server = await start(exporter)

    const response = await server.inject({ method: 'GET', url: '/users/42?verbose=1' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ id: '42', name: 'user-42' })

    const request = exporter.spans.find((span) => span.kind === SpanKind.SERVER)!
    expect(request.name).toBe('HTTP GET /users/$id')
    expect(request.attributes).toMatchObject({
      'http.request.method': 'GET',
      'http.route': '/users/$id',
      'url.path': '/users/42',
      'http.response.status_code': 200,
      'user.id': '42',
    })
    expect(request.status.code).toBe(SpanStatusCode.OK)
  })

  it('parents the span of a traced service method to the request span', async () => {
    const exporter = new CollectingExporter()
    const server = await start(exporter)

    await server.inject({ method: 'GET', url: '/users/7' })

    const [child, request] = exporter.spans
    expect(child.name).toBe('user-service.findName')
    expect(request.name).toBe('HTTP GET /users/$id')
    expect(child.parentSpanContext?.spanId).toBe(request.spanContext().spanId)
    expect(child.spanContext().traceId).toBe(request.spanContext().traceId)
  })

  it('records the error for a 500 and for a thrown HttpException', async () => {
    const exporter = new CollectingExporter()
    const server = await start(exporter)

    expect((await server.inject({ method: 'GET', url: '/fail/crash' })).status).toBe(500)
    expect((await server.inject({ method: 'GET', url: '/fail/missing' })).status).toBe(404)

    const [crash, missing] = exporter.spans
    expect(crash.name).toBe('HTTP GET /fail/$kind')
    expect(crash.attributes['http.response.status_code']).toBe(500)
    expect(crash.status).toEqual({ code: SpanStatusCode.ERROR, message: 'unexpected failure' })
    expect(crash.events[0].name).toBe('exception')
    expect(missing.attributes['http.response.status_code']).toBe(404)
    expect(missing.status).toEqual({ code: SpanStatusCode.ERROR, message: 'Nothing here' })
    expect(missing.events[0].attributes?.['exception.type']).toBe('NotFoundException')
  })

  it('continues the trace of an incoming traceparent header', async () => {
    const exporter = new CollectingExporter()
    const server = await start(exporter)

    await server.inject({
      method: 'GET',
      url: '/users/1',
      headers: { traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01' },
    })

    const request = exporter.spans.find((span) => span.kind === SpanKind.SERVER)!
    expect(request.spanContext().traceId).toBe('0af7651916cd43dd8448eb211c80319c')
    expect(request.parentSpanContext?.spanId).toBe('b7ad6b7169203331')
  })

  it('does not trace ignored paths', async () => {
    const exporter = new CollectingExporter()
    const server = await start(exporter)

    expect((await server.inject({ method: 'GET', url: '/health' })).status).toBe(200)
    expect(exporter.spans).toHaveLength(0)
  })

  it('creates no span for a request that matches no route', async () => {
    const exporter = new CollectingExporter()
    const server = await start(exporter)

    expect((await server.inject({ method: 'GET', url: '/nonexistent' })).status).toBe(404)
    expect(exporter.spans).toHaveLength(0)
  })

  it('keeps concurrent requests in separate traces', async () => {
    const exporter = new CollectingExporter()
    const server = await start(exporter)

    await Promise.all(
      ['1', '2', '3'].map((id) => server.inject({ method: 'GET', url: `/users/${id}` })),
    )

    const requests = exporter.spans.filter((span) => span.kind === SpanKind.SERVER)
    const children = exporter.spans.filter((span) => span.kind === SpanKind.INTERNAL)
    expect(requests).toHaveLength(3)
    expect(new Set(requests.map((span) => span.spanContext().traceId)).size).toBe(3)
    for (const child of children) {
      const parent = requests.find(
        (span) => span.spanContext().spanId === child.parentSpanContext?.spanId,
      )
      expect(parent?.spanContext().traceId).toBe(child.spanContext().traceId)
    }
  })

  it('flushes buffered spans and shuts the SDK down on close', async () => {
    const exporter = new CollectingExporter()
    const server = await start(
      exporter,
      new BatchSpanProcessor({ exporter, scheduledDelayMillis: 60_000 }),
    )

    await server.inject({ method: 'GET', url: '/users/1' })
    expect(exporter.spans).toHaveLength(0)

    await server.close()
    app = null

    expect(exporter.spans.map((span) => span.name).sort()).toEqual([
      'HTTP GET /users/$id',
      'user-service.findName',
    ])
    expect(exporter.shutdowns).toBe(1)
    expect(trace.getActiveSpan()).toBeUndefined()
  })
})
