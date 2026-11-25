import { afterAll, beforeAll, describe, expect, it } from 'bun:test'

import { handler, NaviosFactory, registerController, registerModule } from '@navios/server'

import type { NaviosApplication } from '@navios/server'

import { DEFAULT_BODY_LIMIT } from '../src/body-limit.mjs'
import { defineBunEnvironment } from '../src/index.mjs'

import type { BunEnvironment } from '../src/index.mjs'

const anything = {
  '~standard': {
    version: 1 as const,
    vendor: 'test',
    validate: (value: unknown) => ({ value }),
  },
}

const LIMIT = 1024

// The conformance suite covers JSON, text and multipart bodies, chunked
// transfer encoding and inject(). These are the cases specific to this adapter.
describe('bun adapter: request body limit', () => {
  let app: NaviosApplication<BunEnvironment>
  let base: string
  let calls = 0

  beforeAll(async () => {
    class BodyController {
      echo = handler(
        { config: { method: 'POST', url: '/echo', requestSchema: anything } } as any,
        ({ data }: any) => ({ length: String(data).length }),
      )
      noBody = handler({ config: { method: 'POST', url: '/no-body' } } as any, () => {
        calls++
        return { ok: true }
      })
      upload = handler(
        {
          config: { method: 'POST', url: '/upload', body: 'multipart', requestSchema: anything },
        } as any,
        ({ data }: any) => ({ keys: Object.keys(data) }),
      )
      // Reads the body itself, past the pipeline.
      rawRead = handler(
        { config: { method: 'POST', url: '/raw-read' } } as any,
        async (_: any, ctx: any) => ({ length: (await ctx.raw.request.text()).length }),
      )
    }
    registerController(BodyController)
    class AppModule {}
    registerModule(AppModule, { controllers: [BodyController] })

    app = await NaviosFactory.create(AppModule, {
      adapter: defineBunEnvironment({
        cors: { origin: 'https://app.example' },
        serve: { maxRequestBodySize: LIMIT },
      }),
      logger: false,
    })
    base = await app.listen({ port: 0, hostname: '127.0.0.1' })
  })

  afterAll(async () => {
    await app.close()
  })

  const post = (path: string, size: number) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain', origin: 'https://app.example' },
      body: 'x'.repeat(size),
    })

  it('accepts a body of exactly the limit and rejects one byte more', async () => {
    const accepted = await post('/echo', LIMIT)
    expect(await accepted.json()).toEqual({ length: LIMIT })

    const rejected = await post('/echo', LIMIT + 1)
    expect(rejected.status).toBe(413)
    expect(rejected.headers.get('content-type')).toContain('application/problem+json')
    expect(await rejected.json()).toEqual({
      type: 'about:blank',
      title: 'Payload Too Large',
      status: 413,
      detail: 'Request body is too large',
    })
  })

  it('answers a body far over the limit instead of dropping the connection', async () => {
    const response = await post('/echo', 8 * 1024 * 1024)
    expect(response.status).toBe(413)
    expect(response.headers.get('content-type')).toContain('application/problem+json')
  })

  it('rejects a declared length over the limit before the handler, on any route', async () => {
    calls = 0
    expect((await post('/no-body', LIMIT + 1)).status).toBe(413)
    expect(calls).toBe(0)
    expect((await post('/does-not-exist', LIMIT + 1)).status).toBe(413)
    expect((await post('/does-not-exist', 1)).status).toBe(404)
  })

  it('sends the CORS headers with the 413 response', async () => {
    const response = await post('/echo', LIMIT + 1)
    expect(response.headers.get('access-control-allow-origin')).toBe('https://app.example')
  })

  const chunked = (path: string, size: number) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      // A stream is sent with chunked transfer encoding, without content-length.
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('x'.repeat(size)))
          controller.close()
        },
      }),
      duplex: 'half',
    } as RequestInit)

  it('limits a body without a declared length that the handler reads from ctx.raw', async () => {
    const accepted = await chunked('/raw-read', LIMIT)
    expect(await accepted.json()).toEqual({ length: LIMIT })

    const rejected = await chunked('/raw-read', 64 * LIMIT)
    expect(rejected.status).toBe(413)
    expect(rejected.headers.get('content-type')).toContain('application/problem+json')

    const declared = await post('/raw-read', LIMIT)
    expect(await declared.json()).toEqual({ length: LIMIT })
  })

  it('answers 413, not 400, for a multipart body without a declared length over the limit', async () => {
    const send = (size: number) => {
      const form = new FormData()
      form.append('file', new File(['x'.repeat(size)], 'a.txt'))
      const { body, headers } = new Request(base, { method: 'POST', body: form })
      return fetch(`${base}/upload`, {
        method: 'POST',
        headers,
        body,
        duplex: 'half',
      } as RequestInit)
    }
    expect(await (await send(16)).json()).toEqual({ keys: ['file'] })
    expect((await send(4 * LIMIT)).status).toBe(413)
  })
})

describe('bun adapter: default request body limit', () => {
  let app: NaviosApplication<BunEnvironment>
  let base: string

  beforeAll(async () => {
    class DefaultLimitController {
      echo = handler(
        { config: { method: 'POST', url: '/echo', requestSchema: anything } } as any,
        ({ data }: any) => ({ length: String(data).length }),
      )
    }
    registerController(DefaultLimitController)
    class AppModule {}
    registerModule(AppModule, { controllers: [DefaultLimitController] })
    app = await NaviosFactory.create(AppModule, { adapter: defineBunEnvironment(), logger: false })
    base = await app.listen({ port: 0, hostname: '127.0.0.1' })
  })

  afterAll(async () => {
    await app.close()
  })

  it('is the 128 MiB of Bun.serve', async () => {
    expect(DEFAULT_BODY_LIMIT).toBe(128 * 1024 * 1024)
    const response = await fetch(`${base}/echo`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'x'.repeat(2 * 1024 * 1024),
    })
    expect(await response.json()).toEqual({ length: 2 * 1024 * 1024 })
  })
})
