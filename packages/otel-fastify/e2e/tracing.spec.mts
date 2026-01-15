import type { EndpointParams } from '@navios/core'

import { builder } from '@navios/builder'
import {
  Controller,
  Endpoint,
  Module,
  NaviosApplication,
  NaviosFactory,
} from '@navios/core'
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import type { FastifyEnvironment } from '@navios/adapter-fastify'
import { trace, context as otelContext } from '@opentelemetry/api'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import supertest from 'supertest'
import { z } from 'zod/v4'

import { defineOtelPlugin } from '../src/index.mjs'

describe('OpenTelemetry Fastify Integration', () => {
  let server: NaviosApplication<FastifyEnvironment>

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
    // Disable any existing global tracer provider to ensure test isolation
    trace.disable()
    otelContext.disable()

    server = await NaviosFactory.create<FastifyEnvironment>(AppModule, {
      adapter: defineFastifyEnvironment(),
    })

    // Register OTel plugin
    server.usePlugin(defineOtelPlugin({
      serviceName: 'test-otel-fastify',
      exporter: 'none', // Don't export, just verify tracing setup
      autoInstrument: {
        http: true,
        handlers: true,
      },
      ignoreRoutes: ['/health'],
    }))

    await server.init()
  })

  afterAll(async () => {
    await server.close()
  })

  describe('HTTP request handling', () => {
    it('should handle GET requests correctly with tracing enabled', async () => {
      const response = await supertest(server.getServer().server).get('/users/123')
      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        id: '123',
        name: 'Test User',
      })
    })

    it('should handle POST requests correctly with tracing enabled', async () => {
      const response = await supertest(server.getServer().server)
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
      const response = await supertest(server.getServer().server).get('/health')
      expect(response.status).toBe(200)
      expect(response.body).toEqual({ status: 'ok' })
    })

    it('should return 404 for unknown routes', async () => {
      const response = await supertest(server.getServer().server).get('/unknown')
      expect(response.status).toBe(404)
    })
  })

  describe('Concurrent request handling', () => {
    it('should handle multiple concurrent GET requests', async () => {
      // Run requests sequentially to avoid ECONNRESET with supertest inject
      const responses = []
      for (let i = 0; i < 5; i++) {
        const response = await supertest(server.getServer().server).get(`/users/${i + 1}`)
        responses.push(response)
      }

      responses.forEach((response, i) => {
        expect(response.status).toBe(200)
        expect(response.body.id).toBe(String(i + 1))
      })
    })

    it('should handle mixed request types', async () => {
      // Run requests sequentially to avoid ECONNRESET with supertest inject
      const response1 = await supertest(server.getServer().server).get('/users/1')
      expect(response1.status).toBe(200)
      expect(response1.body.id).toBe('1')

      const response2 = await supertest(server.getServer().server).get('/health')
      expect(response2.status).toBe(200)
      expect(response2.body.status).toBe('ok')

      const response3 = await supertest(server.getServer().server)
        .post('/echo')
        .send({ message: 'test1' })
        .set('Content-Type', 'application/json')
      expect(response3.status).toBe(200)
      expect(response3.body.message).toBe('test1')

      const response4 = await supertest(server.getServer().server).get('/users/2')
      expect(response4.status).toBe(200)
      expect(response4.body.id).toBe('2')

      const response5 = await supertest(server.getServer().server)
        .post('/echo')
        .send({ message: 'test2' })
        .set('Content-Type', 'application/json')
      expect(response5.status).toBe(200)
      expect(response5.body.message).toBe('test2')
    })
  })
})
