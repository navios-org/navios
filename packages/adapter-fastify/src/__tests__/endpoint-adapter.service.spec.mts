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

import { FastifyEndpointAdapterService } from '../adapters/endpoint-adapter.service.mjs'

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

// Mock types for Fastify
interface MockFastifyRequest {
  query: Record<string, any>
  params: Record<string, any>
  body: any
}

interface MockFastifyReply {
  status: ReturnType<typeof vi.fn>
  headers: ReturnType<typeof vi.fn>
  send: ReturnType<typeof vi.fn>
}

const createMockRequest = (overrides: Partial<MockFastifyRequest> = {}): MockFastifyRequest => ({
  query: {},
  params: {},
  body: {},
  ...overrides,
})

const createMockReply = (): MockFastifyReply => ({
  status: vi.fn().mockReturnThis(),
  headers: vi.fn().mockReturnThis(),
  send: vi.fn().mockReturnThis(),
})

const createHandlerMetadata = (
  config: Partial<EndpointOptions>,
  classMethod = 'test',
): HandlerMetadata<EndpointOptions> => ({
  classMethod,
  url: config.url ?? '',
  successStatusCode: 200,
  adapterToken: null,
  headers: {},
  httpMethod: config.method ?? 'GET',
  config: config as EndpointOptions,
  guards: new Set(),
  customAttributes: new Map(),
})

