import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Span } from '@opentelemetry/api'

import type { ResolvedOtelConfig, SpanFactoryService, TraceContextService } from '@navios/otel'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { FastifyOtelPluginOptions } from '../interfaces/index.mjs'

import { createOnRequestHook } from '../hooks/on-request.hook.mjs'
import { createOnResponseHook } from '../hooks/on-response.hook.mjs'
import { createOnErrorHook } from '../hooks/on-error.hook.mjs'

describe('onRequest hook', () => {
  let mockTraceContext: TraceContextService
  let mockSpanFactory: SpanFactoryService
  let mockSpan: Span
  let mockConfig: ResolvedOtelConfig
  let mockOptions: FastifyOtelPluginOptions

  beforeEach(() => {
    mockSpan = {
      setAttribute: vi.fn(),
      setStatus: vi.fn(),
      recordException: vi.fn(),
      end: vi.fn(),
    } as unknown as Span

    mockTraceContext = {
      extractFromHeaders: vi.fn().mockReturnValue({}),
    } as unknown as TraceContextService

    mockSpanFactory = {
      createHttpSpan: vi.fn().mockReturnValue(mockSpan),
      setHttpResponse: vi.fn(),
      recordError: vi.fn(),
    } as unknown as SpanFactoryService

    mockConfig = {
      serviceName: 'test-service',
      exporter: 'none',
      autoInstrument: {
        http: true,
        handlers: false,
        guards: false,
      },
      metrics: {
        enabled: false,
        requestDuration: false,
        errorCount: false,
      },
      includeNaviosAttributes: false,
      sampling: {
        ratio: 1.0,
      },
    }

    mockOptions = {
      serviceName: 'test-service',
      exporter: 'none',
    }
  })

  describe('route ignoring', () => {
    it('should not create span for exact match ignored routes', async () => {
      mockOptions.ignoreRoutes = ['/health']
      const hook = createOnRequestHook(mockTraceContext, mockSpanFactory, mockConfig, mockOptions)

      const request = {
        url: '/health',
        method: 'GET',
        headers: {},
      } as FastifyRequest

      await hook(request, {} as FastifyReply)

      expect(mockSpanFactory.createHttpSpan).not.toHaveBeenCalled()
      expect(request.otelSpan).toBeUndefined()
    })

    it('should not create span for wildcard pattern ignored routes', async () => {
      mockOptions.ignoreRoutes = ['/api/internal/*']
      const hook = createOnRequestHook(mockTraceContext, mockSpanFactory, mockConfig, mockOptions)

      const request = {
        url: '/api/internal/health',
        method: 'GET',
        headers: {},
      } as FastifyRequest

      await hook(request, {} as FastifyReply)

      expect(mockSpanFactory.createHttpSpan).not.toHaveBeenCalled()
    })

    it('should create span for non-ignored routes', async () => {
      mockOptions.ignoreRoutes = ['/health']
      const hook = createOnRequestHook(mockTraceContext, mockSpanFactory, mockConfig, mockOptions)

      const request = {
        url: '/users',
        method: 'GET',
        headers: {},
        id: 'req-1',
        routeOptions: { url: '/users' },
      } as unknown as FastifyRequest

      await hook(request, {} as FastifyReply)

      expect(mockSpanFactory.createHttpSpan).toHaveBeenCalled()
      expect(request.otelSpan).toBe(mockSpan)
    })

    it('should create span when no ignore routes configured', async () => {
      const hook = createOnRequestHook(mockTraceContext, mockSpanFactory, mockConfig, mockOptions)

      const request = {
        url: '/health',
        method: 'GET',
        headers: {},
        id: 'req-1',
        routeOptions: { url: '/health' },
      } as unknown as FastifyRequest

      await hook(request, {} as FastifyReply)

      expect(mockSpanFactory.createHttpSpan).toHaveBeenCalled()
    })
  })

  describe('span creation', () => {
    it('should skip span creation when autoInstrument.http is false', async () => {
      mockConfig.autoInstrument.http = false
      const hook = createOnRequestHook(mockTraceContext, mockSpanFactory, mockConfig, mockOptions)

      const request = {
        url: '/users',
        method: 'GET',
        headers: {},
      } as FastifyRequest

      await hook(request, {} as FastifyReply)

      expect(mockSpanFactory.createHttpSpan).not.toHaveBeenCalled()
    })

    it('should create span with correct method and url', async () => {
      const hook = createOnRequestHook(mockTraceContext, mockSpanFactory, mockConfig, mockOptions)

      const request = {
        url: '/users/123',
        method: 'POST',
        headers: {},
        id: 'req-1',
        routeOptions: { url: '/users/:id' },
      } as unknown as FastifyRequest

      await hook(request, {} as FastifyReply)

      expect(mockSpanFactory.createHttpSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/users/123',
          route: '/users/$id',
        }),
      )
    })

    it('should extract parent context from headers', async () => {
      const hook = createOnRequestHook(mockTraceContext, mockSpanFactory, mockConfig, mockOptions)

      const headers = {
        traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
      }

      const request = {
        url: '/users',
        method: 'GET',
        headers,
        id: 'req-1',
        routeOptions: { url: '/users' },
      } as unknown as FastifyRequest

      await hook(request, {} as FastifyReply)

      expect(mockTraceContext.extractFromHeaders).toHaveBeenCalledWith(headers)
    })

    it('should add request ID as span attribute', async () => {
      const hook = createOnRequestHook(mockTraceContext, mockSpanFactory, mockConfig, mockOptions)

      const request = {
        url: '/users',
        method: 'GET',
        headers: {},
        id: 'req-123',
        routeOptions: { url: '/users' },
      } as unknown as FastifyRequest

      await hook(request, {} as FastifyReply)

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('http.request_id', 'req-123')
    })

    it('should add user-agent as span attribute when present', async () => {
      const hook = createOnRequestHook(mockTraceContext, mockSpanFactory, mockConfig, mockOptions)

      const request = {
        url: '/users',
        method: 'GET',
        headers: {
          'user-agent': 'Mozilla/5.0',
        },
        id: 'req-1',
        routeOptions: { url: '/users' },
      } as unknown as FastifyRequest

      await hook(request, {} as FastifyReply)

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('http.user_agent', 'Mozilla/5.0')
    })

    it('should store span on request object', async () => {
      const hook = createOnRequestHook(mockTraceContext, mockSpanFactory, mockConfig, mockOptions)

      const request = {
        url: '/users',
        method: 'GET',
        headers: {},
        id: 'req-1',
        routeOptions: { url: '/users' },
      } as unknown as FastifyRequest

      await hook(request, {} as FastifyReply)

      expect(request.otelSpan).toBe(mockSpan)
    })
  })
})

