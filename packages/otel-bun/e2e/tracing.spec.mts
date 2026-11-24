import { afterEach, describe, expect, it } from 'bun:test'

import { defineBunEnvironment } from '@navios/adapter-bun'
import { builder } from '@navios/builder'
import {
  Controller,
  handler,
  inject,
  Injectable,
  Module,
  NaviosFactory,
  NotFoundException,
} from '@navios/core'
import { RequestSpan, Traced } from '@navios/otel'
import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api'
import { BatchSpanProcessor, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-node'
import { z } from 'zod/v4'

import type { NaviosApplication } from '@navios/core'
import type { ReadableSpan, SpanExporter, SpanProcessor } from '@opentelemetry/sdk-trace-node'

import { defineOtelPlugin } from '../src/index.mjs'

// The plugin is adapter-neutral. These tests run it on the real Bun adapter:
// the application listens on a port and is called with fetch.

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

describe('otel plugin on the Bun adapter', () => {
  let app: NaviosApplication<any> | null = null
  let url = ''

  function get(path: string, headers?: Record<string, string>) {
    return fetch(`${url}${path}`, { headers })
  }

  async function start(exporter: CollectingExporter, processor?: SpanProcessor) {
    app = await NaviosFactory.create(AppModule, {
      adapter: defineBunEnvironment(),
      logger: false,
    })
    // The 1.x call site: a loop over what defineOtelPlugin returns.
    for (const plugin of defineOtelPlugin({
      serviceName: 'otel-bun-test',
      exporter: 'none',
      spanProcessors: [processor ?? new SimpleSpanProcessor(exporter)],
      ignoreRoutes: ['/health'],
    })) {
      app.usePlugin(plugin)
    }
    url = await app.listen({ port: 0 })
    return app
  }

  afterEach(async () => {
    await app?.close()
    app = null
  })

  it('creates a server span per request with the route name and status', async () => {
    const exporter = new CollectingExporter()
    await start(exporter)

    const response = await get('/users/42?verbose=1')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ id: '42', name: 'user-42' })

    const request = exporter.spans.find((span) => span.kind === SpanKind.SERVER)!
    expect(request.name).toBe('HTTP GET /users/$id')
    expect(request.attributes).toMatchObject({
      'http.method': 'GET',
      'http.route': '/users/$id',
      'http.url': '/users/42',
      'http.status_code': 200,
      'user.id': '42',
    })
    expect(request.status.code).toBe(SpanStatusCode.OK)
  })

  it('parents the span of a traced service method to the request span', async () => {
    const exporter = new CollectingExporter()
    await start(exporter)

    await get('/users/7')

    const [child, request] = exporter.spans
    expect(child.name).toBe('user-service.findName')
    expect(request.name).toBe('HTTP GET /users/$id')
    expect(child.parentSpanContext?.spanId).toBe(request.spanContext().spanId)
    expect(child.spanContext().traceId).toBe(request.spanContext().traceId)
  })

  it('records the error for a 500 and for a thrown HttpException', async () => {
    const exporter = new CollectingExporter()
    await start(exporter)

    expect((await get('/fail/crash')).status).toBe(500)
    expect((await get('/fail/missing')).status).toBe(404)

    const [crash, missing] = exporter.spans
    expect(crash.name).toBe('HTTP GET /fail/$kind')
    expect(crash.attributes['http.status_code']).toBe(500)
    expect(crash.status).toEqual({ code: SpanStatusCode.ERROR, message: 'unexpected failure' })
    expect(crash.events[0].name).toBe('exception')
    expect(missing.attributes['http.status_code']).toBe(404)
    expect(missing.status).toEqual({ code: SpanStatusCode.ERROR, message: 'Nothing here' })
    expect(missing.events[0].attributes?.['exception.type']).toBe('NotFoundException')
  })

  it('continues the trace of an incoming traceparent header', async () => {
    const exporter = new CollectingExporter()
    await start(exporter)

    await get('/users/1', {
      traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
    })

    const request = exporter.spans.find((span) => span.kind === SpanKind.SERVER)!
    expect(request.spanContext().traceId).toBe('0af7651916cd43dd8448eb211c80319c')
    expect(request.parentSpanContext?.spanId).toBe('b7ad6b7169203331')
  })

  it('does not trace ignored paths', async () => {
    const exporter = new CollectingExporter()
    await start(exporter)

    expect((await get('/health')).status).toBe(200)
    expect(exporter.spans).toHaveLength(0)
  })

  it('creates no span for a request that matches no route', async () => {
    const exporter = new CollectingExporter()
    await start(exporter)

    expect((await get('/nonexistent')).status).toBe(404)
    expect(exporter.spans).toHaveLength(0)
  })

  it('keeps concurrent requests in separate traces', async () => {
    const exporter = new CollectingExporter()
    await start(exporter)

    await Promise.all(['1', '2', '3'].map((id) => get(`/users/${id}`)))

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
      new BatchSpanProcessor(exporter, { scheduledDelayMillis: 60_000 }),
    )

    await get('/users/1')
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
