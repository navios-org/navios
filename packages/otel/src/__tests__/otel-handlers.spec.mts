import { createApplication, Injectable, Module } from '@navios/core'
import { fakeTransport } from '@navios/core/testing'
import { NaviosFactory } from '@navios/server'
import { defineInMemoryEnvironment } from '@navios/server/testing'
import { SpanKind, SpanStatusCode } from '@opentelemetry/api'
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-node'
import { afterEach, describe, expect, it } from 'vitest'

import type { Application, ExecutionContext, Guard } from '@navios/core'

import { getCurrentSpan, otelPlugin } from '../index.mjs'

import type { OtelPluginOptions } from '../index.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

const apps: Application[] = []

async function createApp(module: new () => unknown, otel: Partial<OtelPluginOptions> = {}) {
  const exporter = new InMemorySpanExporter()
  const app = createApplication(module, {
    logger: false,
    asyncContext: true,
    transports: [fakeTransport({ kind: 'queue', entry: 'jobs', log: [] })],
    plugins: [
      otelPlugin({
        serviceName: 'otel-test',
        exporter: 'none',
        spanProcessors: [new SimpleSpanProcessor(exporter)],
        ...otel,
      }),
    ],
  })
  apps.push(app)
  await app.init()
  return { app, jobs: app.transport(fakeTransport), spans: () => exporter.getFinishedSpans() }
}

afterEach(async () => {
  for (const app of apps.splice(0)) {
    await app.close()
  }
})

describe('otelPlugin without HTTP', () => {
  it('boots in an application that has no HTTP transport', async () => {
    class Job {}
    @Module({ jobs: [Job] } as any)
    class AppModule {}

    await expect(createApp(AppModule)).resolves.toBeDefined()
  })

  it('creates one span per handler run, named after the transport and the handler', async () => {
    class SendEmail {}
    @Module({ jobs: [SendEmail] } as any)
    class AppModule {}
    const { jobs, spans } = await createApp(AppModule)

    await jobs.run(SendEmail)

    expect(spans()).toHaveLength(1)
    const [span] = spans()
    expect(span.name).toBe('queue SendEmail.run')
    expect(span.kind).toBe(SpanKind.INTERNAL)
    expect(span.status.code).toBe(SpanStatusCode.OK)
    expect(span.attributes).toMatchObject({
      'navios.transport': 'queue',
      'navios.controller': 'SendEmail',
      'navios.handler': 'run',
      'navios.module': 'AppModule',
    })
  })

  it('makes the span the current one inside the handler chain', async () => {
    let inside: string | undefined
    @Injectable()
    class Probe implements Guard {
      canActivate(_ctx: ExecutionContext) {
        inside = getCurrentSpan()?.spanContext().spanId
        return true
      }
    }
    class SendEmail {}
    @Module({ jobs: [SendEmail], guards: [Probe] } as any)
    class AppModule {}
    const { jobs, spans } = await createApp(AppModule)

    await jobs.run(SendEmail)

    expect(inside).toBe(spans()[0].spanContext().spanId)
  })

  it('records a failure and marks the span as an error', async () => {
    @Injectable()
    class Failing implements Guard {
      canActivate(): boolean {
        throw new Error('broker unreachable')
      }
    }
    class SendEmail {}
    @Module({ jobs: [SendEmail], guards: [Failing] } as any)
    class AppModule {}
    const { jobs, spans } = await createApp(AppModule)

    await expect(jobs.run(SendEmail)).rejects.toThrow('broker unreachable')

    const [span] = spans()
    expect(span.status).toEqual({ code: SpanStatusCode.ERROR, message: 'broker unreachable' })
    expect(span.events.map((event) => event.name)).toContain('exception')
  })

  it('creates no handler spans when autoInstrument.transports is false', async () => {
    class SendEmail {}
    @Module({ jobs: [SendEmail] } as any)
    class AppModule {}
    const { jobs, spans } = await createApp(AppModule, { autoInstrument: { transports: false } })

    await jobs.run(SendEmail)

    expect(spans()).toHaveLength(0)
  })
})

describe('otelPlugin in an application with HTTP and another transport', () => {
  async function createHybrid(otel: Partial<OtelPluginOptions> = {}) {
    class SendEmail {}
    @Module({ jobs: [SendEmail] } as any)
    class AppModule {}
    const exporter = new InMemorySpanExporter()
    const app = await NaviosFactory.create(AppModule, {
      adapter: defineInMemoryEnvironment(),
      logger: false,
      transports: [fakeTransport({ kind: 'queue', entry: 'jobs', log: [] })],
      plugins: [
        otelPlugin({
          serviceName: 'otel-test',
          exporter: 'none',
          spanProcessors: [new SimpleSpanProcessor(exporter)],
          ...otel,
        }),
      ],
    })
    apps.push(app)
    await app.init()
    return { run: () => app.transport(fakeTransport).run(SendEmail), exporter }
  }

  it('leaves the other transport untraced by default', async () => {
    const { run, exporter } = await createHybrid()

    await run()

    expect(exporter.getFinishedSpans()).toHaveLength(0)
  })

  it('traces the other transport when autoInstrument.transports is true', async () => {
    const { run, exporter } = await createHybrid({ autoInstrument: { transports: true } })

    await run()

    expect(exporter.getFinishedSpans().map((span) => span.name)).toEqual(['queue SendEmail.run'])
  })
})
