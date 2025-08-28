import { builder } from '@navios/builder'

import supertest from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import type { EndpointParams } from '../../src/index.mjs'

import {
  Controller,
  Endpoint,
  Module,
  NaviosApplication,
  NaviosFactory,
} from '../../src/index.mjs'

describe('GET variants', () => {
  let server: NaviosApplication

  const simple = builder().declareEndpoint({
    url: '/simple',
    method: 'GET',
    responseSchema: z.object({
      message: z.string(),
    }),
  })
  const withUrlParams = builder().declareEndpoint({
    url: '/with-url-params/$id',
    method: 'GET',
    responseSchema: z.object({
      id: z.string(),
    }),
  })
  const withQueryParams = builder().declareEndpoint({
    url: '/with-query-params',
    method: 'GET',
    responseSchema: z.object({
      name: z.string(),
    }),
    querySchema: z.object({
      name: z.string(),
    }),
  })

  @Controller()
  class SomethingController {
    @Endpoint(simple)
    async getSomething(req: EndpointParams<typeof simple>) {
      return { message: 'Hello, world!' }
    }

    @Endpoint(withUrlParams)
    async getWithUrlParams(req: EndpointParams<typeof withUrlParams>) {
      return { id: req.urlParams.id as string }
    }

    @Endpoint(withQueryParams)
    async getWithQueryParams(req: EndpointParams<typeof withQueryParams>) {
      return { name: req.params.name as string }
    }
  }

  @Module({
    controllers: [SomethingController],
  })
  class SomethingModule {}

  beforeAll(async () => {
    server = await NaviosFactory.create(SomethingModule)
    await server.init()
  })

  afterAll(async () => {
    await server.close()
  })

  it('should return 200', async () => {
    const response = await supertest(server.getServer().server).get('/simple')
    expect(response.status).toBe(200)
    expect(response.body.message).toBe('Hello, world!')
  })

  it('should return 200 with url params', async () => {
    const response = await supertest(server.getServer().server).get(
      '/with-url-params/123',
    )
    expect(response.status).toBe(200)
    expect(response.body.id).toBe('123')
  })

  it('should return 200 with query params', async () => {
    const response = await supertest(server.getServer().server).get(
      '/with-query-params?name=John',
    )
    expect(response.status).toBe(200)
  })
})
