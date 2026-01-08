import type { HandlerMetadata } from '@navios/core'

import { InstanceResolverService, StreamAdapterToken } from '@navios/core'
import { TestContainer } from '@navios/di/testing'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import type { BaseXmlStreamConfig } from '../types/config.mjs'

import { XmlStreamAdapterService } from '../adapters/xml-stream-adapter.service.mjs'

const createHandlerMetadata = (
  config: Partial<BaseXmlStreamConfig>,
  classMethod = 'test',
): HandlerMetadata<BaseXmlStreamConfig> => ({
  classMethod,
  url: config.url ?? '',
  successStatusCode: 200,
  adapterToken: null,
  headers: {},
  httpMethod: config.method ?? 'GET',
  config: config as unknown as BaseXmlStreamConfig,
  guards: new Set(),
  customAttributes: new Map(),
})

// Mock renderToXml
vi.mock('../runtime/render-to-xml.mjs', () => ({
  renderToXml: vi
    .fn()
    .mockResolvedValue(
      '<?xml version="1.0" encoding="UTF-8"?><root>content</root>',
    ),
}))

// Mock stream adapter factory
const createMockStreamAdapter = () => ({
  prepareArguments: vi.fn().mockReturnValue([]),
  buildFormatArguments: vi.fn().mockReturnValue(async () => ({})),
  provideSchema: vi.fn().mockReturnValue({}),
  hasSchema: vi.fn().mockReturnValue(false),
  provideHandler: vi
    .fn()
    .mockResolvedValue({ isStatic: false, handler: vi.fn() }),
})

// Mock instance resolver factory
const createMockInstanceResolver = (controller: any, cached = true) => ({
  resolve: vi
    .fn()
    .mockResolvedValue(
      cached
        ? { cached: true, instance: controller }
        : { cached: false, resolve: vi.fn().mockResolvedValue(controller) },
    ),
})

