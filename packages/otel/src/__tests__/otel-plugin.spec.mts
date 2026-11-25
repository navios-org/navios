import { builder } from '@navios/builder'
import {
  Controller,
  handler,
  inject,
  Injectable,
  InjectableScope,
  Module,
  NaviosFactory,
  NotFoundException,
  reply,
} from '@navios/server'
import { defineInMemoryEnvironment } from '@navios/server/testing'
import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api'
import {
  BatchSpanProcessor,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import type { Guard, NaviosApplication, NaviosApplicationOptions } from '@navios/server'
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace'

import {
  MeterToken,
  OtelConfigToken,
  otelPlugin,
  OtelSetupService,
  RequestSpan,
  Traceable,
  Traced,
  TracerToken,
} from '../index.mjs'

import type { OtelPluginOptions } from '../index.mjs'

const api = builder()

const getUser = api.declareEndpoint({
  method: 'GET',
  url: '/users/$id',
  responseSchema: z.object({ id: z.string(), name: z.string() }),
})

const createUser = api.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema: z.object({ name: z.string().min(1) }),
  responses: { 201: z.object({ id: z.string(), name: z.string() }) },
})

const health = api.declareEndpoint({
  method: 'GET',
  url: '/health',
  responseSchema: z.object({ status: z.string() }),
})

const boom = api.declareEndpoint({
  method: 'GET',
  url: '/boom',
  responseSchema: z.object({ ok: z.boolean() }),
})

const feed = api.declareEndpoint({ method: 'GET', url: '/feed', response: 'stream' })

const TRACE_ID = '0af7651916cd43dd8448eb211c80319c'
const PARENT_SPAN_ID = 'b7ad6b7169203331'

const apps: NaviosApplication<any>[] = []

async function createApp(
  module: new () => unknown,
  otel: Partial<OtelPluginOptions> = {},
  options: Partial<NaviosApplicationOptions<any>> = {},
) {
  const exporter = new InMemorySpanExporter()
  const app = await NaviosFactory.create(module, {
    adapter: defineInMemoryEnvironment(),
    logger: false,
    plugins: [
      otelPlugin({
        serviceName: 'otel-test',
        exporter: 'none',
        spanProcessors: [new SimpleSpanProcessor({ exporter })],
        ...otel,
      }),
    ],
    ...options,
  })
  apps.push(app)
  await app.init()
  return { app, exporter, spans: () => exporter.getFinishedSpans() }
}

function serverSpans(spans: ReadableSpan[]) {
  return spans.filter((span) => span.kind === SpanKind.SERVER)
}

afterEach(async () => {
  for (const app of apps.splice(0)) {
    await app.close()
  }
})

