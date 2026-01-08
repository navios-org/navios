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

import { BunStreamAdapterService } from '../adapters/stream-adapter.service.mjs'
import { BunStreamAdapterToken } from '../adapters/stream-adapter.service.mjs'

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

// Mock BunRequest type
interface MockBunRequest {
  url: string
  method: string
  headers: Headers
}

const createMockBunRequest = (overrides: Partial<MockBunRequest> = {}): MockBunRequest => ({
  url: 'http://localhost:3000/stream',
  method: 'GET',
  headers: new Headers(),
  ...overrides,
})

/**
 * Test adapter that exposes protected methods for testing
 */
@Injectable()
class TestBunStreamAdapter extends BunStreamAdapterService {
  testCreateStreamWriter() {
    return this.createStreamWriter()
  }

  testCreateStreamResultHandler(context: any, headers: Record<string, string>) {
    return this.createStreamResultHandler(context, headers)
  }

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

describe('BunStreamAdapterService', () => {
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

      const adapter = await container.get(BunStreamAdapterToken)
      const handlerMetadata = createHandlerMetadata({
        method: 'POST',
        url: '/stream',
        requestSchema: z.object({ channel: z.string() }),
      })

      expect(adapter.hasSchema(handlerMetadata)).toBe(true)
    })

    it('should return true when querySchema exists', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(BunStreamAdapterToken)
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/stream',
        querySchema: z.object({ id: z.string() }),
      })

      expect(adapter.hasSchema(handlerMetadata)).toBe(true)
    })

    it('should return false when no schemas exist', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(BunStreamAdapterToken)
      const handlerMetadata = createHandlerMetadata({
        method: 'GET',
        url: '/stream',
      })

      expect(adapter.hasSchema(handlerMetadata)).toBe(false)
    })
  })

  describe('createStreamWriter', () => {
    it('should create a stream writer stub', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(TestBunStreamAdapter)
      const streamWriter = adapter.testCreateStreamWriter()

      expect(streamWriter).toHaveProperty('write')
      expect(streamWriter).toHaveProperty('end')
      expect(typeof streamWriter.write).toBe('function')
      expect(typeof streamWriter.end).toBe('function')

      // Should not throw when called
      expect(() => streamWriter.write('data')).not.toThrow()
      expect(() => streamWriter.end()).not.toThrow()
    })
  })

  describe('createStreamResultHandler', () => {
    it('should add headers to Response result', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(TestBunStreamAdapter)
      const context = { statusCode: 200 }
      const headers = { 'X-Custom-Header': 'custom-value' }

      const handler = adapter.testCreateStreamResultHandler(context, headers)
      const response = new Response('stream data', {
        headers: { 'Content-Type': 'text/event-stream' },
      })

      const result = handler(response)

      expect(result).toBeInstanceOf(Response)
      expect(result.headers.get('X-Custom-Header')).toBe('custom-value')
      expect(result.headers.get('Content-Type')).toBe('text/event-stream')
    })

    it('should wrap non-Response result', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(TestBunStreamAdapter)
      const context = { statusCode: 200 }
      const headers = { 'Content-Type': 'text/plain' }

      const handler = adapter.testCreateStreamResultHandler(context, headers)
      const result = handler('plain text data')

      expect(result).toBeInstanceOf(Response)
      expect(result.status).toBe(200)
      expect(result.headers.get('Content-Type')).toBe('text/plain')
    })

    it('should use context status code for non-Response result', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(TestBunStreamAdapter)
      const context = { statusCode: 201 }
      const headers = {}

      const handler = adapter.testCreateStreamResultHandler(context, headers)
      const result = handler('created stream')

      expect(result.status).toBe(201)
    })
  })

  describe('createStaticHandler', () => {
    it('should create static handler that passes streamWriter', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(TestBunStreamAdapter)
      const streamResponse = new Response('event: data\n', {
        headers: { 'Content-Type': 'text/event-stream' },
      })
      const boundMethod = vi.fn().mockResolvedValue(streamResponse)
      const formatArguments = vi.fn().mockResolvedValue({ data: { channel: 'test' } })
      const context = {
        statusCode: 200,
        headers: {},
        hasArguments: true,
      }

      const result = adapter.testCreateStaticHandler(boundMethod, formatArguments, context)

      expect(result.isStatic).toBe(true)

      const request = createMockBunRequest()
      const response = await result.handler(request as any)

      expect(formatArguments).toHaveBeenCalledWith(request)
      expect(boundMethod).toHaveBeenCalledWith(
        { data: { channel: 'test' } },
        expect.objectContaining({ write: expect.any(Function), end: expect.any(Function) }),
      )
      expect(response).toBeInstanceOf(Response)
    })

    it('should handle non-Response return value', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(TestBunStreamAdapter)
      const boundMethod = vi.fn().mockResolvedValue('plain text stream')
      const formatArguments = vi.fn().mockResolvedValue({})
      const context = {
        statusCode: 200,
        headers: { 'Content-Type': 'text/plain' },
        hasArguments: false,
      }

      const result = adapter.testCreateStaticHandler(boundMethod, formatArguments, context)
      const request = createMockBunRequest()
      const response = await result.handler(request as any)

      expect(response).toBeInstanceOf(Response)
      expect(response.status).toBe(200)
    })
  })

  describe('createDynamicHandler', () => {
    it('should create dynamic handler that passes streamWriter', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(TestBunStreamAdapter)
      const streamResponse = new Response('stream data', {
        headers: { 'Content-Type': 'text/event-stream' },
      })
      const mockController = {
        streamMethod: vi.fn().mockResolvedValue(streamResponse),
      }
      const resolution: InstanceResolution = {
        cached: false,
        instance: null,
        resolve: vi.fn().mockResolvedValue(mockController),
      }
      const formatArguments = vi.fn().mockResolvedValue({ data: { id: '123' } })
      const context = {
        methodName: 'streamMethod',
        statusCode: 200,
        headers: {},
        hasArguments: true,
      }

      const result = adapter.testCreateDynamicHandler(resolution, formatArguments, context)

      expect(result.isStatic).toBe(false)

      const scopedContainer = {}
      const request = createMockBunRequest()
      const response = await result.handler(scopedContainer as any, request as any)

      expect(resolution.resolve).toHaveBeenCalledWith(scopedContainer)
      expect(mockController.streamMethod).toHaveBeenCalledWith(
        { data: { id: '123' } },
        expect.objectContaining({ write: expect.any(Function), end: expect.any(Function) }),
      )
      expect(response).toBeInstanceOf(Response)
    })

    it('should work without arguments', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(TestBunStreamAdapter)
      const mockController = {
        noArgsStream: vi.fn().mockResolvedValue(new Response('data')),
      }
      const resolution: InstanceResolution = {
        cached: false,
        instance: null,
        resolve: vi.fn().mockResolvedValue(mockController),
      }
      const formatArguments = vi.fn()
      const context = {
        methodName: 'noArgsStream',
        statusCode: 200,
        headers: {},
        hasArguments: false,
      }

      const result = adapter.testCreateDynamicHandler(resolution, formatArguments, context)
      const request = createMockBunRequest()
      await result.handler({} as any, request as any)

      expect(mockController.noArgsStream).toHaveBeenCalled()
    })
  })
})
