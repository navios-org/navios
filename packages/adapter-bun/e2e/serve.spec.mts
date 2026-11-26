import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  handler,
  NaviosFactory,
  registerController,
  registerModule,
  sseStream,
} from '@navios/server'

import type { NaviosApplication, RequestContext } from '@navios/server'
import type { ServerWebSocket } from 'bun'

import { defineBunEnvironment } from '../src/index.mjs'

import type { BunAdapterOptions, BunEnvironment } from '../src/index.mjs'

const logger = { log: mock(), error: mock(), warn: mock(), debug: mock() }
const none = {
  '~standard': {
    version: 1 as const,
    vendor: 'test',
    validate: () => ({ issues: [{ message: 'no value is valid' }] }),
  },
}

interface SocketData {
  user: string
}

describe('bun adapter: the options of Bun.serve', () => {
  let app: NaviosApplication<BunEnvironment<SocketData>> | null = null
  const events: unknown[] = []

  afterEach(async () => {
    await app?.close()
    app = null
    events.length = 0
    logger.error.mockClear()
  })

  const raw = (ctx: RequestContext) => ctx.raw as BunEnvironment<SocketData>['raw']

  const create = async (options: BunAdapterOptions<SocketData> = {}) => {
    class ServeController {
      simple = handler({ config: { method: 'GET', url: '/simple' } } as any, () => ({ ok: true }))
      missing = handler(
        { config: { method: 'GET', url: '/missing', response: 'blob' } } as any,
        () => Bun.file('/a/file/that/is/not/there'),
      )
      socket = handler(
        { config: { method: 'GET', url: '/socket', responseSchema: none } } as any,
        (_params: unknown, ctx: RequestContext) => {
          ctx.onFinish(() => {
            events.push(['finish', ctx.responseStatus])
          })
          const { request, server } = raw(ctx)
          if (!server!.upgrade(request, { data: { user: 'ann' } })) {
            events.push('not upgraded')
          }
        },
      )
      failing = handler(
        { config: { method: 'GET', url: '/failing-socket', response: 'void' } } as any,
        (_params: unknown, ctx: RequestContext) => {
          const { request, server } = raw(ctx)
          server!.upgrade(request, { data: { user: 'bob' } })
          throw new Error('failed after the upgrade')
        },
      )
      events = handler(
        { config: { method: 'GET', url: '/events', response: 'stream' } } as any,
        () =>
          sseStream(
            (async function* () {
              yield { data: 'one' }
            })(),
          ),
      )
      byHand = handler(
        { config: { method: 'GET', url: '/by-hand', response: 'stream' } } as any,
        async function* (_params: unknown, ctx: RequestContext) {
          ctx.reply.header('content-type', 'text/event-stream')
          yield 'data: one\n\n'
        } as any,
      )
      stream = handler(
        { config: { method: 'GET', url: '/stream', response: 'stream' } } as any,
        async function* () {
          yield 'one'
        } as any,
      )
    }
    registerController(ServeController)
    class AppModule {}
    registerModule(AppModule, { controllers: [ServeController] })
    app = await NaviosFactory.create(AppModule, {
      adapter: defineBunEnvironment<SocketData>(options),
      logger,
      shutdownTimeout: 3000,
    })
    return app
  }
  const local = { port: 0, hostname: '127.0.0.1' }

  const websocket = {
    data: {} as SocketData,
    open(socket: ServerWebSocket<SocketData>) {
      socket.send(`hello ${socket.data.user}`)
    },
    message(socket: ServerWebSocket<SocketData>, message: string | Buffer) {
      socket.send(`echo ${message}`)
    },
  }
  const firstMessage = (url: string) =>
    new Promise<{ socket: WebSocket; data: unknown }>((resolve, reject) => {
      const socket = new WebSocket(url.replace('http', 'ws'))
      socket.onmessage = ({ data }) => resolve({ socket, data })
      socket.onerror = () => reject(new Error('the socket failed'))
    })

  it('listens on a unix socket', async () => {
    const unix = join(tmpdir(), `navios-${process.pid}.sock`)
    const created = await create({ serve: { unix } })
    expect(await created.listen({})).toBe(`unix://${unix}`)
    const response = await fetch('http://localhost/simple', { unix })
    expect(await response.json()).toEqual({ ok: true })
    await created.close()
    expect(existsSync(unix)).toBe(false)
  })

  it('answers an error that Bun raises while it sends a response', async () => {
    const created = await create()
    const response = await fetch(`${await created.listen(local)}/missing`)
    expect(response.status).toBe(500)
    expect(response.headers.get('content-type')).toContain('application/problem+json')
    expect(((await response.json()) as any).title).toBe('Internal Server Error')
    expect(logger.error).toHaveBeenCalledTimes(1)
  })

  it('leaves such an error to the error option, if there is one', async () => {
    const created = await create({ serve: { error: () => new Response('own', { status: 503 }) } })
    const response = await fetch(`${await created.listen(local)}/missing`)
    expect(response.status).toBe(503)
    expect(await response.text()).toBe('own')
  })

  it('lets a handler upgrade its request to a WebSocket, whatever the endpoint declares', async () => {
    const created = await create({ cors: { origin: true }, serve: { websocket } })
    const base = await created.listen(local)
    const { socket, data } = await firstMessage(`${base}/socket`)
    expect(data).toBe('hello ann')
    const echo = new Promise((resolve) => {
      socket.onmessage = (message) => resolve(message.data)
    })
    socket.send('hi')
    expect(await echo).toBe('echo hi')
    expect(events).toEqual([['finish', 101]])
    expect(logger.error).not.toHaveBeenCalled()

    // A request that cannot be upgraded is answered like any other.
    expect((await fetch(`${base}/socket`)).status).toBe(500)
    expect(events[1]).toBe('not upgraded')
    expect(logger.error).toHaveBeenCalledTimes(1)

    // A socket has no end, so closing does not wait for one.
    const from = Date.now()
    await created.close()
    expect(Date.now() - from).toBeLessThan(1000)
  })

  it('logs the error of a handler that fails after the upgrade', async () => {
    const created = await create({ serve: { websocket } })
    const { data } = await firstMessage(`${await created.listen(local)}/failing-socket`)
    expect(data).toBe('hello bob')
    expect(logger.error.mock.calls.map(([message]) => message)).toEqual([
      'Unhandled error in GET /failing-socket',
    ])
  })

  it('keeps an event stream open while it is quiet, and no other response', async () => {
    const created = await create({ serve: { idleTimeout: 30 } })
    const base = await created.listen(local)
    const timeout = spyOn(created.getServer(), 'timeout')
    const seconds = () => timeout.mock.calls.map(([, value]) => value)
    expect(await (await fetch(`${base}/events`)).text()).toContain('data: one')
    // The connection is an ordinary one again when the stream has ended.
    expect(seconds()).toEqual([0, 30])
    await (await fetch(`${base}/stream`)).text()
    await (await fetch(`${base}/simple`)).text()
    expect(seconds()).toEqual([0, 30])
    await (await fetch(`${base}/by-hand`)).text()
    expect(seconds()).toEqual([0, 30, 0, 30])
    expect((await created.inject({ method: 'GET', url: '/events' })).text).toContain('data: one')
    expect(seconds()).toEqual([0, 30, 0, 30])
  })

  it('opens an event stream with a comment, which a test request does not get', async () => {
    const created = await create()
    const base = await created.listen(local)
    const response = await fetch(`${base}/events`)
    expect(await response.text()).toBe(':\n\ndata: one\n\n')
    // Also one that a generator says itself is an event stream.
    const other = await fetch(`${base}/by-hand`)
    expect(await other.text()).toBe(':\n\ndata: one\n\n')
    for (const path of ['/events', '/by-hand']) {
      const injected = await created.inject({ method: 'GET', url: path })
      expect(injected.text).toBe('data: one\n\n')
    }
    const head = await fetch(`${base}/events`, { method: 'HEAD' })
    expect(head.headers.get('content-type')).toBe('text/event-stream')
    expect(await head.text()).toBe('')
  })

  it('does not start with a method that its router does not know', async () => {
    class SearchController {
      search = handler({ config: { method: 'QUERY', url: '/search' } } as any, () => ({}))
    }
    registerController(SearchController)
    class AppModule {}
    registerModule(AppModule, { controllers: [SearchController] })
    const other = await NaviosFactory.create(AppModule, {
      adapter: defineBunEnvironment(),
      logger: false,
    })
    await expect(other.init()).rejects.toThrow('[Navios] QUERY /search cannot be served')
    await other.close()
  })
})
