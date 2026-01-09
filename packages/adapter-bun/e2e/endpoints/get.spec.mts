import type { EndpointParams } from '@navios/core'

import { builder } from '@navios/builder'
import {
  Controller,
  Endpoint,
  inject,
  Injectable,
  InjectableScope,
  Module,
  NaviosApplication,
  NaviosFactory,
} from '@navios/core'

import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import supertest from 'supertest'
import { z } from 'zod/v4'

import { defineBunEnvironment } from '../../src/index.mjs'
import type { BunEnvironment } from '../../src/index.mjs'

describe('GET variants', () => {
  let server: NaviosApplication<BunEnvironment>
  let realServer: string

  // Request scoped service to track request state
  @Injectable({
    scope: InjectableScope.Request,
  })
  class RequestTrackerService {
    private requestId: string = Math.random().toString(36).substring(7)
    private startTime: number = Date.now()
    private data: Record<string, any> = {}

    getRequestId(): string {
      return this.requestId
    }

    getElapsedTime(): number {
      return Date.now() - this.startTime
    }

    addData(key: string, value: any): void {
      // Simulate storing request-specific data
      this.data[key] = value
    }

    getData(key: string): any {
      return this.data[key]
    }
  }

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

  const requestScoped = builder().declareEndpoint({
    url: '/request-scoped',
    method: 'GET',
    responseSchema: z.object({
      requestId: z.string(),
      elapsedTime: z.number(),
      data: z.string(),
    }),
    querySchema: z.object({
      data: z.string(),
    }),
  })

  @Controller()
  class SomethingController {
    private requestTracker = inject(RequestTrackerService)

    @Endpoint(simple)
    async getSomething(_req: EndpointParams<typeof simple>) {
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

    @Endpoint(requestScoped)
    async getRequestScoped(req: EndpointParams<typeof requestScoped>) {
      const data = req.params.data as string
      this.requestTracker.addData('userData', data)

      // Simulate some processing time
      await new Promise((resolve) => setTimeout(resolve, 10))

      return {
        requestId: this.requestTracker.getRequestId(),
        elapsedTime: this.requestTracker.getElapsedTime(),
        data: this.requestTracker.getData('userData'),
      }
    }
  }

  @Module({
    controllers: [SomethingController],
  })
  class SomethingModule {}

  beforeAll(async () => {
    server = await NaviosFactory.create<BunEnvironment>(SomethingModule, {
      adapter: defineBunEnvironment(),
    })
    await server.init()
    await server.listen({ port: 3001, hostname: 'localhost' })
    realServer = server.getServer().url.href
  })

  afterAll(async () => {
    await server.close()
  })

  it('should return 200', async () => {
    const response = await supertest(realServer).get('/simple')
    expect(response.status).toBe(200)
    expect(response.body.message).toBe('Hello, world!')
  })

  it('should return 200 with url params', async () => {
    const response = await supertest(realServer).get('/with-url-params/123')
    expect(response.status).toBe(200)
    expect(response.body.id).toBe('123')
  })

  it('should return 200 with query params', async () => {
    const response = await supertest(realServer).get(
      '/with-query-params?name=John',
    )
    expect(response.status).toBe(200)
  })

  it('should handle parallel requests with isolated request scoped services', async () => {
    const startTime = Date.now()
    // Create multiple parallel requests with different data
    const requests = [
      supertest(realServer).get('/request-scoped?data=request1'),
      supertest(realServer).get('/request-scoped?data=request2'),
      supertest(realServer).get('/request-scoped?data=request3'),
      supertest(realServer).get('/request-scoped?data=request4'),
      supertest(realServer).get('/request-scoped?data=request5'),
    ]

    // Execute all requests in parallel
    const responses = await Promise.all(requests)
    const endTime = Date.now()
    const elapsedTime = endTime - startTime
    console.log(`Elapsed time: ${elapsedTime}ms`)
    // Verify all requests succeeded
    responses.forEach((response) => {
      expect(response.status).toBe(200)
      expect(response.body.requestId).toBeDefined()
      expect(response.body.elapsedTime).toBeGreaterThan(0)
      expect(response.body.data).toBeDefined()
    })

    // Verify each request has a unique request ID (proving isolation)
    const requestIds = responses.map((r) => r.body.requestId)
    const uniqueRequestIds = new Set(requestIds)
    expect(uniqueRequestIds.size).toBe(requestIds.length)

    // Verify each request returns its own data (proving request scoped isolation)
    const expectedData = [
      'request1',
      'request2',
      'request3',
      'request4',
      'request5',
    ]
    const actualData = responses.map((r) => r.body.data)
    expect(actualData).toEqual(expect.arrayContaining(expectedData))
  })
})