describe('otelPlugin: HTTP request spans', () => {
  it('creates one server span per request, named after the route, with the status', async () => {
    @Controller()
    class UsersController {
      getUser = handler(getUser, ({ urlParams }) => ({ id: String(urlParams.id), name: 'Ada' }))
      createUser = handler(createUser, ({ data }) => reply(201, { id: '1', name: data.name }))
    }
    @Module({ controllers: [UsersController] })
    class AppModule {}

    const { app, spans } = await createApp(AppModule)

    const response = await app.inject({
      method: 'GET',
      url: '/users/42?verbose=1',
      headers: { 'user-agent': 'Test-Agent/1.0' },
    })
    expect(response.status).toBe(200)

    expect(spans()).toHaveLength(1)
    const [span] = spans()
    expect(span.name).toBe('HTTP GET /users/$id')
    expect(span.kind).toBe(SpanKind.SERVER)
    expect(span.attributes).toMatchObject({
      'http.method': 'GET',
      'http.route': '/users/$id',
      'http.url': '/users/42',
      'http.status_code': 200,
      'http.user_agent': 'Test-Agent/1.0',
    })
    expect(span.attributes['http.request_id']).toEqual(expect.any(String))
    expect(span.status.code).toBe(SpanStatusCode.OK)
    expect(span.ended).toBe(true)
    expect(span.resource.attributes['service.name']).toBe('otel-test')

    const created = await app.inject({ method: 'POST', url: '/users', body: { name: 'Grace' } })
    expect(created.status).toBe(201)
    const post = spans().find((candidate) => candidate.name === 'HTTP POST /users')
    expect(post?.attributes['http.status_code']).toBe(201)
    expect(post?.status.code).toBe(SpanStatusCode.OK)
  })

  it('gives concurrent requests separate spans in separate traces', async () => {
    @Controller()
    class UsersController {
      getUser = handler(getUser, async ({ urlParams }) => {
        await new Promise((resolve) => setTimeout(resolve, 5))
        return { id: String(urlParams.id), name: 'Ada' }
      })
    }
    @Module({ controllers: [UsersController] })
    class AppModule {}

    const { app, spans } = await createApp(AppModule)
    await Promise.all(
      ['1', '2', '3'].map((id) => app.inject({ method: 'GET', url: `/users/${id}` })),
    )

    const server = serverSpans(spans())
    expect(server).toHaveLength(3)
    expect(new Set(server.map((span) => span.spanContext().spanId)).size).toBe(3)
    expect(new Set(server.map((span) => span.spanContext().traceId)).size).toBe(3)
    expect(server.map((span) => span.attributes['http.url']).sort()).toEqual([
      '/users/1',
      '/users/2',
      '/users/3',
    ])
  })

  it('records the error on the span when a handler throws and the response is a 500', async () => {
    @Controller()
    class BoomController {
      boom = handler(boom, () => {
        throw new Error('database is down')
      })
    }
    @Module({ controllers: [BoomController] })
    class AppModule {}

    const { app, spans } = await createApp(AppModule)
    const response = await app.inject({ method: 'GET', url: '/boom' })
    expect(response.status).toBe(500)

    const [span] = spans()
    expect(span.name).toBe('HTTP GET /boom')
    expect(span.attributes['http.status_code']).toBe(500)
    expect(span.status).toEqual({ code: SpanStatusCode.ERROR, message: 'database is down' })
    expect(span.events).toHaveLength(1)
    expect(span.events[0].name).toBe('exception')
    expect(span.events[0].attributes?.['exception.message']).toBe('database is down')
    expect(span.ended).toBe(true)
  })

  it('records a thrown HttpException with its status', async () => {
    @Controller()
    class UsersController {
      getUser = handler(getUser, async () => {
        throw new NotFoundException('No such user')
      })
    }
    @Module({ controllers: [UsersController] })
    class AppModule {}

    const { app, spans } = await createApp(AppModule)
    const response = await app.inject({ method: 'GET', url: '/users/7' })
    expect(response.status).toBe(404)

    const [span] = spans()
    expect(span.attributes['http.status_code']).toBe(404)
    expect(span.status).toEqual({ code: SpanStatusCode.ERROR, message: 'No such user' })
    expect(span.events[0].name).toBe('exception')
    expect(span.events[0].attributes?.['exception.type']).toBe('NotFoundException')
  })

  it('reports a request that fails validation as 400 and a denied guard as 403', async () => {
    @Injectable()
    class DenyGuard implements Guard {
      canActivate() {
        return false
      }
    }
    @Controller()
    class UsersController {
      createUser = handler(createUser, ({ data }) => reply(201, { id: '1', name: data.name }))
      health = handler(health, { guards: [DenyGuard] }, () => ({ status: 'ok' }))
    }
    @Module({ controllers: [UsersController] })
    class AppModule {}

    const { app, spans } = await createApp(AppModule)

    const invalid = await app.inject({ method: 'POST', url: '/users', body: { name: '' } })
    expect(invalid.status).toBe(400)
    const denied = await app.inject({ method: 'GET', url: '/health' })
    expect(denied.status).toBe(403)

    const [validation, guard] = spans()
    expect(validation.attributes['http.status_code']).toBe(400)
    expect(validation.status.code).toBe(SpanStatusCode.ERROR)
    expect(guard.attributes['http.status_code']).toBe(403)
    expect(guard.status.code).toBe(SpanStatusCode.ERROR)
  })

  it('reports the status an error mapper answers with', async () => {
    class NameTaken extends Error {}

    @Controller()
    class UsersController {
      createUser = handler(createUser, () => {
        throw new NameTaken('name is taken')
      })
    }
    @Module({ controllers: [UsersController] })
    class AppModule {}

    const exporter = new InMemorySpanExporter()
    const app = await NaviosFactory.create(AppModule, {
      adapter: defineInMemoryEnvironment(),
      logger: false,
      plugins: [
        otelPlugin({
          serviceName: 'otel-test',
          exporter: 'none',
          spanProcessors: [new SimpleSpanProcessor({ exporter })],
        }),
      ],
    })
    apps.push(app)
    app.mapError(NameTaken, () => reply(409, { reason: 'taken' }))
    await app.init()

    const response = await app.inject({ method: 'POST', url: '/users', body: { name: 'Ada' } })
    expect(response.status).toBe(409)

    const [span] = exporter.getFinishedSpans()
    expect(span.attributes['http.status_code']).toBe(409)
    expect(span.attributes['http.response.status_code']).toBe(409)
    expect(span.status).toEqual({ code: SpanStatusCode.ERROR, message: 'name is taken' })
    expect(span.events[0].name).toBe('exception')
  })

  it('ends the span of a streamed response after the stream has been consumed', async () => {
    const endedWhileStreaming: boolean[] = []

    @Controller()
    class FeedController {
      feed = handler(feed, async function* (_params, ctx) {
        const span = ctx.get(RequestSpan) as unknown as ReadableSpan
        yield 'first '
        await new Promise((resolve) => setTimeout(resolve, 5))
        endedWhileStreaming.push(span.ended)
        yield 'last'
        endedWhileStreaming.push(span.ended)
      })
    }
    @Module({ controllers: [FeedController] })
    class AppModule {}

    const { app, spans } = await createApp(AppModule)
    const response = await app.inject({ method: 'GET', url: '/feed' })
    expect(response.text).toBe('first last')

    // The handler had returned its generator long before the last chunk.
    expect(endedWhileStreaming).toEqual([false, false])
    expect(spans()).toHaveLength(1)
    expect(spans()[0].name).toBe('HTTP GET /feed')
    expect(spans()[0].ended).toBe(true)
    expect(spans()[0].attributes['http.status_code']).toBe(200)
  })

  it('continues the trace of an incoming traceparent header', async () => {
    @Controller()
    class UsersController {
      getUser = handler(getUser, ({ urlParams }) => ({ id: String(urlParams.id), name: 'Ada' }))
    }
    @Module({ controllers: [UsersController] })
    class AppModule {}

    const { app, spans } = await createApp(AppModule)
    await app.inject({
      method: 'GET',
      url: '/users/1',
      headers: { traceparent: `00-${TRACE_ID}-${PARENT_SPAN_ID}-01` },
    })
    await app.inject({ method: 'GET', url: '/users/2' })

    const [continued, fresh] = spans()
    expect(continued.spanContext().traceId).toBe(TRACE_ID)
    expect(continued.parentSpanContext?.spanId).toBe(PARENT_SPAN_ID)
    expect(continued.parentSpanContext?.isRemote).toBe(true)
    expect(fresh.spanContext().traceId).not.toBe(TRACE_ID)
    expect(fresh.parentSpanContext).toBeUndefined()
  })

  it('exposes the request span on the request context and as the active span', async () => {
    const seen: Array<string | undefined> = []

    @Controller()
    class UsersController {
      getUser = handler(getUser, async ({ urlParams }, ctx) => {
        const span = ctx.get(RequestSpan)
        span.setAttribute('user.id', String(urlParams.id))
        seen.push(trace.getActiveSpan()?.spanContext().spanId)
        await new Promise((resolve) => setTimeout(resolve, 1))
        // Still active after an await: the SDK's context manager carries it.
        seen.push(trace.getActiveSpan()?.spanContext().spanId)
        return { id: String(urlParams.id), name: 'Ada' }
      })
    }
    @Module({ controllers: [UsersController] })
    class AppModule {}

    const { app, spans } = await createApp(AppModule)
    await app.inject({ method: 'GET', url: '/users/9' })

    const [span] = spans()
    expect(span.attributes['user.id']).toBe('9')
    expect(seen).toEqual([span.spanContext().spanId, span.spanContext().spanId])
    expect(trace.getActiveSpan()).toBeUndefined()
  })

  it('does not trace ignored paths', async () => {
    const found: unknown[] = []

    @Controller()
    class AppController {
      health = handler(health, (_params, ctx) => {
        found.push(ctx.find(RequestSpan))
        return { status: 'ok' }
      })
      getUser = handler(getUser, ({ urlParams }) => ({ id: String(urlParams.id), name: 'Ada' }))
    }
    @Module({ controllers: [AppController] })
    class AppModule {}

    const { app, spans } = await createApp(AppModule, { ignoreRoutes: ['/health', '/users/1*'] })

    expect((await app.inject({ method: 'GET', url: '/health' })).status).toBe(200)
    expect((await app.inject({ method: 'GET', url: '/users/12' })).status).toBe(200)
    expect(spans()).toHaveLength(0)
    expect(found).toEqual([undefined])

    await app.inject({ method: 'GET', url: '/users/2' })
    expect(spans().map((span) => span.name)).toEqual(['HTTP GET /users/$id'])
  })

  it('registers no interceptor when autoInstrument.http is false', async () => {
    @Controller()
    class AppController {
      health = handler(health, () => ({ status: 'ok' }))
    }
    @Module({ controllers: [AppController] })
    class AppModule {}

    const { app, spans } = await createApp(AppModule, { autoInstrument: { http: false } })
    expect((await app.inject({ method: 'GET', url: '/health' })).status).toBe(200)
    expect(spans()).toHaveLength(0)
    expect(app.routes()[0].interceptors).toEqual([])
  })

  it('adds navios.* attributes when includeNaviosAttributes is set', async () => {
    @Controller()
    class StatusController {
      health = handler(health, () => ({ status: 'ok' }))
    }
    @Module({ controllers: [StatusController] })
    class StatusModule {}

    const { app, spans } = await createApp(StatusModule, { includeNaviosAttributes: true })
    await app.inject({ method: 'GET', url: '/health' })

    expect(spans()[0].attributes).toMatchObject({
      'navios.controller': 'StatusController',
      'navios.handler': 'health',
      'navios.module': 'StatusModule',
    })
  })
})

