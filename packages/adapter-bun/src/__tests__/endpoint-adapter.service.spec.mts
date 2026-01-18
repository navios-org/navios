import { NaviosOptionsToken } from '@navios/core'
import { Injectable } from '@navios/di'
import { TestContainer } from '@navios/di/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import type { EndpointOptions } from '@navios/builder'
import type {
  HandlerContext,
  HandlerMetadata,
  InstanceResolution,
  NaviosApplicationOptions,
} from '@navios/core'

import { BunEndpointAdapterService } from '../adapters/endpoint-adapter.service.mjs'

/**
 * Binds NaviosOptionsToken with partial options for testing.
 * Only validateResponses is needed for adapter tests.
 */
const bindNaviosOptions = (
  container: TestContainer,
  options: Partial<NaviosApplicationOptions>,
) => {
  container.bind(NaviosOptionsToken).toValue(options as NaviosApplicationOptions)
}

// Mock BunRequest type
interface MockBunRequest {
  url: string
  method: string
  headers: Headers
  json: () => Promise<any>
  text: () => Promise<string>
}

const createMockBunRequest = (overrides: Partial<MockBunRequest> = {}): MockBunRequest => ({
  url: 'http://localhost:3000/test',
  method: 'GET',
  headers: new Headers(),
  json: vi.fn().mockResolvedValue({}),
  text: vi.fn().mockResolvedValue(''),
  ...overrides,
})

const createHandlerMetadata = <T extends EndpointOptions>(
  config: Partial<T>,
  classMethod = 'test',
): HandlerMetadata<T> => ({
  classMethod,
  url: config.url ?? '',
  successStatusCode: 200,
  adapterToken: null,
  headers: {},
  httpMethod: config.method ?? 'GET',
  config: config as T,
  guards: new Set(),
  customAttributes: new Map(),
})

const createHandlerContext = <T extends EndpointOptions>(
  handlerMetadata: HandlerMetadata<T>,
  overrides: Partial<HandlerContext<T>> = {},
): HandlerContext<T> => ({
  methodName: handlerMetadata.classMethod,
  statusCode: handlerMetadata.successStatusCode,
  headers: handlerMetadata.headers,
  handlerMetadata,
  hasArguments: true,
  ...overrides,
})

/**
 * Test adapter that exposes protected methods for testing
 */
@Injectable()
class TestBunEndpointAdapter extends BunEndpointAdapterService {
  testBuildHeaders(context: HandlerContext<EndpointOptions>) {
    return this.buildHeaders(context)
  }

  testCreateStaticHandler(
    boundMethod: (...args: any[]) => Promise<any>,
    formatArguments: (request: any) => any,
    context: HandlerContext<EndpointOptions>,
  ) {
    return this.createStaticHandler(boundMethod, formatArguments, context)
  }

  testCreateDynamicHandler(
    resolution: InstanceResolution,
    formatArguments: (request: any) => any,
    context: HandlerContext<EndpointOptions>,
  ) {
    return this.createDynamicHandler(resolution, formatArguments, context)
  }

  testBuildResponseFormatter(context: HandlerContext<EndpointOptions>) {
    return this.buildResponseFormatter(context)
  }
}

