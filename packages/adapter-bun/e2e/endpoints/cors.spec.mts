import type { EndpointParams } from '@navios/core'

import { builder } from '@navios/builder'
import {
  Controller,
  Endpoint,
  Module,
  NaviosApplication,
  NaviosFactory,
} from '@navios/core'

import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import supertest from 'supertest'
import { z } from 'zod/v4'

import { defineBunEnvironment } from '../../src/index.mjs'

describe('CORS support', () => {
  describe('with origin: true (allow all)', () => {
    let server: NaviosApplication
    let realServer: string

    const simple = builder().declareEndpoint({
      url: '/simple',
      method: 'GET',
      responseSchema: z.object({
        message: z.string(),
      }),
    })

    const postData = builder().declareEndpoint({
      url: '/data',
      method: 'POST',
      requestSchema: z.object({
        value: z.string(),
      }),
      responseSchema: z.object({
        received: z.string(),
      }),
    })

    @Controller()
    class CorsController {
      @Endpoint(simple)
      async getSimple(_req: EndpointParams<typeof simple>) {
        return { message: 'Hello, CORS!' }
      }

      @Endpoint(postData)
      async postData(req: EndpointParams<typeof postData>) {
        return { received: req.data.value }
      }
    }

    @Module({
      controllers: [CorsController],
    })
    class CorsModule {}

    beforeAll(async () => {
      server = await NaviosFactory.create(CorsModule, {
        adapter: defineBunEnvironment(),
      })
      server.enableCors({
        origin: true,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        exposedHeaders: ['X-Custom-Header'],
        maxAge: 86400,
      })
      await server.init()
      await server.listen({ port: 3010, host: 'localhost' })
      realServer = server.getServer().url.href
    })

    afterAll(async () => {
      await server.close()
    })

    it('should return CORS headers for allowed origin', async () => {
      const response = await supertest(realServer)
        .get('/simple')
        .set('Origin', 'http://example.com')

      expect(response.status).toBe(200)
      expect(response.body.message).toBe('Hello, CORS!')
      expect(response.headers['access-control-allow-origin']).toBe(
        'http://example.com',
      )
      expect(response.headers['access-control-allow-credentials']).toBe('true')
      expect(response.headers['access-control-expose-headers']).toBe(
        'X-Custom-Header',
      )
      expect(response.headers['vary']).toBe('Origin')
    })

    it('should handle preflight OPTIONS request', async () => {
      const response = await supertest(realServer)
        .options('/simple')
        .set('Origin', 'http://example.com')
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'Content-Type')

      expect(response.status).toBe(204)
      expect(response.headers['access-control-allow-origin']).toBe(
        'http://example.com',
      )
      expect(response.headers['access-control-allow-methods']).toBe(
        'GET, POST, PUT, DELETE',
      )
      expect(response.headers['access-control-allow-headers']).toBe(
        'Content-Type, Authorization',
      )
      expect(response.headers['access-control-allow-credentials']).toBe('true')
      expect(response.headers['access-control-max-age']).toBe('86400')
    })

    it('should handle preflight for POST request', async () => {
      const response = await supertest(realServer)
        .options('/data')
        .set('Origin', 'http://example.com')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'Content-Type')

      expect(response.status).toBe(204)
      expect(response.headers['access-control-allow-origin']).toBe(
        'http://example.com',
      )
      expect(response.headers['access-control-allow-methods']).toBe(
        'GET, POST, PUT, DELETE',
      )
    })

    it('should apply CORS headers to POST response', async () => {
      const response = await supertest(realServer)
        .post('/data')
        .set('Origin', 'http://example.com')
        .set('Content-Type', 'application/json')
        .send({ value: 'test' })

      expect(response.status).toBe(200)
      expect(response.body.received).toBe('test')
      expect(response.headers['access-control-allow-origin']).toBe(
        'http://example.com',
      )
      expect(response.headers['access-control-allow-credentials']).toBe('true')
    })

    it('should apply CORS headers to error responses', async () => {
      const response = await supertest(realServer)
        .get('/non-existent')
        .set('Origin', 'http://example.com')

      expect(response.status).toBe(404)
      expect(response.headers['access-control-allow-origin']).toBe(
        'http://example.com',
      )
    })
  })

  describe('with specific origin string', () => {
    let server: NaviosApplication
    let realServer: string

    const simple = builder().declareEndpoint({
      url: '/simple',
      method: 'GET',
      responseSchema: z.object({
        message: z.string(),
      }),
    })

    @Controller()
    class CorsController {
      @Endpoint(simple)
      async getSimple(_req: EndpointParams<typeof simple>) {
        return { message: 'Hello!' }
      }
    }

    @Module({
      controllers: [CorsController],
    })
    class CorsModule {}

    beforeAll(async () => {
      server = await NaviosFactory.create(CorsModule, {
        adapter: defineBunEnvironment(),
      })
      server.enableCors({
        origin: 'http://allowed-origin.com',
      })
      await server.init()
      await server.listen({ port: 3011, host: 'localhost' })
      realServer = server.getServer().url.href
    })

    afterAll(async () => {
      await server.close()
    })

    it('should return CORS headers for matching origin', async () => {
      const response = await supertest(realServer)
        .get('/simple')
        .set('Origin', 'http://allowed-origin.com')

      expect(response.status).toBe(200)
      expect(response.headers['access-control-allow-origin']).toBe(
        'http://allowed-origin.com',
      )
    })

    it('should NOT return CORS headers for non-matching origin', async () => {
      const response = await supertest(realServer)
        .get('/simple')
        .set('Origin', 'http://blocked-origin.com')

      expect(response.status).toBe(200)
      expect(response.headers['access-control-allow-origin']).toBeUndefined()
    })

    it('should reject preflight for non-matching origin', async () => {
      const response = await supertest(realServer)
        .options('/simple')
        .set('Origin', 'http://blocked-origin.com')
        .set('Access-Control-Request-Method', 'GET')

      // Preflight not handled, falls through to 404
      expect(response.status).toBe(404)
      expect(response.headers['access-control-allow-origin']).toBeUndefined()
    })
  })

  describe('with RegExp origin', () => {
    let server: NaviosApplication
    let realServer: string

    const simple = builder().declareEndpoint({
      url: '/simple',
      method: 'GET',
      responseSchema: z.object({
        message: z.string(),
      }),
    })

    @Controller()
    class CorsController {
      @Endpoint(simple)
      async getSimple(_req: EndpointParams<typeof simple>) {
        return { message: 'Hello!' }
      }
    }

    @Module({
      controllers: [CorsController],
    })
    class CorsModule {}

    beforeAll(async () => {
      server = await NaviosFactory.create(CorsModule, {
        adapter: defineBunEnvironment(),
      })
      server.enableCors({
        origin: /\.example\.com$/,
      })
      await server.init()
      await server.listen({ port: 3012, host: 'localhost' })
      realServer = server.getServer().url.href
    })

    afterAll(async () => {
      await server.close()
    })

    it('should allow origin matching RegExp', async () => {
      const response = await supertest(realServer)
        .get('/simple')
        .set('Origin', 'http://app.example.com')

      expect(response.status).toBe(200)
      expect(response.headers['access-control-allow-origin']).toBe(
        'http://app.example.com',
      )
    })

    it('should allow subdomain matching RegExp', async () => {
      const response = await supertest(realServer)
        .get('/simple')
        .set('Origin', 'http://api.staging.example.com')

      expect(response.status).toBe(200)
      expect(response.headers['access-control-allow-origin']).toBe(
        'http://api.staging.example.com',
      )
    })

    it('should reject origin not matching RegExp', async () => {
      const response = await supertest(realServer)
        .get('/simple')
        .set('Origin', 'http://malicious.com')

      expect(response.status).toBe(200)
      expect(response.headers['access-control-allow-origin']).toBeUndefined()
    })
  })

  describe('with array of origins', () => {
    let server: NaviosApplication
    let realServer: string

    const simple = builder().declareEndpoint({
      url: '/simple',
      method: 'GET',
      responseSchema: z.object({
        message: z.string(),
      }),
    })

    @Controller()
    class CorsController {
      @Endpoint(simple)
      async getSimple(_req: EndpointParams<typeof simple>) {
        return { message: 'Hello!' }
      }
    }

    @Module({
      controllers: [CorsController],
    })
    class CorsModule {}

    beforeAll(async () => {
      server = await NaviosFactory.create(CorsModule, {
        adapter: defineBunEnvironment(),
      })
      server.enableCors({
        origin: ['http://app1.com', 'http://app2.com', /\.trusted\.com$/],
      })
      await server.init()
      await server.listen({ port: 3013, host: 'localhost' })
      realServer = server.getServer().url.href
    })

    afterAll(async () => {
      await server.close()
    })

    it('should allow first origin in array', async () => {
      const response = await supertest(realServer)
        .get('/simple')
        .set('Origin', 'http://app1.com')

      expect(response.status).toBe(200)
      expect(response.headers['access-control-allow-origin']).toBe(
        'http://app1.com',
      )
    })

    it('should allow second origin in array', async () => {
      const response = await supertest(realServer)
        .get('/simple')
        .set('Origin', 'http://app2.com')

      expect(response.status).toBe(200)
      expect(response.headers['access-control-allow-origin']).toBe(
        'http://app2.com',
      )
    })

    it('should allow RegExp origin in array', async () => {
      const response = await supertest(realServer)
        .get('/simple')
        .set('Origin', 'http://api.trusted.com')

      expect(response.status).toBe(200)
      expect(response.headers['access-control-allow-origin']).toBe(
        'http://api.trusted.com',
      )
    })

    it('should reject origin not in array', async () => {
      const response = await supertest(realServer)
        .get('/simple')
        .set('Origin', 'http://untrusted.com')

      expect(response.status).toBe(200)
      expect(response.headers['access-control-allow-origin']).toBeUndefined()
    })
  })

  describe('with function-based origin validation', () => {
    let server: NaviosApplication
    let realServer: string

    const simple = builder().declareEndpoint({
      url: '/simple',
      method: 'GET',
      responseSchema: z.object({
        message: z.string(),
      }),
    })

    @Controller()
    class CorsController {
      @Endpoint(simple)
      async getSimple(_req: EndpointParams<typeof simple>) {
        return { message: 'Hello!' }
      }
    }

    @Module({
      controllers: [CorsController],
    })
    class CorsModule {}

    beforeAll(async () => {
      server = await NaviosFactory.create(CorsModule, {
        adapter: defineBunEnvironment(),
      })
      server.enableCors({
        origin: (
          origin: string | undefined,
          callback: (error: Error | null, allow: boolean | string) => void,
        ) => {
          // Allow origins containing "allowed"
          if (origin && origin.includes('allowed')) {
            callback(null, true)
          } else {
            callback(null, false)
          }
        },
      })
      await server.init()
      await server.listen({ port: 3014, host: 'localhost' })
      realServer = server.getServer().url.href
    })

    afterAll(async () => {
      await server.close()
    })

    it('should allow origin when function returns true', async () => {
      const response = await supertest(realServer)
        .get('/simple')
        .set('Origin', 'http://allowed-app.com')

      expect(response.status).toBe(200)
      expect(response.headers['access-control-allow-origin']).toBe(
        'http://allowed-app.com',
      )
    })

    it('should reject origin when function returns false', async () => {
      const response = await supertest(realServer)
        .get('/simple')
        .set('Origin', 'http://blocked-app.com')

      expect(response.status).toBe(200)
      expect(response.headers['access-control-allow-origin']).toBeUndefined()
    })

    it('should handle preflight with function-based validation', async () => {
      const response = await supertest(realServer)
        .options('/simple')
        .set('Origin', 'http://allowed-site.com')
        .set('Access-Control-Request-Method', 'GET')

      expect(response.status).toBe(204)
      expect(response.headers['access-control-allow-origin']).toBe(
        'http://allowed-site.com',
      )
    })
  })

  describe('with origin: false (CORS disabled)', () => {
    let server: NaviosApplication
    let realServer: string

    const simple = builder().declareEndpoint({
      url: '/simple',
      method: 'GET',
      responseSchema: z.object({
        message: z.string(),
      }),
    })

    @Controller()
    class CorsController {
      @Endpoint(simple)
      async getSimple(_req: EndpointParams<typeof simple>) {
        return { message: 'Hello!' }
      }
    }

    @Module({
      controllers: [CorsController],
    })
    class CorsModule {}

    beforeAll(async () => {
      server = await NaviosFactory.create(CorsModule, {
        adapter: defineBunEnvironment(),
      })
      server.enableCors({
        origin: false,
      })
      await server.init()
      await server.listen({ port: 3015, host: 'localhost' })
      realServer = server.getServer().url.href
    })

    afterAll(async () => {
      await server.close()
    })

    it('should not return CORS headers when origin is false', async () => {
      const response = await supertest(realServer)
        .get('/simple')
        .set('Origin', 'http://example.com')

      expect(response.status).toBe(200)
      expect(response.headers['access-control-allow-origin']).toBeUndefined()
    })
  })

  describe('with wildcard origin', () => {
    let server: NaviosApplication
    let realServer: string

    const simple = builder().declareEndpoint({
      url: '/simple',
      method: 'GET',
      responseSchema: z.object({
        message: z.string(),
      }),
    })

    @Controller()
    class CorsController {
      @Endpoint(simple)
      async getSimple(_req: EndpointParams<typeof simple>) {
        return { message: 'Hello!' }
      }
    }

    @Module({
      controllers: [CorsController],
    })
    class CorsModule {}

    beforeAll(async () => {
      server = await NaviosFactory.create(CorsModule, {
        adapter: defineBunEnvironment(),
      })
      server.enableCors({
        origin: '*',
      })
      await server.init()
      await server.listen({ port: 3016, host: 'localhost' })
      realServer = server.getServer().url.href
    })

    afterAll(async () => {
      await server.close()
    })

    it('should return wildcard CORS header', async () => {
      const response = await supertest(realServer)
        .get('/simple')
        .set('Origin', 'http://any-origin.com')

      expect(response.status).toBe(200)
      expect(response.headers['access-control-allow-origin']).toBe('*')
      // Wildcard should not have Vary: Origin
      expect(response.headers['vary']).toBeUndefined()
    })
  })

  describe('without CORS enabled', () => {
    let server: NaviosApplication
    let realServer: string

    const simple = builder().declareEndpoint({
      url: '/simple',
      method: 'GET',
      responseSchema: z.object({
        message: z.string(),
      }),
    })

    @Controller()
    class CorsController {
      @Endpoint(simple)
      async getSimple(_req: EndpointParams<typeof simple>) {
        return { message: 'Hello!' }
      }
    }

    @Module({
      controllers: [CorsController],
    })
    class CorsModule {}

    beforeAll(async () => {
      server = await NaviosFactory.create(CorsModule, {
        adapter: defineBunEnvironment(),
      })
      // Note: enableCors is NOT called
      await server.init()
      await server.listen({ port: 3017, host: 'localhost' })
      realServer = server.getServer().url.href
    })

    afterAll(async () => {
      await server.close()
    })

    it('should not return CORS headers when CORS is not enabled', async () => {
      const response = await supertest(realServer)
        .get('/simple')
        .set('Origin', 'http://example.com')

      expect(response.status).toBe(200)
      expect(response.headers['access-control-allow-origin']).toBeUndefined()
    })

    it('should not handle preflight when CORS is not enabled', async () => {
      const response = await supertest(realServer)
        .options('/simple')
        .set('Origin', 'http://example.com')
        .set('Access-Control-Request-Method', 'GET')

      // Preflight not handled, falls through to 404 (no OPTIONS handler)
      expect(response.status).toBe(404)
    })
  })
})