describe('onResponse hook', () => {
  let mockSpanFactory: SpanFactoryService
  let mockSpan: Span

  beforeEach(() => {
    mockSpan = {
      setAttribute: vi.fn(),
      setStatus: vi.fn(),
      recordException: vi.fn(),
      end: vi.fn(),
    } as unknown as Span

    mockSpanFactory = {
      setHttpResponse: vi.fn(),
    } as unknown as SpanFactoryService
  })

  it('should do nothing if no span on request', async () => {
    const hook = createOnResponseHook(mockSpanFactory)

    const request = {} as FastifyRequest
    const reply = { statusCode: 200 } as FastifyReply

    await hook(request, reply)

    expect(mockSpanFactory.setHttpResponse).not.toHaveBeenCalled()
  })

  it('should set HTTP response status on span', async () => {
    const hook = createOnResponseHook(mockSpanFactory)

    const request = { otelSpan: mockSpan } as unknown as FastifyRequest
    const reply = {
      statusCode: 200,
      getHeader: vi.fn().mockReturnValue(undefined),
    } as unknown as FastifyReply

    await hook(request, reply)

    expect(mockSpanFactory.setHttpResponse).toHaveBeenCalledWith(mockSpan, 200)
  })

  it('should add content-length attribute when available', async () => {
    const hook = createOnResponseHook(mockSpanFactory)

    const request = { otelSpan: mockSpan } as unknown as FastifyRequest
    const reply = {
      statusCode: 200,
      getHeader: vi.fn().mockReturnValue('1234'),
    } as unknown as FastifyReply

    await hook(request, reply)

    expect(mockSpan.setAttribute).toHaveBeenCalledWith('http.response_content_length', 1234)
  })

  it('should handle numeric content-length', async () => {
    const hook = createOnResponseHook(mockSpanFactory)

    const request = { otelSpan: mockSpan } as unknown as FastifyRequest
    const reply = {
      statusCode: 200,
      getHeader: vi.fn().mockReturnValue(5678),
    } as unknown as FastifyReply

    await hook(request, reply)

    expect(mockSpan.setAttribute).toHaveBeenCalledWith('http.response_content_length', 5678)
  })

  it('should end the span', async () => {
    const hook = createOnResponseHook(mockSpanFactory)

    const request = { otelSpan: mockSpan } as unknown as FastifyRequest
    const reply = {
      statusCode: 200,
      getHeader: vi.fn().mockReturnValue(undefined),
    } as unknown as FastifyReply

    await hook(request, reply)

    expect(mockSpan.end).toHaveBeenCalled()
  })
})

describe('onError hook', () => {
  let mockSpanFactory: SpanFactoryService
  let mockSpan: Span

  beforeEach(() => {
    mockSpan = {
      setAttribute: vi.fn(),
      setStatus: vi.fn(),
      recordException: vi.fn(),
      end: vi.fn(),
    } as unknown as Span

    mockSpanFactory = {
      recordError: vi.fn(),
    } as unknown as SpanFactoryService
  })

  it('should do nothing if no span on request', async () => {
    const hook = createOnErrorHook(mockSpanFactory)

    const request = {} as FastifyRequest
    const error = new Error('Test error')

    // @ts-expect-error - FastifyError is not assignable to Error
    await hook(request, {} as FastifyReply, error)

    expect(mockSpanFactory.recordError).not.toHaveBeenCalled()
  })

  it('should record error on span', async () => {
    const hook = createOnErrorHook(mockSpanFactory)

    const request = { otelSpan: mockSpan } as unknown as FastifyRequest
    const error = new Error('Test error')

    // @ts-expect-error - FastifyError is not assignable to Error
    await hook(request, {} as FastifyReply, error)

    expect(mockSpanFactory.recordError).toHaveBeenCalledWith(mockSpan, error)
  })
})
