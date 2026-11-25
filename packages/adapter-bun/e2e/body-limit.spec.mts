import { afterAll, beforeAll, describe, expect, it } from 'bun:test'

import { handler, NaviosFactory, registerController, registerModule } from '@navios/server'

import type { NaviosApplication } from '@navios/server'

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
})
