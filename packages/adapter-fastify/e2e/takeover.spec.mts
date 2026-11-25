import { Controller, handler, Module, NaviosFactory } from '@navios/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
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
  const logger = { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }

  beforeAll(async () => {
    @Controller()
    class RawController {
      raw = handler(
        {
          config: { method: 'GET', url: '/raw', responseSchema: z.object({ ok: z.boolean() }) },
        } as never,
        (_params: unknown, ctx: RequestContext) => {
          ctx.raw.reply.code(202).header('x-native', 'yes').send('written natively')
        },
      )
    }

    @Module({ controllers: [RawController] })
    class AppModule {}

    app = await NaviosFactory.create(AppModule, {
      adapter: defineFastifyEnvironment(),
      logger,
    })
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('lets a handler take the response over without a validation error', async () => {
    const response = await app.inject({ method: 'GET', url: '/raw' })
    expect(response.status).toBe(202)
    expect(response.headers['x-native']).toBe('yes')
    expect(response.text).toBe('written natively')
    expect(logger.error).not.toHaveBeenCalled()
  })
})
