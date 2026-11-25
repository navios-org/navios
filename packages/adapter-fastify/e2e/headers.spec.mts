import { request as httpRequest } from 'node:http'

import { Controller, handler, Module, NaviosFactory } from '@navios/core'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import type { NaviosApplication } from '@navios/core'

import { defineFastifyEnvironment } from '../src/index.mjs'

describe('headersSchema', () => {
  let app: NaviosApplication<any>
  let address: string

  beforeAll(async () => {
    const endpoint = {
      config: {
        method: 'GET',
        url: '/headers',
        headersSchema: z.looseObject({ 'set-cookie': z.string().optional() }),
      },
    } as any
    @Controller()
    class HeadersController {
      headers = handler(endpoint, ({ headers }: any) => ({ cookie: headers['set-cookie'] }))
    }
    @Module({ controllers: [HeadersController] })
    class AppModule {}
    app = await NaviosFactory.create(AppModule, {
      adapter: defineFastifyEnvironment(),
      logger: false,
    })
    address = await app.listen({ port: 0, host: '127.0.0.1' })
  })

  afterAll(async () => {
    await app.close()
  })

  it('joins the one header that Node keeps as a list', async () => {
    const body = await new Promise<string>((resolve, reject) => {
      httpRequest(
        `${address}/headers`,
        { headers: { 'set-cookie': ['a=1', 'b=2'] } },
        (response) => {
          let text = ''
          response.on('data', (chunk) => (text += chunk))
          response.on('end', () => resolve(text))
        },
      )
        .on('error', reject)
        .end()
    })
    expect(JSON.parse(body)).toEqual({ cookie: 'a=1, b=2' })
  })

  it('does not build web headers', async () => {
    const built = vi.spyOn(globalThis, 'Headers')
    const response = await app.inject({ method: 'GET', url: '/headers' })
    expect(response.status).toBe(200)
    expect(built).not.toHaveBeenCalled()
    built.mockRestore()
  })
})
