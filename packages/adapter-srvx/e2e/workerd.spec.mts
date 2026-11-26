import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'
import { Miniflare } from 'miniflare'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// The adapter in workerd, the runtime of Cloudflare Workers: a Worker is
// bundled as a deployment bundles it, with `srvx` resolved for `workerd`.
describe('srvx adapter: in workerd', () => {
  let worker: Miniflare

  beforeAll(async () => {
    const { outputFiles } = await build({
      entryPoints: [fileURLToPath(new URL('./workerd/worker.mts', import.meta.url))],
      bundle: true,
      write: false,
      format: 'esm',
      target: 'es2022',
      platform: 'neutral',
      mainFields: ['module', 'main'],
      conditions: ['workerd', 'worker', 'import'],
      external: ['node:*'],
      logLevel: 'silent',
    })
    worker = new Miniflare({
      modules: true,
      script: outputFiles[0].text,
      compatibilityDate: '2026-01-01',
      // `@navios/server` imports modules of Node.
      compatibilityFlags: ['nodejs_compat'],
      bindings: { GREETING: 'hello' },
    })
    await worker.ready
  }, 60_000)

  afterAll(async () => {
    await worker?.dispose()
  })

  const send = (path: string, init?: Parameters<Miniflare['dispatchFetch']>[1]) =>
    worker.dispatchFetch(`https://app.example${path}`, init)

  it('serves a route, and answers a path without one', async () => {
    const response = await send('/users/7')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.json()).toMatchObject({ id: '7' })
    const missing = await send('/nowhere')
    expect(missing.status).toBe(404)
    expect(missing.headers.get('content-type')).toContain('application/problem+json')
  })

  it('gives a handler the bindings of the Worker', async () => {
    expect(await (await send('/runtime')).json()).toEqual({
      name: 'cloudflare',
      env: { GREETING: 'hello' },
      hasNode: false,
      canWait: true,
      server: 'cloudflare',
    })
  })

  it('decodes a body, and answers one over the limit with a problem response', async () => {
    const post = (body: string) =>
      send('/echo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      })
    expect(await (await post('{"a":1}')).json()).toEqual({ data: { a: 1 } })
    const rejected = await post(JSON.stringify('x'.repeat(2048)))
    expect(rejected.status).toBe(413)
    expect(await rejected.json()).toMatchObject({ status: 413, title: 'Payload Too Large' })
  })

  it('counts a body without a declared length while it is read', async () => {
    const post = (size: number) =>
      send('/length', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: new Blob(['x'.repeat(size)]).stream(),
        duplex: 'half',
      })
    expect(await (await post(1024)).json()).toEqual({ length: 1024 })
    expect((await post(1025)).status).toBe(413)
  })

  it('streams events, and answers a preflight request', async () => {
    const events = await send('/events')
    expect(events.headers.get('content-type')).toContain('text/event-stream')
    expect(await events.text()).toBe(':\n\ndata: one\n\ndata: two\n\n')
    const preflight = await send('/echo', {
      method: 'OPTIONS',
      headers: { origin: 'https://site.example', 'access-control-request-method': 'POST' },
    })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe('https://site.example')
  })
})