describe('otelPlugin: @Traced services', () => {
  it('starts a child span for a traced service method, with the request span as parent', async () => {
    @Traced({ name: 'user-service', attributes: { layer: 'service' } })
    @Injectable()
    class UserService {
      #names = new Map([['1', 'Ada']])

      async findName(id: string) {
        await new Promise((resolve) => setTimeout(resolve, 1))
        return this.#names.get(id) ?? 'unknown'
      }
    }

    @Controller()
    class UsersController {
      private readonly users = inject(UserService)
      getUser = handler(getUser, async ({ urlParams }) => ({
        id: String(urlParams.id),
        name: await this.users.findName(String(urlParams.id)),
      }))
    }
    @Module({ controllers: [UsersController] })
    class AppModule {}

    const { app, spans } = await createApp(AppModule)
    const response = await app.inject({ method: 'GET', url: '/users/1' })
    expect(response.body).toEqual({ id: '1', name: 'Ada' })

    const [child, request] = spans()
    expect(request.name).toBe('HTTP GET /users/$id')
    expect(child.name).toBe('user-service.findName')
    expect(child.kind).toBe(SpanKind.INTERNAL)
    expect(child.parentSpanContext?.spanId).toBe(request.spanContext().spanId)
    expect(child.spanContext().traceId).toBe(request.spanContext().traceId)
    expect(child.attributes).toMatchObject({
      layer: 'service',
      'code.function': 'findName',
      'code.namespace': 'user-service',
    })
    expect(child.status.code).toBe(SpanStatusCode.OK)

    // The container hands out the instance itself, not a stand-in.
    expect(await app.container.get(UserService)).toBeInstanceOf(UserService)
  })

  it('nests the spans of traced methods that call each other', async () => {
    @Traced()
    @Injectable()
    class Repository {
      load() {
        return 'Ada'
      }
    }

    @Traced({ name: 'users' })
    @Injectable()
    class UserService {
      private readonly repository = inject(Repository)

      async findName() {
        return this.format(this.repository.load())
      }

      format(name: string) {
        return name.toUpperCase()
      }
    }

    @Controller()
    class UsersController {
      private readonly users = inject(UserService)
      getUser = handler(getUser, async () => ({ id: '1', name: await this.users.findName() }))
    }
    @Module({ controllers: [UsersController] })
    class AppModule {}

    const { app, spans } = await createApp(AppModule)
    expect((await app.inject({ method: 'GET', url: '/users/1' })).body).toEqual({
      id: '1',
      name: 'ADA',
    })

    const byName = new Map(spans().map((span) => [span.name, span]))
    expect([...byName.keys()].sort()).toEqual([
      'HTTP GET /users/$id',
      'Repository.load',
      'users.findName',
      'users.format',
    ])
    const findName = byName.get('users.findName')!
    expect(findName.parentSpanContext?.spanId).toBe(
      byName.get('HTTP GET /users/$id')!.spanContext().spanId,
    )
    expect(byName.get('Repository.load')!.parentSpanContext?.spanId).toBe(
      findName.spanContext().spanId,
    )
    expect(byName.get('users.format')!.parentSpanContext?.spanId).toBe(
      findName.spanContext().spanId,
    )
  })

  it('traces only the marked methods of a @Traceable class', async () => {
    @Traceable({ name: 'orders' })
    @Injectable()
    class OrderService {
      @Traced({ name: 'process-order', attributes: { critical: true } })
      process() {
        return this.lookup()
      }

      @Traced()
      validate() {
        return true
      }

      lookup() {
        return 'order'
      }
    }
    @Module({})
    class AppModule {}

    const { app, spans } = await createApp(AppModule)
    const orders = await app.container.get(OrderService)
    expect(orders.process()).toBe('order')
    expect(orders.validate()).toBe(true)

    expect(spans().map((span) => span.name)).toEqual(['process-order', 'orders.validate'])
    expect(spans()[0].attributes).toMatchObject({ critical: true, 'code.function': 'process' })
    expect(spans()[0].parentSpanContext).toBeUndefined()
  })

  it('records an error thrown by a traced method, sync or async, and rethrows it', async () => {
    @Traced()
    @Injectable()
    class Flaky {
      sync(): never {
        throw new Error('sync failure')
      }
      async later(): Promise<never> {
        throw new Error('async failure')
      }
    }
    @Module({})
    class AppModule {}

    const { app, spans } = await createApp(AppModule)
    const flaky = await app.container.get(Flaky)

    expect(() => flaky.sync()).toThrow('sync failure')
    await expect(flaky.later()).rejects.toThrow('async failure')

    expect(spans().map((span) => [span.name, span.status])).toEqual([
      ['Flaky.sync', { code: SpanStatusCode.ERROR, message: 'sync failure' }],
      ['Flaky.later', { code: SpanStatusCode.ERROR, message: 'async failure' }],
    ])
    expect(spans().every((span) => span.events[0]?.name === 'exception')).toBe(true)
  })

  it('traces every instance of a transient service and leaves lifecycle hooks alone', async () => {
    const initialised: string[] = []

    @Traced()
    @Injectable({ scope: InjectableScope.Transient })
    class Job {
      onServiceInit() {
        initialised.push('init')
      }
      run() {
        return 'done'
      }
    }
    @Module({})
    class AppModule {}

    const { app, spans } = await createApp(AppModule)
    const first = await app.container.get(Job)
    const second = await app.container.get(Job)
    expect(first).not.toBe(second)
    first.run()
    second.run()

    expect(initialised).toEqual(['init', 'init'])
    expect(spans().map((span) => span.name)).toEqual(['Job.run', 'Job.run'])
  })

  it('does not trace a service that is not marked', async () => {
    @Injectable()
    class Plain {
      run() {
        return 'done'
      }
    }
    @Module({})
    class AppModule {}

    const { app, spans } = await createApp(AppModule)
    expect((await app.container.get(Plain)).run()).toBe('done')
    expect(spans()).toHaveLength(0)
  })
})

