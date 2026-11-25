import { connect } from 'node:net'

import { Controller, handler, Module, NaviosFactory } from '@navios/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import type { NaviosApplication, RequestContext } from '@navios/server'

import { defineFastifyEnvironment } from '../src/index.mjs'

import type { FastifyEnvironment } from '../src/index.mjs'

// What an application does once, to type `ctx.raw` and `app.getServer()`.
declare module '@navios/server' {
  interface Register {
    environment: FastifyEnvironment
  }
}

describe('fastify adapter: native reply', () => {
  let app: NaviosApplication<FastifyEnvironment>
  let address: string
  const logger = { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
  const events: unknown[] = []

  const finished = async () => {
    for (let i = 0; i < 100 && events.length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    return events
  }

  beforeAll(async () => {
    @Controller()
    class RawController {
      raw = handler(
        {
          config: { method: 'GET', url: '/raw', responseSchema: z.object({ ok: z.boolean() }) },
        } as never,
        (_params: unknown, ctx: RequestContext) => {
          ctx.onFinish(() => {
            events.push(ctx.responseStatus)
          })
          ctx.raw.reply.code(202).header('x-native', 'yes').send('written natively')
        },
      )
      detached = handler(
        { config: { method: 'GET', url: '/detached' } } as never,
        (_params: unknown, ctx: RequestContext) => {
          const { reply } = ctx.raw
          reply.hijack()
          setTimeout(() => {
            ctx.onFinish(() => {
              events.push(ctx.responseStatus)
            })
            reply.raw.statusCode = 201
            reply.raw.end('written later')
          }, 20)
        },
      )
      refused = handler(
        { config: { method: 'GET', url: '/refused' } } as never,
        (_params: unknown, ctx: RequestContext) => {
          const { reply } = ctx.raw
          ctx.onFinish(() => {
            events.push(ctx.responseStatus)
          })
          reply.hijack()
          reply.raw.statusCode = 404
          setTimeout(() => reply.raw.end('not here'), 20)
        },
      )
      abandoned = handler(
        { config: { method: 'GET', url: '/abandoned' } } as never,
        (_params: unknown, ctx: RequestContext) => {
          ctx.raw.reply.hijack()
          throw new Error('nobody answers')
        },
      )
    }

    @Module({ controllers: [RawController] })
    class AppModule {}

    app = await NaviosFactory.create(AppModule, {
      adapter: defineFastifyEnvironment(),
      logger,
    })
    address = await app.listen({ port: 0, host: '127.0.0.1' })
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    events.length = 0
    logger.error.mockClear()
  })

  it('lets a handler take the response over without a validation error', async () => {
    const response = await app.inject({ method: 'GET', url: '/raw' })
    expect(response.status).toBe(202)
    expect(response.headers['x-native']).toBe('yes')
    expect(response.text).toBe('written natively')
    expect(await finished()).toEqual([202])
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('keeps the request of a response that is written later', async () => {
    const response = await fetch(`${address}/detached`)
    expect(response.status).toBe(201)
    expect(await response.text()).toBe('written later')
    expect(await finished()).toEqual([201])
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('leaves a response with an error status to the handler that has taken it over', async () => {
    const response = await fetch(`${address}/refused`)
    expect(response.status).toBe(404)
    expect(await response.text()).toBe('not here')
    expect(await finished()).toEqual([404])
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('closes the connection when a handler fails after it took the response over', async () => {
    const { port, hostname } = new URL(address)
    const text = await new Promise<string>((resolve, reject) => {
      const socket = connect(Number(port), hostname)
      let received = ''
      socket.setTimeout(2000, () => reject(new Error('the client was left waiting')))
      socket.on('data', (chunk) => (received += chunk))
      socket.on('close', () => resolve(received))
      socket.write('GET /abandoned HTTP/1.1\r\nHost: x\r\n\r\n')
    })
    expect(text).toBe('')
    expect(logger.error).toHaveBeenCalledTimes(1)
  })
})
