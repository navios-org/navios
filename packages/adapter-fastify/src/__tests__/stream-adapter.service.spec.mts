import type { BaseEndpointOptions } from '@navios/builder'
import type {
  HandlerMetadata,
  InstanceResolution,
  NaviosApplicationOptions,
} from '@navios/core'

import { NaviosOptionsToken } from '@navios/core'
import { Injectable } from '@navios/di'
import { TestContainer } from '@navios/di/testing'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import {
  FastifyStreamAdapterService,
  FastifyStreamAdapterToken,
} from '../adapters/stream-adapter.service.mjs'

/**
 * Binds NaviosOptionsToken with partial options for testing.
 * Only validateResponses is needed for adapter tests.
 */
const bindNaviosOptions = (
  container: TestContainer,
  options: Partial<NaviosApplicationOptions>,
) => {
  container
    .bind(NaviosOptionsToken)
    .toValue(options as NaviosApplicationOptions)
}

const createHandlerMetadata = (
  config: Partial<BaseEndpointOptions>,
  classMethod = 'test',
): HandlerMetadata<BaseEndpointOptions> => ({
  classMethod,
  url: config.url ?? '',
  successStatusCode: 200,
  adapterToken: null,
  headers: {},
  httpMethod: config.method ?? 'GET',
  config: config as BaseEndpointOptions,
  guards: new Set(),
  customAttributes: new Map(),
})

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
  type: ReturnType<typeof vi.fn>
}

const createMockRequest = (
  overrides: Partial<MockFastifyRequest> = {},
): MockFastifyRequest => ({
  query: {},
  params: {},
  body: {},
  ...overrides,
})

const createMockReply = (): MockFastifyReply => ({
  status: vi.fn().mockReturnThis(),
  headers: vi.fn().mockReturnThis(),
  send: vi.fn().mockReturnThis(),
  type: vi.fn().mockReturnThis(),
})

/**
 * Test adapter that exposes protected methods for testing
 */
@Injectable()
class TestFastifyStreamAdapter extends FastifyStreamAdapterService {
  testCreateStaticHandler(
    boundMethod: (...args: any[]) => Promise<any>,
    formatArguments: (request: any) => Promise<any>,
    context: any,
  ) {
    return this.createStaticHandler(boundMethod, formatArguments, context)
  }

  testCreateDynamicHandler(
    resolution: InstanceResolution,
    formatArguments: (request: any) => Promise<any>,
    context: any,
  ) {
    return this.createDynamicHandler(resolution, formatArguments, context)
  }
}

