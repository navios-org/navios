import http from 'node:http'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { NaviosApplication } from '@navios/server'

import type { SrvxEnvironment } from '../src/index.mjs'

import { createApp } from './app.mjs'

const local = { port: 0, hostname: '127.0.0.1' }

// The conformance suite covers what every adapter does. These are the cases
// specific to this one.
describe('srvx adapter: the server', () => {
  let app: NaviosApplication<SrvxEnvironment> | null = null

  afterEach(async () => {
    await app?.close()
    app = null
  })

  it('listens with the server of the runtime, and gives it to a handler', async () => {
    app = await createApp()
    const base = await app.listen(local)
    expect(base).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    const server = app.getServer()
    expect(server.runtime).toBe('node')
    expect(server.node?.server).toBeInstanceOf(http.Server)
    expect(await (await fetch(`${base}/runtime`)).json()).toEqual({
      name: 'node',
      env: null,
      hasNode: true,
      canWait: true,
      server: 'node',
    })
  })

  it('does not point to the adapter of Bun on another runtime', async () => {
    const warn = vi.fn()
    app = await createApp({}, { log: vi.fn(), error: vi.fn(), warn, debug: vi.fn() } as never)
    await app.listen(local)
    expect(warn).not.toHaveBeenCalled()
  })

  it('has a server that does not listen before listen(), and replaces it', async () => {
    app = await createApp()
    await app.init()
    const before = app.getServer()
    expect(app.getServer()).toBe(before)
    expect(before.url).toBeUndefined()
    const response = await before.fetch(new Request('http://app.example/users/7'))
    expect(await response.text()).toBe('{"id":"7"}')

    const base = await app.listen(local)
    expect(app.getServer()).not.toBe(before)
    expect(`${base}/`).toBe(app.getServer().url)
    expect(before.node?.server?.listening).toBe(false)
  })

  it('takes the options of serve()', async () => {
    const seen: string[] = []
    app = await createApp({
      serve: {
        middleware: [
          (request, next) => {
            seen.push(new URL(request.url).pathname)
            return next()
          },
        ],
      },
    })
    const base = await app.listen(local)
    expect((await fetch(`${base}/simple`)).status).toBe(200)
    expect(seen).toEqual(['/simple'])
  })

  it('sends a body that is in memory with its length, and a stream in chunks', async () => {
    app = await createApp()
    const base = await app.listen(local)
    const simple = await fetch(`${base}/simple`)
    expect(simple.headers.get('content-length')).toBe('11')
    const head = await fetch(`${base}/simple`, { method: 'HEAD' })
    expect(head.headers.get('content-length')).toBe('11')
    expect(await head.text()).toBe('')
    const events = await fetch(`${base}/events`)
    expect(events.headers.get('content-length')).toBeNull()
    expect(await events.text()).toBe(':\n\ndata: one\n\ndata: two\n\n')
  })

  it('closes when it has only handled requests of fetch and inject()', async () => {
    app = await createApp()
    await app.init()
    expect((await app.getServer().fetch(new Request('http://app.example/simple'))).status).toBe(200)
    expect((await app.inject({ method: 'GET', url: '/simple' })).status).toBe(200)
    const from = Date.now()
    await app.close()
    app = null
    expect(Date.now() - from).toBeLessThan(1000)
  })
})

describe('srvx adapter: request body limit', () => {
  let app: NaviosApplication<SrvxEnvironment> | null = null
  const LIMIT = 1024

  afterEach(async () => {
    await app?.close()
    app = null
  })

  const post = (base: string, path: string, size: number) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'x'.repeat(size),
    })

  const chunked = (base: string, path: string, size: number) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('x'.repeat(size)))
          controller.close()
        },
      }),
      duplex: 'half',
    } as RequestInit)

  it('has no limit unless one is set, as srvx', async () => {
    app = await createApp()
    const base = await app.listen(local)
    const size = 4 * 1024 * 1024
    expect(await (await post(base, '/length', size)).json()).toEqual({ length: size })
    expect(await (await chunked(base, '/length', size)).json()).toEqual({ length: size })
  })

  it('accepts a body of exactly the limit and rejects one byte more', async () => {
    app = await createApp({ serve: { maxRequestBodySize: LIMIT } })
    const base = await app.listen(local)
    expect(await (await post(base, '/length', LIMIT)).json()).toEqual({ length: LIMIT })
    const rejected = await post(base, '/length', LIMIT + 1)
    expect(rejected.status).toBe(413)
    expect(await rejected.json()).toEqual({
      type: 'about:blank',
      title: 'Payload Too Large',
      status: 413,
      detail: 'Request body is too large',
    })
  })

  it('rejects a declared length over the limit on a route that reads no body', async () => {
    app = await createApp({ serve: { maxRequestBodySize: LIMIT } })
    const base = await app.listen(local)
    expect((await post(base, '/no-body', LIMIT + 1)).status).toBe(413)
    expect((await post(base, '/nowhere', LIMIT + 1)).status).toBe(413)
  })

  it('counts a body without a declared length while it is read, whoever reads it', async () => {
    app = await createApp({ serve: { maxRequestBodySize: LIMIT } })
    const base = await app.listen(local)
    expect(await (await chunked(base, '/length', LIMIT)).json()).toEqual({ length: LIMIT })
    expect((await chunked(base, '/length', LIMIT + 1)).status).toBe(413)
    expect(await (await chunked(base, '/raw-read', LIMIT)).json()).toEqual({ length: LIMIT })
    expect((await chunked(base, '/raw-read', LIMIT + 1)).status).toBe(413)
    // Not read, so not counted.
    expect((await chunked(base, '/no-body', LIMIT + 1)).status).toBe(200)
  })

  it('answers a GET request that is sent with chunked transfer encoding', async () => {
    app = await createApp({ serve: { maxRequestBodySize: LIMIT } })
    const { port } = new URL(await app.listen(local))
    const get = (path: string, body: string) =>
      new Promise<{ status: number | undefined; text: string }>((resolve, reject) => {
        const request = http.request(
          {
            port,
            host: '127.0.0.1',
            path,
            method: 'GET',
            headers: { 'transfer-encoding': 'chunked' },
          },
          (response) => {
            let text = ''
            response.on('data', (chunk) => (text += chunk))
            response.on('end', () => resolve({ status: response.statusCode, text }))
          },
        )
        request.on('error', reject)
        request.end(body)
      })
    expect(await get('/simple', '')).toEqual({ status: 200, text: '{"ok":true}' })
    // A body of a GET request is not read, so it is not counted either.
    expect(await get('/simple', 'x'.repeat(LIMIT + 1))).toEqual({
      status: 200,
      text: '{"ok":true}',
    })
    expect((await get('/nowhere', 'x')).status).toBe(404)
  })

  it('answers a request without a body that has neither a length nor an encoding', async () => {
    app = await createApp({ serve: { maxRequestBodySize: LIMIT } })
    const base = await app.listen(local)
    const response = await fetch(`${base}/no-body`, { method: 'POST' })
    expect(await response.json()).toEqual({ ok: true })
  })
})
