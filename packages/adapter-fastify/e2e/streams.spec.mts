import { createReadStream } from 'node:fs'
import { request as httpRequest } from 'node:http'
import type { IncomingMessage } from 'node:http'
import { fileURLToPath } from 'node:url'

import { Controller, handler, Module, NaviosFactory, sseStream } from '@navios/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { NaviosApplication, RequestContext } from '@navios/server'

import { defineFastifyEnvironment } from '../src/index.mjs'

import type { FastifyEnvironment } from '../src/index.mjs'

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('fastify adapter: streams', () => {
  let app: NaviosApplication<FastifyEnvironment>
  let address: string
  const logger = { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
  let opened = 0
  let closed = 0

  const file = (path: string) => {
    const stream = createReadStream(path)
    stream.on('open', () => opened++)
    stream.on('close', () => closed++)
    return stream
  }
  const self = fileURLToPath(import.meta.url)

  beforeAll(async () => {
    @Controller()
    class StreamController {
      file = handler(
        { config: { method: 'GET', url: '/file', response: 'stream' } } as never,
        () => file(self) as never,
      )
      lateFile = handler(
        { config: { method: 'GET', url: '/late-file', response: 'stream' } } as never,
        async () => {
          const stream = file(self)
          await pause(60)
          return stream as never
        },
      )
      missing = handler(
        { config: { method: 'GET', url: '/missing', response: 'stream' } } as never,
        async (_params: unknown, ctx: RequestContext) => {
          const stream = file('/does/not/exist')
          if (ctx.query.late) {
            stream.on('error', () => {})
            await pause(20)
          }
          return stream as never
        },
      )
      idle = handler(
        { config: { method: 'GET', url: '/idle', response: 'stream' } } as never,
        () =>
          sseStream(
            (async function* () {
              await pause(300)
              yield { data: 'x' }
            })(),
          ) as never,
      )
      lines = handler(
        { config: { method: 'GET', url: '/lines', response: 'stream' } } as never,
        async function* () {
          for (let i = 0; i < 5000; i++) {
            yield `line ${i}\n`
          }
        } as never,
      )
      byHand = handler(
        { config: { method: 'GET', url: '/by-hand', response: 'stream' } } as never,
        async function* (_params: unknown, ctx: RequestContext) {
          ctx.reply.header('content-type', 'text/event-stream')
          await pause(300)
          yield 'data: x\n\n'
        } as never,
      )
      endless = handler(
        { config: { method: 'GET', url: '/endless', response: 'stream' } } as never,
        async function* () {
          try {
            for (;;) {
              opened++
              yield new Uint8Array(64 * 1024)
            }
          } finally {
            closed++
          }
        } as never,
      )
    }

    @Module({ controllers: [StreamController] })
    class AppModule {}

    app = await NaviosFactory.create(AppModule, { adapter: defineFastifyEnvironment(), logger })
    address = await app.listen({ port: 0, host: '127.0.0.1' })
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    opened = closed = 0
    logger.error.mockClear()
  })

  it('sends a file, and closes it', async () => {
    const text = await (await fetch(`${address}/file`)).text()
    expect(text).toContain("describe('fastify adapter: streams'")
    await pause(20)
    expect([opened, closed]).toEqual([1, 1])
  })

  it('closes the file of a HEAD, and of a client that left before the first chunk', async () => {
    const head = await fetch(`${address}/file`, { method: 'HEAD' })
    expect(head.status).toBe(200)
    expect(head.headers.has('content-length')).toBe(false)
    const controller = new AbortController()
    const pending = fetch(`${address}/late-file`, { signal: controller.signal }).catch(() => null)
    await pause(20)
    controller.abort()
    await pending
    await pause(100)
    expect(opened).toBe(2)
    expect(closed).toBe(2)
  })

  it('answers a file that cannot be read with an error response, and reports it once', async () => {
    for (const query of ['', '?late=1']) {
      logger.error.mockClear()
      const response = await fetch(`${address}/missing${query}`)
      expect(response.status).toBe(500)
      expect(response.headers.get('content-type')).toContain('application/problem+json')
      expect(logger.error).toHaveBeenCalledTimes(1)
      expect(logger.error.mock.calls[0][0]).toBe('Unhandled error in GET /missing')
      expect(logger.error.mock.calls[0][1].code).toBe('ENOENT')
    }
  })

  it('sends the headers of an event stream before its first event', async () => {
    for (const path of ['/idle', '/by-hand']) {
      const started = Date.now()
      const elapsed = await new Promise<number>((resolve, reject) => {
        httpRequest(`${address}${path}`, (response) => {
          resolve(Date.now() - started)
          response.destroy()
        })
          .on('error', reject)
          .end()
      })
      expect(elapsed, path).toBeLessThan(250)
    }
  })

  it('sends chunks that are there at once together', async () => {
    const { text, reads } = await new Promise<{ text: string; reads: number }>(
      (resolve, reject) => {
        httpRequest(`${address}/lines`, (response) => {
          let text = ''
          let reads = 0
          response.on('data', (chunk) => {
            text += chunk
            reads++
          })
          response.on('end', () => resolve({ text, reads }))
        })
          .on('error', reject)
          .end()
      },
    )
    expect(text.split('\n')).toHaveLength(5001)
    expect(text.endsWith('line 4999\n')).toBe(true)
    expect(reads).toBeLessThan(500)
  })

  it('does not produce chunks for a client that does not read them', async () => {
    const response = await new Promise<IncomingMessage>((resolve, reject) => {
      httpRequest(`${address}/endless`, resolve).on('error', reject).end()
    })
    response.pause()
    await pause(150)
    const produced = opened
    await pause(100)
    expect(opened).toBe(produced)
    // What the buffers of both ends hold, and no more.
    expect(produced).toBeLessThan(200)
    response.destroy()
    await pause(50)
    expect(closed).toBe(1)
  })
})

describe('fastify adapter: errors of its own hooks', () => {
  it('reports the route, and does not send the headers of the response that failed', async () => {
    const logger = { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }

    @Controller()
    class CachedController {
      cached = handler(
        { config: { method: 'GET', url: '/cached' } } as never,
        (_params: unknown, ctx: RequestContext) => {
          ctx.reply.header('cache-control', 'public, max-age=60')
          ctx.reply.header('x-kept', 'yes')
          return { ok: true }
        },
      )
    }

    @Module({ controllers: [CachedController] })
    class AppModule {}

    const app = await NaviosFactory.create(AppModule, {
      adapter: defineFastifyEnvironment({
        configure: (server) => {
          let failed = false
          server.addHook('onSend', async () => {
            if (!failed) {
              failed = true
              throw new Error('a hook failed')
            }
          })
        },
      }),
      logger,
    })
    await app.init()
    const response = await app.inject({ method: 'GET', url: '/cached?q=1' })
    expect(response.status).toBe(500)
    expect(response.headers['content-type']).toContain('application/problem+json')
    expect(response.headers['cache-control']).toBeUndefined()
    expect(response.headers['x-kept']).toBe('yes')
    expect(logger.error.mock.calls[0][0]).toBe('Unhandled error in GET /cached')
    await app.close()
  })
})
