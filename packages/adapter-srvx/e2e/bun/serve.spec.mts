import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test'

import type { NaviosApplication } from '@navios/server'

import { createApp } from '../app.mjs'

import type { SrvxEnvironment } from '../../src/index.mjs'

const local = { port: 0, hostname: '127.0.0.1' }

describe('srvx adapter on bun', () => {
  let app: NaviosApplication<SrvxEnvironment> | null = null

  afterEach(async () => {
    await app?.close()
    app = null
  })

  it('listens with Bun.serve, and gives its server to a handler', async () => {
    app = await createApp()
    const base = await app.listen(local)
    expect(app.getServer().runtime).toBe('bun')
    expect(app.getServer().bun?.server?.port).toBe(Number(new URL(base).port))
    expect(await (await fetch(`${base}/runtime`)).json()).toEqual({
      name: 'bun',
      env: null,
      hasNode: false,
      canWait: true,
      server: 'bun',
    })
    expect(await (await fetch(`${base}/users/7`)).json()).toEqual({ id: '7', ip: '127.0.0.1' })
  })

  it('says that the adapter of Bun is the faster one, when it listens', async () => {
    const logger = { log: mock(), error: mock(), warn: mock(), debug: mock(), verbose: mock() }
    app = await createApp({}, logger as never)
    await app.init()
    expect(logger.warn).not.toHaveBeenCalled()
    await app.listen(local)
    expect(logger.warn.mock.calls.map(([message]) => message)).toEqual([
      expect.stringContaining('@navios/adapter-bun'),
    ])
  })

  it('answers a body over the limit itself, with a problem response', async () => {
    app = await createApp({ serve: { maxRequestBodySize: 1024 } })
    const base = await app.listen(local)
    const response = await fetch(`${base}/length`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'x'.repeat(1025),
    })
    expect(response.status).toBe(413)
    expect(response.headers.get('content-type')).toContain('application/problem+json')
  })

  it('keeps an event stream open while it is quiet, and no other response', async () => {
    app = await createApp({ serve: { bun: { idleTimeout: 30 } } })
    const base = await app.listen(local)
    const timeout = spyOn(app.getServer().bun!.server!, 'timeout')
    const seconds = () => timeout.mock.calls.map(([, value]) => value)
    expect(await (await fetch(`${base}/events`)).text()).toContain('data: one')
    // The connection is an ordinary one again when the stream has ended.
    expect(seconds()).toEqual([0, 30])
    await (await fetch(`${base}/simple`)).text()
    expect(seconds()).toEqual([0, 30])
    expect((await app.inject({ method: 'GET', url: '/events' })).text).toContain('data: one')
    expect(seconds()).toEqual([0, 30])
  })
})