describe('XmlStreamAdapterService', () => {
  let container: TestContainer
  let mockStreamAdapter: ReturnType<typeof createMockStreamAdapter>
  let mockController: any

  beforeEach(() => {
    container = new TestContainer()
    mockStreamAdapter = createMockStreamAdapter()
    mockController = {
      testMethod: vi
        .fn()
        .mockResolvedValue({ type: 'element', tag: 'root', children: [] }),
    }
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe('prepareArguments', () => {
    it('should proxy to stream adapter', async () => {
      container.bind(StreamAdapterToken).toValue(mockStreamAdapter as any)
      container
        .bind(InstanceResolverService)
        .toValue(createMockInstanceResolver(mockController) as any)

      const adapter = await container.get(XmlStreamAdapterService)
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
      })

      mockStreamAdapter.prepareArguments.mockReturnValue([() => {}])

      const result = adapter.prepareArguments(handlerMetadata)

      expect(mockStreamAdapter.prepareArguments).toHaveBeenCalledWith(
        handlerMetadata,
      )
      expect(result).toHaveLength(1)
    })

    it('should return empty array when stream adapter has no prepareArguments', async () => {
      const adapterWithoutPrepare = {
        buildFormatArguments: vi.fn(),
        provideHandler: vi.fn(),
      }
      container.bind(StreamAdapterToken).toValue(adapterWithoutPrepare as any)
      container
        .bind(InstanceResolverService)
        .toValue(createMockInstanceResolver(mockController) as any)

      const adapter = await container.get(XmlStreamAdapterService)
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
      })

      const result = adapter.prepareArguments(handlerMetadata)

      expect(result).toEqual([])
    })
  })

  describe('buildFormatArguments', () => {
    it('should proxy to stream adapter', async () => {
      container.bind(StreamAdapterToken).toValue(mockStreamAdapter as any)
      container
        .bind(InstanceResolverService)
        .toValue(createMockInstanceResolver(mockController) as any)

      const adapter = await container.get(XmlStreamAdapterService)
      const getters = [() => {}]

      const formatFn = vi.fn().mockResolvedValue({ data: 'test' })
      mockStreamAdapter.buildFormatArguments.mockReturnValue(formatFn)

      const result = adapter.buildFormatArguments(getters as any)

      expect(mockStreamAdapter.buildFormatArguments).toHaveBeenCalledWith(
        getters,
      )
      expect(result).toBe(formatFn)
    })

    it('should return empty object function when stream adapter has no buildFormatArguments', async () => {
      const adapterWithoutBuild = { provideHandler: vi.fn() }
      container.bind(StreamAdapterToken).toValue(adapterWithoutBuild as any)
      container
        .bind(InstanceResolverService)
        .toValue(createMockInstanceResolver(mockController) as any)

      const adapter = await container.get(XmlStreamAdapterService)

      const result = adapter.buildFormatArguments([])

      expect(await result({} as any)).toEqual({})
    })
  })

  describe('provideSchema', () => {
    it('should proxy to stream adapter', async () => {
      container.bind(StreamAdapterToken).toValue(mockStreamAdapter as any)
      container
        .bind(InstanceResolverService)
        .toValue(createMockInstanceResolver(mockController) as any)

      const adapter = await container.get(XmlStreamAdapterService)
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
        querySchema: z.object({ id: z.string() }),
      } as unknown as BaseXmlStreamConfig)

      const expectedSchema = { querystring: {} }
      mockStreamAdapter.provideSchema.mockReturnValue(expectedSchema)

      const result = adapter.provideSchema(handlerMetadata)

      expect(mockStreamAdapter.provideSchema).toHaveBeenCalledWith(
        handlerMetadata,
      )
      expect(result).toBe(expectedSchema)
    })

    it('should return empty object when stream adapter has no provideSchema', async () => {
      const adapterWithoutProvideSchema = {
        prepareArguments: vi.fn(),
        provideHandler: vi.fn(),
      }
      container
        .bind(StreamAdapterToken)
        .toValue(adapterWithoutProvideSchema as any)
      container
        .bind(InstanceResolverService)
        .toValue(createMockInstanceResolver(mockController) as any)

      const adapter = await container.get(XmlStreamAdapterService)
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
      })

      const result = adapter.provideSchema(handlerMetadata)

      expect(result).toEqual({})
    })
  })

  describe('hasSchema', () => {
    it('should proxy to stream adapter', async () => {
      container.bind(StreamAdapterToken).toValue(mockStreamAdapter as any)
      container
        .bind(InstanceResolverService)
        .toValue(createMockInstanceResolver(mockController) as any)

      const adapter = await container.get(XmlStreamAdapterService)
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
        querySchema: z.object({ id: z.string() }),
      } as unknown as BaseXmlStreamConfig)

      mockStreamAdapter.hasSchema.mockReturnValue(true)

      const result = adapter.hasSchema(handlerMetadata)

      expect(mockStreamAdapter.hasSchema).toHaveBeenCalledWith(handlerMetadata)
      expect(result).toBe(true)
    })

    it('should return false when no schema', async () => {
      container.bind(StreamAdapterToken).toValue(mockStreamAdapter as any)
      container
        .bind(InstanceResolverService)
        .toValue(createMockInstanceResolver(mockController) as any)

      const adapter = await container.get(XmlStreamAdapterService)
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
      })

      mockStreamAdapter.hasSchema.mockReturnValue(false)

      const result = adapter.hasSchema(handlerMetadata)

      expect(result).toBe(false)
    })

    it('should return false when stream adapter has no hasSchema', async () => {
      const adapterWithoutHasSchema = { provideHandler: vi.fn() }
      container.bind(StreamAdapterToken).toValue(adapterWithoutHasSchema as any)
      container
        .bind(InstanceResolverService)
        .toValue(createMockInstanceResolver(mockController) as any)

      const adapter = await container.get(XmlStreamAdapterService)
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
      })

      const result = adapter.hasSchema(handlerMetadata)

      expect(result).toBe(false)
    })
  })

  describe('provideHandler', () => {
    it('should create dynamic handler with cached controller', async () => {
      container.bind(StreamAdapterToken).toValue(mockStreamAdapter as any)
      container
        .bind(InstanceResolverService)
        .toValue(createMockInstanceResolver(mockController, true) as any)

      const adapter = await container.get(XmlStreamAdapterService)
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
        xmlDeclaration: true,
        encoding: 'UTF-8',
      } as BaseXmlStreamConfig)
      handlerMetadata.classMethod = 'testMethod'

      class TestController {}

      mockStreamAdapter.buildFormatArguments.mockReturnValue(async () => ({
        data: 'test',
      }))

      const result = await adapter.provideHandler(
        TestController,
        handlerMetadata,
      )

      expect(result.isStatic).toBe(false)
      expect(typeof result.handler).toBe('function')
    })

    it('should create dynamic handler with non-cached controller', async () => {
      container.bind(StreamAdapterToken).toValue(mockStreamAdapter as any)
      container
        .bind(InstanceResolverService)
        .toValue(createMockInstanceResolver(mockController, false) as any)

      const adapter = await container.get(XmlStreamAdapterService)
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
      })
      handlerMetadata.classMethod = 'testMethod'

      class TestController {}

      mockStreamAdapter.buildFormatArguments.mockReturnValue(async () => ({}))

      const result = await adapter.provideHandler(
        TestController,
        handlerMetadata,
      )

      expect(result.isStatic).toBe(false)
      expect(typeof result.handler).toBe('function')
    })

    it('should use default content type application/xml', async () => {
      container.bind(StreamAdapterToken).toValue(mockStreamAdapter as any)
      container
        .bind(InstanceResolverService)
        .toValue(createMockInstanceResolver(mockController) as any)

      const adapter = await container.get(XmlStreamAdapterService)
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
        // No contentType specified
      })
      handlerMetadata.classMethod = 'testMethod'

      class TestController {}

      mockStreamAdapter.buildFormatArguments.mockReturnValue(async () => ({}))

      const result = await adapter.provideHandler(
        TestController,
        handlerMetadata,
      )

      // Handler should be created successfully
      expect(result.isStatic).toBe(false)
    })

    it('should use custom content type when specified', async () => {
      container.bind(StreamAdapterToken).toValue(mockStreamAdapter as any)
      container
        .bind(InstanceResolverService)
        .toValue(createMockInstanceResolver(mockController) as any)

      const adapter = await container.get(XmlStreamAdapterService)
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
        contentType: 'text/xml',
      } as BaseXmlStreamConfig)
      handlerMetadata.classMethod = 'testMethod'
      handlerMetadata.headers = { 'X-Custom': 'header' }

      class TestController {}

      mockStreamAdapter.buildFormatArguments.mockReturnValue(async () => ({}))

      const result = await adapter.provideHandler(
        TestController,
        handlerMetadata,
      )

      expect(result.isStatic).toBe(false)
    })

    it('should handle Bun environment (no reply object)', async () => {
      container.bind(StreamAdapterToken).toValue(mockStreamAdapter as any)
      container
        .bind(InstanceResolverService)
        .toValue(createMockInstanceResolver(mockController) as any)

      const adapter = await container.get(XmlStreamAdapterService)
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
      })
      handlerMetadata.classMethod = 'testMethod'

      class TestController {}

      mockStreamAdapter.buildFormatArguments.mockReturnValue(async () => ({}))

      const result = await adapter.provideHandler(
        TestController,
        handlerMetadata,
      )

      // Call handler with no reply (Bun style)
      const mockContext = {}
      const mockRequest = {}
      const response = await result.handler(
        mockContext as any,
        mockRequest,
        undefined,
      )

      // Should return a Response object
      expect(response).toBeInstanceOf(Response)
      expect(response.status).toBe(200)
    })

    it('should handle Fastify environment (with reply object)', async () => {
      container.bind(StreamAdapterToken).toValue(mockStreamAdapter as any)
      container
        .bind(InstanceResolverService)
        .toValue(createMockInstanceResolver(mockController) as any)

      const adapter = await container.get(XmlStreamAdapterService)
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/test',
      })
      handlerMetadata.classMethod = 'testMethod'

      class TestController {}

      mockStreamAdapter.buildFormatArguments.mockReturnValue(async () => ({}))

      const result = await adapter.provideHandler(
        TestController,
        handlerMetadata,
      )

      // Create mock Fastify reply
      const mockReply = {
        status: vi.fn().mockReturnThis(),
        header: vi.fn().mockReturnThis(),
        headers: vi.fn().mockReturnThis(),
        send: vi.fn().mockReturnThis(),
      }

      const mockContext = {}
      const mockRequest = {}
      await result.handler(mockContext as any, mockRequest, mockReply)

      expect(mockReply.status).toHaveBeenCalledWith(200)
      expect(mockReply.header).toHaveBeenCalledWith(
        'Content-Type',
        'application/xml',
      )
      expect(mockReply.send).toHaveBeenCalled()
    })
  })
})
