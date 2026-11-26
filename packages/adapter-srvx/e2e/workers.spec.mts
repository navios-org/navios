import { afterEach, describe, expect, it, vi } from 'vitest'

import type { NaviosApplication } from '@navios/server'

import type { SrvxEnvironment } from '../src/index.mjs'

import { createApp } from './app.mjs'

// What `srvx` is in a Cloudflare Worker, where the package resolves to it.
vi.mock('srvx', () => import('srvx/cloudflare'))

/** `fetch` as a Worker is called: with the bindings and the execution context. */
type WorkerFetch = (
  request: Request,
  env: Record<string, unknown>,
  context: { waitUntil(promise: Promise<unknown>): void; passThroughOnException(): void },
) => Response | Promise<Response>

describe('srvx adapter: a runtime that calls fetch itself', () => {
  let app: NaviosApplication<SrvxEnvironment> | null = null
  const waited: Promise<unknown>[] = []
  const context = {
    waitUntil: (promise: Promise<unknown>) => void waited.push(promise),
    passThroughOnException: () => {},
  }

  afterEach(async () => {
    await app?.close()
    app = null
  })

  const worker = async (options: Parameters<typeof createApp>[0] = {}) => {
    app = await createApp(options)
    await app.init()
    const fetch = app.getServer().fetch as unknown as WorkerFetch
    return (request: Request, env: Record<string, unknown> = {}) => fetch(request, env, context)
  }

  it('serves without listening', async () => {
    const fetch = await worker()
    expect(app!.getServer().runtime).toBe('cloudflare')
    const response = await fetch(new Request('https://app.example/users/7'))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.json()).toEqual({ id: '7', ip: null })
    expect((await fetch(new Request('https://app.example/nowhere'))).status).toBe(404)
  })

  it('gives a handler the bindings, and the address that Cloudflare names', async () => {
    const fetch = await worker()
    const response = await fetch(new Request('https://app.example/runtime'), { BUCKET: 'assets' })
    expect(await response.json()).toEqual({
      name: 'cloudflare',
      env: { BUCKET: 'assets' },
      hasNode: false,
      canWait: true,
      server: 'cloudflare',
    })
    const from = new Request('https://app.example/users/7', {
      headers: { 'cf-connecting-ip': '203.0.113.9' },
    })
    expect(await (await fetch(from)).json()).toEqual({ id: '7', ip: '203.0.113.9' })
  })

  it('decodes a body, and limits one', async () => {
    const fetch = await worker({ serve: { maxRequestBodySize: 16 } })
    const post = (body: BodyInit, headers: Record<string, string> = {}) =>
      fetch(
        new Request('https://app.example/echo', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...headers },
          body,
          duplex: 'half',
        } as RequestInit),
      )
    expect(await (await post('{"a":1}', { 'content-length': '7' })).json()).toEqual({
      data: { a: 1 },
    })
    expect((await post('"' + 'x'.repeat(20) + '"', { 'content-length': '22' })).status).toBe(413)
    // One without a declared length.
    const stream = (text: string) => new Blob([text]).stream()
    expect(await (await post(stream('{"a":1}'))).json()).toEqual({ data: { a: 1 } })
    expect((await post(stream('"' + 'x'.repeat(20) + '"'))).status).toBe(413)
  })

  it('streams, and answers a preflight request', async () => {
    const fetch = await worker({ cors: { origin: ['https://site.example'] } })
    const events = await fetch(new Request('https://app.example/events'))
    expect(events.headers.get('content-type')).toContain('text/event-stream')
    expect(await events.text()).toBe(':\n\ndata: one\n\ndata: two\n\n')
    const preflight = await fetch(
      new Request('https://app.example/echo', {
        method: 'OPTIONS',
        headers: { origin: 'https://site.example', 'access-control-request-method': 'POST' },
      }),
    )
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe('https://site.example')
  })
})
