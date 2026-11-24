import { afterAll, beforeAll, describe, expect, it } from 'bun:test'

import { builder } from '@navios/builder'
import {
  Controller,
  Endpoint,
  HttpCode,
  Injectable,
  InjectableScope,
  inject,
  Module,
  NaviosApplication,
  NaviosFactory,
} from '@navios/core'
import supertest from 'supertest'
import { z } from 'zod/v4'

import type { EndpointParams, EndpointResult } from '@navios/core'

import { defineBunEnvironment } from '../../src/index.mjs'

import type { BunEnvironment } from '../../src/index.mjs'

describe('response: void endpoints', () => {
  let server: NaviosApplication<BunEnvironment>
  let realServer: string

  const deleted: string[] = []

  @Injectable({ scope: InjectableScope.Request })
  class RequestScopedService {
    readonly id = Math.random().toString(36).slice(2)
  }

  const deleteItem = builder().declareEndpoint({
    url: '/items/$id',
    method: 'DELETE',
    response: 'void',
  })
  const archiveItem = builder().declareEndpoint({
    url: '/items/$id/archive',
    method: 'POST',
    response: 'void',
    requestSchema: z.object({ reason: z.string() }),
  })
  const ping = builder().declareEndpoint({
    url: '/ping',
    method: 'POST',
    response: 'void',
  })
  const leaky = builder().declareEndpoint({
    url: '/leaky',
    method: 'POST',
    response: 'void',
  })
  const scopedDelete = builder().declareEndpoint({
    url: '/scoped/$id',
    method: 'DELETE',
    response: 'void',
  })

  @Controller()
  class ItemsController {
    @Endpoint(deleteItem)
    async deleteItem(req: EndpointParams<typeof deleteItem>): EndpointResult<typeof deleteItem> {
      deleted.push(req.urlParams.id)
    }

    // A custom status still wins over the 204 default
    @Endpoint(archiveItem)
    @HttpCode(202)
    async archiveItem(req: EndpointParams<typeof archiveItem>) {
      deleted.push(`${req.urlParams.id}:${req.data.reason}`)
    }

    @Endpoint(ping)
    ping() {}

    // Not type-safe on purpose: whatever the method returns must not be sent
    // @ts-expect-error - a void endpoint must not return a value
    @Endpoint(leaky)
    async leaky() {
      return { secret: 'do not send' }
    }
  }

  @Controller()
  class ScopedController {
    private scoped = inject(RequestScopedService)

    @Endpoint(scopedDelete)
    async remove(req: EndpointParams<typeof scopedDelete>) {
      deleted.push(`${req.urlParams.id}:${typeof this.scoped.id}`)
    }
  }

  @Module({
    controllers: [ItemsController, ScopedController],
  })
  class ItemsModule {}

  beforeAll(async () => {
    server = await NaviosFactory.create<BunEnvironment>(ItemsModule, {
      adapter: defineBunEnvironment(),
    })
    await server.init()
    await server.listen({ port: 3020, hostname: 'localhost' })
    realServer = server.getServer().url.origin
  })

  afterAll(async () => {
    await server.close()
  })

  it('answers 204 with no body', async () => {
    const response = await supertest(realServer).delete('/items/42')

    expect(response.status).toBe(204)
    expect(response.text).toBe('')
    expect(response.headers['content-type']).toBeUndefined()
    expect(deleted).toContain('42')
  })

  it('still validates the request body', async () => {
    const response = await supertest(realServer).post('/items/7/archive').send({ reason: 42 })

    expect(response.status).toBe(400)
  })

  it('lets @HttpCode override the status', async () => {
    const response = await supertest(realServer).post('/items/7/archive').send({ reason: 'old' })

    expect(response.status).toBe(202)
    expect(response.text).toBe('')
    expect(deleted).toContain('7:old')
  })

  it('works for a synchronous method without arguments', async () => {
    const response = await supertest(realServer).post('/ping')

    expect(response.status).toBe(204)
    expect(response.text).toBe('')
  })

  it('never sends a value the method returned by mistake', async () => {
    const response = await supertest(realServer).post('/leaky')

    expect(response.status).toBe(204)
    expect(response.text).toBe('')
  })

  it('works for a request-scoped controller', async () => {
    const response = await supertest(realServer).delete('/scoped/9')

    expect(response.status).toBe(204)
    expect(response.text).toBe('')
    expect(deleted).toContain('9:string')
  })
})
