import type { EndpointParams } from '@navios/core'
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-node'
import type { ExportResult } from '@opentelemetry/core'

import { builder } from '@navios/builder'
import {
  Controller,
  Endpoint,
  Module,
  NaviosApplication,
  NaviosFactory,
} from '@navios/core'
import { defineBunEnvironment } from '@navios/adapter-bun'
import type { BunEnvironment } from '@navios/adapter-bun'
import {
  NodeTracerProvider,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-node'
import { ExportResultCode } from '@opentelemetry/core'
import { Resource } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions'
import { trace, context as otelContext } from '@opentelemetry/api'

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import supertest from 'supertest'
import { z } from 'zod/v4'

import { defineOtelPlugin } from '../src/index.mjs'

/**
 * In-memory span exporter for testing.
 * Collects all exported spans so we can verify them in tests.
 */
class TestSpanExporter implements SpanExporter {
  private spans: ReadableSpan[] = []

  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void,
  ): void {
    this.spans.push(...spans)
    resultCallback({ code: ExportResultCode.SUCCESS })
  }

  shutdown(): Promise<void> {
    return Promise.resolve()
  }

  forceFlush(): Promise<void> {
    return Promise.resolve()
  }

  getSpans(): ReadableSpan[] {
    return this.spans
  }

  reset(): void {
    this.spans = []
  }
}

