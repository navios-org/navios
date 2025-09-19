import type { EndpointParams } from '@navios/core'

import { builder } from '@navios/builder'
import {
  Controller,
  Endpoint,
  Module,
  NaviosApplication,
  NaviosFactory,
} from '@navios/core'

import supertest from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import { defineFastifyEnvironment } from '../../src/index.mjs'

describe('POST variants', () => {
  let server: NaviosApplication

  const simple = builder().declareEndpoint({
    url: '/simple',
    method: 'POST',
    responseSchema: z.object({
      message: z.string(),
    }),
  })
  const withUrlParams = builder().declareEndpoint({
    url: '/with-url-params/$id',
    method: 'POST',
    responseSchema: z.object({
      id: z.string(),
    }),
  })
  const withRequestAndQueryParams = builder().declareEndpoint({
    url: '/with-request-and-query-params',
    method: 'POST',
    requestSchema: z.object({
      foo: z.string(),
    }),
    responseSchema: z.object({
      foo: z.string(),
      bar: z.string(),
    }),
    querySchema: z.object({
      bar: z.string(),
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

    @Endpoint(withRequestAndQueryParams)
    async getWithQueryParams(
      req: EndpointParams<typeof withRequestAndQueryParams>,
    ) {
      return {
        foo: req.data.foo as string,
        bar: req.params.bar as string,
      }
    }
  }

  @Module({
    controllers: [SomethingController],
  })
  class SomethingModule {}

  beforeAll(async () => {
    server = await NaviosFactory.create(SomethingModule, {
      adapter: defineFastifyEnvironment(),
    })
    await server.init()
  })

  afterAll(async () => {
    await server.close()
  })

  it('should return 200', async () => {
    const response = await supertest(server.getServer().server).post('/simple')
    expect(response.status).toBe(200)
    expect(response.body.message).toBe('Hello, world!')
  })

  it('should return 200 with url params', async () => {
    const response = await supertest(server.getServer().server).post(
      '/with-url-params/123',
    )
    expect(response.status).toBe(200)
    expect(response.body.id).toBe('123')
  })

  it('should return 200 with query params', async () => {
    const response = await supertest(server.getServer().server)
      .post('/with-request-and-query-params')
      .send({
        foo: 'John',
      })
      .query({
        bar: 'Doe',
      })
    expect(response.status).toBe(200)
    expect(response.body.foo).toBe('John')
    expect(response.body.bar).toBe('Doe')
  })
})