describe('FastifyStreamAdapterService', () => {
  let container: TestContainer

  beforeEach(() => {
    container = new TestContainer()
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe('hasSchema', () => {
    it('should return true when requestSchema exists', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(FastifyStreamAdapterToken)
      const handlerMetadata = createHandlerMetadata({
        method: 'POST',
        url: '/stream',
        requestSchema: z.object({ data: z.string() }),
      })

      expect(adapter.hasSchema(handlerMetadata)).toBe(true)
    })

    it('should return true when querySchema exists', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(FastifyStreamAdapterToken)
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/stream',
        querySchema: z.object({ id: z.string() }),
      })

      expect(adapter.hasSchema(handlerMetadata)).toBe(true)
    })

    it('should return false when no schemas exist', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(FastifyStreamAdapterToken)
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/stream',
      })

      expect(adapter.hasSchema(handlerMetadata)).toBe(false)
    })
  })

  describe('provideSchema', () => {
    it('should include querystring schema when provided', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(FastifyStreamAdapterToken)
      const querySchema = z.object({ id: z.string() })
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/stream',
        querySchema,
      })

      const schema = adapter.provideSchema(handlerMetadata)

      expect(schema.querystring).toBe(querySchema)
    })

    it('should include body schema when requestSchema is provided', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(FastifyStreamAdapterToken)
      const requestSchema = z.object({ data: z.string() })
      const handlerMetadata = createHandlerMetadata({
        method: 'POST',
        url: '/stream',
        requestSchema,
      })

      const schema = adapter.provideSchema(handlerMetadata)

      expect(schema.body).toBe(requestSchema)
    })
  })

  describe('createStaticHandler', () => {
    it('should create static handler that passes reply to method with arguments', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(TestFastifyStreamAdapter)
      const boundMethod = vi.fn().mockResolvedValue(undefined)
      const formatArguments = vi
        .fn()
        .mockResolvedValue({ data: { message: 'stream' } })
      const context = {
        hasArguments: true,
      }

      const result = adapter.testCreateStaticHandler(
        boundMethod,
        formatArguments,
        context,
      )

      expect(result.isStatic).toBe(true)
      expect(typeof result.handler).toBe('function')

      const request = createMockRequest()
      const reply = createMockReply()

      await result.handler(request as any, reply as any)

      expect(formatArguments).toHaveBeenCalledWith(request)
      expect(boundMethod).toHaveBeenCalledWith(
        { data: { message: 'stream' } },
        reply,
      )
    })

    it('should create static handler that passes reply to method without arguments', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(TestFastifyStreamAdapter)
      const boundMethod = vi.fn().mockResolvedValue(undefined)
      const formatArguments = vi.fn()
      const context = {
        hasArguments: false,
      }

      const result = adapter.testCreateStaticHandler(
        boundMethod,
        formatArguments,
        context,
      )

      expect(result.isStatic).toBe(true)

      const request = createMockRequest()
      const reply = createMockReply()

      await result.handler(request as any, reply as any)

      expect(formatArguments).not.toHaveBeenCalled()
      expect(boundMethod).toHaveBeenCalledWith(expect.any(Object), reply)
    })
  })

  describe('createDynamicHandler', () => {
    it('should create dynamic handler that passes reply to method with arguments', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(TestFastifyStreamAdapter)
      const mockController = {
        streamMethod: vi.fn().mockResolvedValue(undefined),
      }
      const resolution: InstanceResolution = {
        cached: false,
        instance: null,
        resolve: vi.fn().mockResolvedValue(mockController),
      }
      const formatArguments = vi
        .fn()
        .mockResolvedValue({ data: { channel: 'test' } })
      const context = {
        methodName: 'streamMethod',
        hasArguments: true,
      }

      const result = adapter.testCreateDynamicHandler(
        resolution,
        formatArguments,
        context,
      )

      expect(result.isStatic).toBe(false)
      expect(typeof result.handler).toBe('function')

      const scopedContainer = {}
      const request = createMockRequest()
      const reply = createMockReply()

      await result.handler(scopedContainer as any, request as any, reply as any)

      expect(resolution.resolve).toHaveBeenCalledWith(scopedContainer)
      expect(formatArguments).toHaveBeenCalledWith(request)
      expect(mockController.streamMethod).toHaveBeenCalledWith(
        { data: { channel: 'test' } },
        reply,
      )
    })

    it('should create dynamic handler that passes reply to method without arguments', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(TestFastifyStreamAdapter)
      const mockController = {
        noArgsStream: vi.fn().mockResolvedValue(undefined),
      }
      const resolution: InstanceResolution = {
        cached: false,
        instance: null,
        resolve: vi.fn().mockResolvedValue(mockController),
      }
      const formatArguments = vi.fn()
      const context = {
        methodName: 'noArgsStream',
        hasArguments: false,
      }

      const result = adapter.testCreateDynamicHandler(
        resolution,
        formatArguments,
        context,
      )

      expect(result.isStatic).toBe(false)

      const scopedContainer = {}
      const request = createMockRequest()
      const reply = createMockReply()

      await result.handler(scopedContainer as any, request as any, reply as any)

      expect(resolution.resolve).toHaveBeenCalledWith(scopedContainer)
      expect(formatArguments).not.toHaveBeenCalled()
      expect(mockController.noArgsStream).toHaveBeenCalledWith(
        expect.any(Object),
        reply,
      )
    })
  })
})