describe('BunEndpointAdapterService', () => {
  let container: TestContainer

  beforeEach(() => {
    container = new TestContainer()
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe('hasSchema', () => {
    it('should return true when responseSchema exists and validateResponses is true', async () => {
      bindNaviosOptions(container, { validateResponses: true })

      const adapter = await container.get(BunEndpointAdapterService)
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
        responseSchema: z.object({ id: z.string() }),
      } as EndpointOptions)

      expect(adapter.hasSchema(handlerMetadata)).toBe(true)
    })

    it('should return false when validateResponses is false', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(BunEndpointAdapterService)
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
        responseSchema: z.object({ id: z.string() }),
      } as EndpointOptions)

      expect(adapter.hasSchema(handlerMetadata)).toBe(false)
    })

    it('should return true when requestSchema exists', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(BunEndpointAdapterService)
      const handlerMetadata = createHandlerMetadata({
        method: 'POST',
        url: '/test',
        requestSchema: z.object({ name: z.string() }),
      })

      expect(adapter.hasSchema(handlerMetadata)).toBe(true)
    })

    it('should return true when querySchema exists', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(BunEndpointAdapterService)
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
        querySchema: z.object({ page: z.number() }),
      })

      expect(adapter.hasSchema(handlerMetadata)).toBe(true)
    })

    it('should return false when no schemas exist', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(BunEndpointAdapterService)
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
      })

      expect(adapter.hasSchema(handlerMetadata)).toBe(false)
    })
  })

  describe('provideSchema', () => {
    it('should return empty object for Bun', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(BunEndpointAdapterService)
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
        requestSchema: z.object({ name: z.string() }),
        responseSchema: z.object({ id: z.string() }),
      } as EndpointOptions)

      const schema = adapter.provideSchema(handlerMetadata)

      expect(schema).toEqual({})
    })
  })

  describe('buildHeaders', () => {
    it('should include Content-Type application/json', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(TestBunEndpointAdapter)
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
        responseSchema: z.object({ id: z.string() }),
      } as EndpointOptions)
      handlerMetadata.headers = { 'X-Custom': 'value' }
      const context = createHandlerContext(handlerMetadata)

      const headers = adapter.testBuildHeaders(context)

      expect(headers['Content-Type']).toBe('application/json')
      expect(headers['X-Custom']).toBe('value')
    })
  })

  describe('createStaticHandler', () => {
    it('should create static handler that returns JSON response', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(TestBunEndpointAdapter)
      const boundMethod = vi.fn().mockResolvedValue({ id: '123', name: 'test' })
      const formatArguments = vi.fn().mockResolvedValue({ data: { input: 'value' } })
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
        responseSchema: z.object({ id: z.string(), name: z.string() }),
      } as EndpointOptions)
      const context = createHandlerContext(handlerMetadata, {
        hasArguments: true,
      })

      const result = adapter.testCreateStaticHandler(boundMethod, formatArguments, context)

      expect(result.isStatic).toBe(true)
      expect(typeof result.handler).toBe('function')

      const request = createMockBunRequest()
      const response = await result.handler(request as any)

      expect(response).toBeInstanceOf(Response)
      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('application/json')

      const body = await response.json()
      expect(body).toEqual({ id: '123', name: 'test' })
    })

    it('should validate response when responseSchema is provided', async () => {
      bindNaviosOptions(container, { validateResponses: true })

      const adapter = await container.get(TestBunEndpointAdapter)
      const responseSchema = z.object({
        id: z.string(),
        name: z.string(),
      })
      const boundMethod = vi.fn().mockResolvedValue({ id: '123', name: 'test' })
      const formatArguments = vi.fn().mockResolvedValue({})
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
        responseSchema,
      } as EndpointOptions)
      const context = createHandlerContext(handlerMetadata, {
        hasArguments: false,
      })

      const result = adapter.testCreateStaticHandler(boundMethod, formatArguments, context)
      const request = createMockBunRequest()
      const response = await result.handler(request as any)

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toEqual({ id: '123', name: 'test' })
    })

    it('should use custom status code', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(TestBunEndpointAdapter)
      const boundMethod = vi.fn().mockResolvedValue({ created: true })
      const formatArguments = vi.fn().mockResolvedValue({})
      const handlerMetadata = createHandlerMetadata({
        method: 'POST',
        url: '/test',
        responseSchema: z.object({ created: z.boolean() }),
      } as EndpointOptions)
      handlerMetadata.successStatusCode = 201
      const context = createHandlerContext(handlerMetadata, {
        statusCode: 201,
        hasArguments: false,
      })

      const result = adapter.testCreateStaticHandler(boundMethod, formatArguments, context)
      const request = createMockBunRequest()
      const response = await result.handler(request as any)

      expect(response.status).toBe(201)
    })
  })

  describe('createDynamicHandler', () => {
    it('should create dynamic handler that resolves controller', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(TestBunEndpointAdapter)
      const mockController = {
        testMethod: vi.fn().mockResolvedValue({ id: '456' }),
      }
      const resolution: InstanceResolution = {
        cached: false,
        instance: null,
        resolve: vi.fn().mockResolvedValue(mockController),
      }
      const formatArguments = vi.fn().mockResolvedValue({ data: { input: 'test' } })
      const handlerMetadata = createHandlerMetadata(
        {
          method: 'GET',
          url: '/test',
          responseSchema: z.object({ id: z.string() }),
        } as EndpointOptions,
        'testMethod',
      )
      const context = createHandlerContext(handlerMetadata, {
        hasArguments: true,
      })

      const result = adapter.testCreateDynamicHandler(resolution, formatArguments, context)

      expect(result.isStatic).toBe(false)
      expect(typeof result.handler).toBe('function')

      const scopedContainer = {}
      const request = createMockBunRequest()
      const response = await result.handler(scopedContainer as any, request as any)

      expect(resolution.resolve).toHaveBeenCalledWith(scopedContainer)
      expect(mockController.testMethod).toHaveBeenCalledWith({
        data: { input: 'test' },
      })
      expect(response).toBeInstanceOf(Response)
      expect(response.status).toBe(200)

      const body = await response.json()
      expect(body).toEqual({ id: '456' })
    })

    it('should validate response with schema in dynamic handler', async () => {
      bindNaviosOptions(container, { validateResponses: true })

      const adapter = await container.get(TestBunEndpointAdapter)
      const responseSchema = z.object({ id: z.string() })
      const mockController = {
        method: vi.fn().mockResolvedValue({ id: '789' }),
      }
      const resolution: InstanceResolution = {
        cached: false,
        instance: null,
        resolve: vi.fn().mockResolvedValue(mockController),
      }
      const formatArguments = vi.fn().mockResolvedValue({})
      const handlerMetadata = createHandlerMetadata(
        {
          method: 'GET',
          url: '/test',
          responseSchema,
        } as EndpointOptions,
        'method',
      )
      const context = createHandlerContext(handlerMetadata, {
        hasArguments: false,
      })

      const result = adapter.testCreateDynamicHandler(resolution, formatArguments, context)
      const request = createMockBunRequest()
      const response = await result.handler({} as any, request as any)

      const body = await response.json()
      expect(body).toEqual({ id: '789' })
    })
  })

  describe('buildResponseFormatter', () => {
    it('should return identity function when no responseSchema', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(TestBunEndpointAdapter)
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
        responseSchema: z.any(),
      } as EndpointOptions)
      // Remove responseSchema from config to test identity function
      ;(handlerMetadata.config as any).responseSchema = undefined
      const context = createHandlerContext(handlerMetadata)

      const formatter = adapter.testBuildResponseFormatter(context)
      const input = { foo: 'bar' }

      expect(formatter(input)).toBe(input)
    })

    it('should validate when responseSchema exists and validateResponses is true', async () => {
      bindNaviosOptions(container, { validateResponses: true })

      const adapter = await container.get(TestBunEndpointAdapter)
      const responseSchema = z.object({ id: z.string() })
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
        responseSchema,
      } as EndpointOptions)
      const context = createHandlerContext(handlerMetadata)

      const formatter = adapter.testBuildResponseFormatter(context)

      expect(formatter({ id: '123' })).toEqual({ id: '123' })
      expect(() => formatter({ id: 123 })).toThrow()
    })

    it('should skip validation when validateResponses is false', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(TestBunEndpointAdapter)
      const responseSchema = z.object({ id: z.string() })
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
        responseSchema,
      } as EndpointOptions)
      const context = createHandlerContext(handlerMetadata)

      const formatter = adapter.testBuildResponseFormatter(context)
      const input = { id: 123 } // Invalid according to schema

      // Should not throw because validation is disabled
      expect(formatter(input)).toBe(input)
    })
  })
})