const createHandlerContext = (
  handlerMetadata: HandlerMetadata<EndpointOptions>,
  overrides: Partial<HandlerContext<EndpointOptions>> = {},
): HandlerContext<EndpointOptions> => ({
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
class TestFastifyEndpointAdapter extends FastifyEndpointAdapterService {
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
}

describe('FastifyEndpointAdapterService', () => {
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

      const adapter = await container.get(FastifyEndpointAdapterService)
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
        responseSchema: z.object({ id: z.string() }),
      })

      expect(adapter.hasSchema(handlerMetadata)).toBe(true)
    })

    it('should return false when validateResponses is false', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(FastifyEndpointAdapterService)
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
        responseSchema: z.object({ id: z.string() }),
      })

      expect(adapter.hasSchema(handlerMetadata)).toBe(false)
    })

    it('should return true when requestSchema exists', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(FastifyEndpointAdapterService)
      const handlerMetadata = createHandlerMetadata({
        method: 'POST',
        url: '/test',
        requestSchema: z.object({ name: z.string() }),
      })

      expect(adapter.hasSchema(handlerMetadata)).toBe(true)
    })

    it('should return true when querySchema exists', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(FastifyEndpointAdapterService)
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
        querySchema: z.object({ page: z.number() }),
      })

      expect(adapter.hasSchema(handlerMetadata)).toBe(true)
    })

    it('should return false when no schemas exist', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(FastifyEndpointAdapterService)
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
      })

      expect(adapter.hasSchema(handlerMetadata)).toBe(false)
    })
  })

  describe('provideSchema', () => {
    it('should include response schema when validateResponses is true', async () => {
      bindNaviosOptions(container, { validateResponses: true })

      const adapter = await container.get(FastifyEndpointAdapterService)
      const responseSchema = z.object({ id: z.string() })
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
        responseSchema,
      })

      const schema = adapter.provideSchema(handlerMetadata)

      expect(schema.response).toBeDefined()
      expect(schema.response[200]).toBe(responseSchema)
    })

    it('should include error schema in response when provided', async () => {
      bindNaviosOptions(container, { validateResponses: true })

      const adapter = await container.get(FastifyEndpointAdapterService)
      const responseSchema = z.object({ id: z.string() })
      const errorSchema = { 400: z.object({ error: z.string() }) }
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
        responseSchema,
        errorSchema,
      })

      const schema = adapter.provideSchema(handlerMetadata)

      expect(schema.response[400]).toBe(errorSchema[400])
      expect(schema.response[200]).toBe(responseSchema)
    })

    it('should include body schema when requestSchema is provided', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(FastifyEndpointAdapterService)
      const requestSchema = z.object({ name: z.string() })
      const handlerMetadata = createHandlerMetadata({
        method: 'POST',
        url: '/test',
        requestSchema,
      })

      const schema = adapter.provideSchema(handlerMetadata)

      expect(schema.body).toBe(requestSchema)
    })

    it('should include querystring schema when querySchema is provided', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(FastifyEndpointAdapterService)
      const querySchema = z.object({ page: z.number() })
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
        querySchema,
      })

      const schema = adapter.provideSchema(handlerMetadata)

      expect(schema.querystring).toBe(querySchema)
    })
  })

  describe('createStaticHandler', () => {
    it('should create static handler with arguments', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(TestFastifyEndpointAdapter)
      const boundMethod = vi.fn().mockResolvedValue({ id: '123' })
      const formatArguments = vi.fn().mockResolvedValue({ data: { name: 'test' } })
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
      })
      const context = createHandlerContext(handlerMetadata, {
        headers: { 'x-custom': 'value' },
        hasArguments: true,
      })

      const result = adapter.testCreateStaticHandler(boundMethod, formatArguments, context)

      expect(result.isStatic).toBe(true)
      expect(typeof result.handler).toBe('function')

      const request = createMockRequest()
      const reply = createMockReply()

      await result.handler(request as any, reply as any)

      expect(formatArguments).toHaveBeenCalledWith(request)
      expect(boundMethod).toHaveBeenCalledWith({ data: { name: 'test' } })
      expect(reply.status).toHaveBeenCalledWith(200)
      expect(reply.headers).toHaveBeenCalledWith({ 'x-custom': 'value' })
      expect(reply.send).toHaveBeenCalledWith({ id: '123' })
    })

    it('should create static handler without arguments', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(TestFastifyEndpointAdapter)
      const boundMethod = vi.fn().mockResolvedValue({ message: 'hello' })
      const formatArguments = vi.fn()
      const handlerMetadata = createHandlerMetadata({
        method: 'POST',
        url: '/test',
      })
      handlerMetadata.successStatusCode = 201
      const context = createHandlerContext(handlerMetadata, {
        statusCode: 201,
        hasArguments: false,
      })

      const result = adapter.testCreateStaticHandler(boundMethod, formatArguments, context)

      expect(result.isStatic).toBe(true)

      const request = createMockRequest()
      const reply = createMockReply()

      await result.handler(request as any, reply as any)

      expect(formatArguments).not.toHaveBeenCalled()
      expect(boundMethod).toHaveBeenCalledWith(expect.any(Object))
      expect(reply.status).toHaveBeenCalledWith(201)
      expect(reply.send).toHaveBeenCalledWith({ message: 'hello' })
    })
  })

  describe('createDynamicHandler', () => {
    it('should create dynamic handler with arguments', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(TestFastifyEndpointAdapter)
      const mockController = {
        testMethod: vi.fn().mockResolvedValue({ id: '123' }),
      }
      const resolution: InstanceResolution = {
        cached: false,
        instance: null,
        resolve: vi.fn().mockResolvedValue(mockController),
      }
      const formatArguments = vi.fn().mockResolvedValue({ data: { name: 'test' } })
      const handlerMetadata = createHandlerMetadata(
        {
          method: 'GET',
          url: '/test',
        },
        'testMethod',
      )
      const context = createHandlerContext(handlerMetadata, {
        headers: { 'x-custom': 'value' },
        hasArguments: true,
      })

      const result = adapter.testCreateDynamicHandler(resolution, formatArguments, context)

      expect(result.isStatic).toBe(false)
      expect(typeof result.handler).toBe('function')

      const scopedContainer = {}
      const request = createMockRequest()
      const reply = createMockReply()

      await result.handler(scopedContainer as any, request as any, reply as any)

      expect(resolution.resolve).toHaveBeenCalledWith(scopedContainer)
      expect(formatArguments).toHaveBeenCalledWith(request)
      expect(mockController.testMethod).toHaveBeenCalledWith({
        data: { name: 'test' },
      })
      expect(reply.status).toHaveBeenCalledWith(200)
      expect(reply.headers).toHaveBeenCalledWith({ 'x-custom': 'value' })
      expect(reply.send).toHaveBeenCalledWith({ id: '123' })
    })

    it('should create dynamic handler without arguments', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(TestFastifyEndpointAdapter)
      const mockController = {
        noArgsMethod: vi.fn().mockResolvedValue({ status: 'ok' }),
      }
      const resolution: InstanceResolution = {
        cached: false,
        instance: null,
        resolve: vi.fn().mockResolvedValue(mockController),
      }
      const formatArguments = vi.fn()
      const handlerMetadata = createHandlerMetadata(
        {
          method: 'DELETE',
          url: '/test',
        },
        'noArgsMethod',
      )
      handlerMetadata.successStatusCode = 204
      const context = createHandlerContext(handlerMetadata, {
        statusCode: 204,
        hasArguments: false,
      })

      const result = adapter.testCreateDynamicHandler(resolution, formatArguments, context)

      expect(result.isStatic).toBe(false)

      const scopedContainer = {}
      const request = createMockRequest()
      const reply = createMockReply()

      await result.handler(scopedContainer as any, request as any, reply as any)

      expect(resolution.resolve).toHaveBeenCalledWith(scopedContainer)
      expect(formatArguments).not.toHaveBeenCalled()
      expect(mockController.noArgsMethod).toHaveBeenCalledWith(expect.any(Object))
      expect(reply.status).toHaveBeenCalledWith(204)
      expect(reply.send).toHaveBeenCalledWith({ status: 'ok' })
    })
  })
})
