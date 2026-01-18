import { afterAll, beforeAll, describe, expect, it } from 'bun:test'

import { BunControllerAdapterToken, defineBunEnvironment } from '@navios/adapter-bun'
import { builder } from '@navios/builder'
import { Controller, Endpoint, Module, NaviosApplication, NaviosFactory } from '@navios/core'
import supertest from 'supertest'
import { z } from 'zod/v4'

import type { BunEnvironment } from '@navios/adapter-bun'
import type { EndpointParams } from '@navios/core'

import { defineOtelPlugin } from '../src/index.mjs'
import { TracedBunControllerAdapterService } from '../src/overrides/index.mjs'

describe('OpenTelemetry Bun Integration', () => {
  let server: NaviosApplication<BunEnvironment>
  let realServer: string

  const healthEndpoint = builder().declareEndpoint({
    url: '/health',
    method: 'GET',
    responseSchema: z.object({
      status: z.string(),
    }),
  })

  const userEndpoint = builder().declareEndpoint({
    url: '/users/$id',
    method: 'GET',
    responseSchema: z.object({
      id: z.string(),
      name: z.string(),
    }),
  })

  const echoEndpoint = builder().declareEndpoint({
    url: '/echo',
    method: 'POST',
    requestSchema: z.object({
      message: z.string(),
    }),
    responseSchema: z.object({
      message: z.string(),
      traced: z.boolean(),
    }),
  })

  @Controller()
  class AppController {
    @Endpoint(healthEndpoint)
    async health(_req: EndpointParams<typeof healthEndpoint>) {
      return { status: 'ok' }
    }

    @Endpoint(userEndpoint)
    async getUser(req: EndpointParams<typeof userEndpoint>) {
      return {
        id: req.urlParams.id as string,
        name: 'Test User',
      }
    }

    @Endpoint(echoEndpoint)
    async echo(req: EndpointParams<typeof echoEndpoint>) {
      return {
        message: req.data.message,
        traced: true,
      }
    }
  }

  @Module({
    controllers: [AppController],
  })
  class AppModule {}

  beforeAll(async () => {
    server = await NaviosFactory.create<BunEnvironment>(AppModule, {
      adapter: defineBunEnvironment(),
    })

    // Register OTel plugins
    for (const plugin of defineOtelPlugin({
      serviceName: 'test-otel-bun',
      exporter: 'none', // Don't export, just verify tracing setup
      autoInstrument: {
        http: true,
        handlers: true,
      },
      ignoreRoutes: ['/health'],
    })) {
      server.usePlugin(plugin)
    }

    await server.init()
    await server.listen({ port: 3002, hostname: 'localhost' })
    realServer = server.getServer().url.href
  })

  afterAll(async () => {
    await server.close()
  })

  describe('TracedBunControllerAdapterService registration', () => {
    it('should use TracedBunControllerAdapterService when autoInstrument.http is true', async () => {
      // Get the controller adapter from the container
      const container = server.getContainer()
      const controllerAdapter = await container.get(BunControllerAdapterToken)

      // Verify it's the traced version
      expect(controllerAdapter).toBeInstanceOf(TracedBunControllerAdapterService)
    })
  })

  describe('HTTP request handling', () => {
    it('should handle GET requests correctly with tracing enabled', async () => {
      const response = await supertest(realServer).get('/users/123')
      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        id: '123',
        name: 'Test User',
      })
    })

    it('should handle POST requests correctly with tracing enabled', async () => {
      const response = await supertest(realServer)
        .post('/echo')
        .send({ message: 'Hello, Tracing!' })
        .set('Content-Type', 'application/json')

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        message: 'Hello, Tracing!',
        traced: true,
      })
    })

    it('should handle ignored routes without tracing errors', async () => {
      // /health is in ignoreRoutes, should still work
      const response = await supertest(realServer).get('/health')
      expect(response.status).toBe(200)
      expect(response.body).toEqual({ status: 'ok' })
    })

    it('should return 404 for unknown routes', async () => {
      const response = await supertest(realServer).get('/unknown')
      expect(response.status).toBe(404)
    })
  })

  describe('Concurrent request handling', () => {
    it('should handle multiple concurrent GET requests', async () => {
      const requests = Array.from({ length: 10 }, (_, i) =>
        supertest(realServer).get(`/users/${i + 1}`),
      )

      const responses = await Promise.all(requests)

      responses.forEach((response, i) => {
        expect(response.status).toBe(200)
        expect(response.body.id).toBe(String(i + 1))
      })
    })

    it('should handle mixed concurrent requests', async () => {
      const requests = [
        supertest(realServer).get('/users/1'),
        supertest(realServer).get('/health'),
        supertest(realServer)
          .post('/echo')
          .send({ message: 'test1' })
          .set('Content-Type', 'application/json'),
        supertest(realServer).get('/users/2'),
        supertest(realServer)
          .post('/echo')
          .send({ message: 'test2' })
          .set('Content-Type', 'application/json'),
      ]

      const responses = await Promise.all(requests)

      expect(responses[0].status).toBe(200)
      expect(responses[0].body.id).toBe('1')

      expect(responses[1].status).toBe(200)
      expect(responses[1].body.status).toBe('ok')

      expect(responses[2].status).toBe(200)
      expect(responses[2].body.message).toBe('test1')

      expect(responses[3].status).toBe(200)
      expect(responses[3].body.id).toBe('2')

      expect(responses[4].status).toBe(200)
      expect(responses[4].body.message).toBe('test2')
    })
  })
})