describe('otelPlugin: context propagation', () => {
  function tracedApp() {
    @Traced()
    @Injectable()
    class UserService {
      async findName() {
        await new Promise((resolve) => setTimeout(resolve, 1))
        return 'Ada'
      }
    }
    @Controller()
    class UsersController {
      private readonly users = inject(UserService)
      getUser = handler(getUser, async () => {
        await new Promise((resolve) => setTimeout(resolve, 1))
        return { id: '1', name: await this.users.findName() }
      })
    }
    @Module({ controllers: [UsersController] })
    class AppModule {}
    return AppModule
  }

  it('without a context manager, parents child spans through core asyncContext', async () => {
    const { app, spans } = await createApp(
      tracedApp(),
      { registerGlobally: false },
      { asyncContext: true },
    )
    await app.inject({ method: 'GET', url: '/users/1' })

    const [child, request] = spans()
    expect(child.name).toBe('UserService.findName')
    expect(child.parentSpanContext?.spanId).toBe(request.spanContext().spanId)
  })

  it('without a context manager and without asyncContext, a child span has no parent', async () => {
    const { app, spans } = await createApp(tracedApp(), { registerGlobally: false })
    await app.inject({ method: 'GET', url: '/users/1' })

    const [child, request] = spans()
    expect(request.name).toBe('HTTP GET /users/$id')
    expect(child.parentSpanContext).toBeUndefined()
    expect(child.spanContext().traceId).not.toBe(request.spanContext().traceId)
  })
})