describe('Span Collection Verification', () => {
  let server: NaviosApplication<BunEnvironment>
  let realServer: string
  let testExporter: TestSpanExporter
  let tracerProvider: NodeTracerProvider

  const userEndpoint = builder().declareEndpoint({
    url: '/users/$id',
    method: 'GET',
    responseSchema: z.object({
      id: z.string(),
      name: z.string(),
    }),
  })

  const healthEndpoint = builder().declareEndpoint({
    url: '/health',
    method: 'GET',
    responseSchema: z.object({
      status: z.string(),
    }),
  })

  const createEndpoint = builder().declareEndpoint({
    url: '/users',
    method: 'POST',
    requestSchema: z.object({
      name: z.string(),
    }),
    responseSchema: z.object({
      id: z.string(),
      name: z.string(),
    }),
  })

  @Controller()
  class UserController {
    @Endpoint(userEndpoint)
    async getUser(req: EndpointParams<typeof userEndpoint>) {
      return {
        id: req.urlParams.id as string,
        name: 'Test User',
      }
    }

    @Endpoint(healthEndpoint)
    async health(_req: EndpointParams<typeof healthEndpoint>) {
      return { status: 'ok' }
    }

    @Endpoint(createEndpoint)
    async createUser(req: EndpointParams<typeof createEndpoint>) {
      return {
        id: 'new-user-123',
        name: req.data.name,
      }
    }
  }

  @Module({
    controllers: [UserController],
  })
  class TestModule {}

  beforeAll(async () => {
    // Disable any existing global tracer provider to ensure test isolation
    // This is needed when running multiple test files that register their own providers
    trace.disable()
    otelContext.disable()

    // Create test exporter
    testExporter = new TestSpanExporter()

    // Create and register tracer provider with our test exporter BEFORE creating the app
    tracerProvider = new NodeTracerProvider({
      resource: new Resource({
        [ATTR_SERVICE_NAME]: 'span-collection-test',
      }),
    })
    tracerProvider.addSpanProcessor(new SimpleSpanProcessor(testExporter))
    tracerProvider.register()

    server = await NaviosFactory.create<BunEnvironment>(TestModule, {
      adapter: defineBunEnvironment(),
    })

    // Register OTel plugins with 'none' exporter since we already registered our own
    for (const plugin of defineOtelPlugin({
      serviceName: 'span-collection-test',
      exporter: 'none', // We've already set up our test exporter
      autoInstrument: {
        http: true,
        handlers: true,
      },
      ignoreRoutes: ['/health'],
      includeNaviosAttributes: true, // Enable navios attributes for testing
    })) {
      server.usePlugin(plugin)
    }

    await server.init()
    await server.listen({ port: 3004, hostname: 'localhost' })
    realServer = server.getServer().url.href
  })

  afterAll(async () => {
    await server.close()
    await tracerProvider.shutdown()
  })

  beforeEach(() => {
    // Clear collected spans before each test
    testExporter.reset()
  })

  describe('HTTP span creation', () => {
    it('should create a span for GET request with correct attributes', async () => {
      const response = await supertest(realServer).get('/users/123')
      expect(response.status).toBe(200)

      // Wait a bit for spans to be exported
      await new Promise((resolve) => setTimeout(resolve, 50))

      const spans = testExporter.getSpans()
      expect(spans.length).toBeGreaterThan(0)

      // Find the HTTP span
      const httpSpan = spans.find((span) =>
        span.name.startsWith('HTTP GET')
      )
      expect(httpSpan).toBeDefined()

      if (httpSpan) {
        const attributes = httpSpan.attributes

        // Verify standard HTTP attributes
        expect(attributes['http.method']).toBe('GET')
        expect(attributes['http.route']).toBe('/users/:id')
        expect(attributes['http.status_code']).toBe(200)

        // Verify Navios-specific attributes (since includeNaviosAttributes: true)
        expect(attributes['navios.controller']).toBe('UserController')
        expect(attributes['navios.handler']).toBe('getUser')
      }
    })

    it('should create a span for POST request with correct attributes', async () => {
      const response = await supertest(realServer)
        .post('/users')
        .send({ name: 'New User' })
        .set('Content-Type', 'application/json')

      expect(response.status).toBe(200)

      // Wait a bit for spans to be exported
      await new Promise((resolve) => setTimeout(resolve, 50))

      const spans = testExporter.getSpans()
      expect(spans.length).toBeGreaterThan(0)

      // Find the HTTP span
      const httpSpan = spans.find((span) =>
        span.name.startsWith('HTTP POST')
      )
      expect(httpSpan).toBeDefined()

      if (httpSpan) {
        const attributes = httpSpan.attributes

        // Verify standard HTTP attributes
        expect(attributes['http.method']).toBe('POST')
        expect(attributes['http.route']).toBe('/users')
        expect(attributes['http.status_code']).toBe(200)

        // Verify Navios-specific attributes
        expect(attributes['navios.controller']).toBe('UserController')
        expect(attributes['navios.handler']).toBe('createUser')
      }
    })

    it('should NOT create a span for ignored routes', async () => {
      const response = await supertest(realServer).get('/health')
      expect(response.status).toBe(200)

      // Wait a bit for spans to be exported
      await new Promise((resolve) => setTimeout(resolve, 50))

      const spans = testExporter.getSpans()

      // Should not have any HTTP span for /health
      const healthSpan = spans.find((span) =>
        span.name.includes('/health')
      )
      expect(healthSpan).toBeUndefined()
    })

    it('should NOT create spans for 404 (unregistered routes)', async () => {
      // 404 for unknown routes are handled by Bun's router before reaching
      // our traced handlers, so no spans are created
      const response = await supertest(realServer).get('/nonexistent')
      expect(response.status).toBe(404)

      // Wait a bit for any potential spans
      await new Promise((resolve) => setTimeout(resolve, 50))

      const spans = testExporter.getSpans()

      // No span should be created for unknown routes
      const notFoundSpan = spans.find((span) =>
        span.name.includes('/nonexistent')
      )
      expect(notFoundSpan).toBeUndefined()
    })
  })

  describe('Concurrent requests span isolation', () => {
    it('should create separate spans for concurrent requests', async () => {
      // Make multiple concurrent requests
      const requests = [
        supertest(realServer).get('/users/1'),
        supertest(realServer).get('/users/2'),
        supertest(realServer).get('/users/3'),
      ]

      const responses = await Promise.all(requests)
      responses.forEach((r) => expect(r.status).toBe(200))

      // Wait for spans to be exported
      await new Promise((resolve) => setTimeout(resolve, 100))

      const spans = testExporter.getSpans()

      // Should have at least 3 HTTP spans
      const httpSpans = spans.filter((span) =>
        span.name.startsWith('HTTP GET /users')
      )
      expect(httpSpans.length).toBeGreaterThanOrEqual(3)

      // Each span should have a unique trace ID or span ID
      const spanIds = httpSpans.map((span) => span.spanContext().spanId)
      const uniqueSpanIds = new Set(spanIds)
      expect(uniqueSpanIds.size).toBe(spanIds.length)
    })
  })

  describe('Span naming', () => {
    it('should use route pattern in span name (not actual URL params)', async () => {
      await supertest(realServer).get('/users/specific-user-id-123')

      // Wait for spans to be exported
      await new Promise((resolve) => setTimeout(resolve, 50))

      const spans = testExporter.getSpans()
      const httpSpan = spans.find((span) => span.name.startsWith('HTTP GET'))

      expect(httpSpan).toBeDefined()
      // Should use route pattern, not actual ID
      expect(httpSpan?.name).toBe('HTTP GET /users/:id')
    })
  })
})