describe('otelPlugin: providers and shutdown', () => {
  it('provides the tracer, the meter, the resolved config and the setup service', async () => {
    @Injectable()
    class Reporter {
      readonly tracer = inject(TracerToken)
      readonly meter = inject(MeterToken)
      readonly config = inject(OtelConfigToken)
      readonly setup = inject(OtelSetupService)
    }
    @Module({})
    class AppModule {}

    const { app, spans } = await createApp(AppModule, { serviceVersion: '1.2.3' })
    const reporter = await app.container.get(Reporter)

    reporter.tracer.startSpan('manual').end()
    expect(spans().map((span) => span.name)).toEqual(['manual'])
    expect(spans()[0].instrumentationScope).toMatchObject({ name: 'otel-test', version: '1.2.3' })
    expect(typeof reporter.meter.createCounter).toBe('function')
    expect(reporter.config).toMatchObject({
      serviceName: 'otel-test',
      autoInstrument: { http: true },
      metrics: { enabled: false },
      sampling: { ratio: 1 },
      includeNaviosAttributes: false,
      ignoreRoutes: [],
      registerGlobally: true,
    })
    expect(reporter.setup.getTracer()).toBe(reporter.tracer)
  })

  it('samples nothing when the sampling ratio is 0', async () => {
    @Controller()
    class AppController {
      health = handler(health, () => ({ status: 'ok' }))
    }
    @Module({ controllers: [AppController] })
    class AppModule {}

    const { app, spans } = await createApp(AppModule, { sampling: { ratio: 0 } })
    expect((await app.inject({ method: 'GET', url: '/health' })).status).toBe(200)
    expect(spans()).toHaveLength(0)
  })

  it('flushes buffered spans and shuts the SDK down when the application closes', async () => {
    const exported: string[] = []
    let shutdowns = 0
    const exporter: SpanExporter = {
      export(spans, done) {
        exported.push(...spans.map((span) => span.name))
        done({ code: 0 })
      },
      async shutdown() {
        shutdowns++
      },
    }

    @Controller()
    class AppController {
      health = handler(health, () => ({ status: 'ok' }))
    }
    @Module({ controllers: [AppController] })
    class AppModule {}

    const { app } = await createApp(AppModule, {
      // Batched with a long delay: nothing is exported until a flush.
      spanProcessors: [new BatchSpanProcessor({ exporter, scheduledDelayMillis: 60_000 })],
    })
    await app.inject({ method: 'GET', url: '/health' })
    expect(exported).toEqual([])

    const setup = await app.container.get(OtelSetupService)
    await app.close()
    apps.length = 0

    expect(exported).toEqual(['HTTP GET /health'])
    expect(shutdowns).toBe(1)
    // The global registration is taken back, so a later application can
    // register its own provider.
    expect(trace.getActiveSpan()).toBeUndefined()
    expect(() => setup.getConfig()).toThrow('not initialized')
  })

  it('forceFlush exports buffered spans without shutting down', async () => {
    const exported: string[] = []
    const exporter: SpanExporter = {
      export(spans, done) {
        exported.push(...spans.map((span) => span.name))
        done({ code: 0 })
      },
      async shutdown() {},
    }
    @Module({})
    class AppModule {}

    const { app } = await createApp(AppModule, {
      spanProcessors: [new BatchSpanProcessor({ exporter, scheduledDelayMillis: 60_000 })],
    })
    const setup = await app.container.get(OtelSetupService)
    setup.getTracer().startSpan('job').end()
    expect(exported).toEqual([])

    await setup.forceFlush()
    expect(exported).toEqual(['job'])
  })

  it('is set up once when registered twice', async () => {
    @Controller()
    class AppController {
      health = handler(health, () => ({ status: 'ok' }))
    }
    @Module({ controllers: [AppController] })
    class AppModule {}

    const exporter = new InMemorySpanExporter()
    const options: OtelPluginOptions = {
      serviceName: 'otel-test',
      exporter: 'none',
      spanProcessors: [new SimpleSpanProcessor({ exporter })],
    }
    const app = await NaviosFactory.create(AppModule, {
      adapter: defineInMemoryEnvironment(),
      logger: false,
      plugins: [otelPlugin(options)],
    })
    apps.push(app)
    app.usePlugin(otelPlugin(options))
    await app.init()

    await app.inject({ method: 'GET', url: '/health' })
    expect(exporter.getFinishedSpans()).toHaveLength(1)
  })
})
