import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test'

import { builder } from '@navios/builder'
import {
  Controller,
  extractControllerMetadata,
  HttpCode,
  Multipart,
  MultipartAdapterToken,
  NaviosOptionsToken,
  reply,
} from '@navios/core'
import { Injectable } from '@navios/di'
import { TestContainer } from '@navios/di/testing'
import { z } from 'zod/v4'

import type {
  ClassType,
  HandlerContext,
  HandlerMetadata,
  NaviosApplicationOptions,
  ZodBaseEndpointOptions,
} from '@navios/core'

import {
  BunMultipartAdapterService,
  BunMultipartAdapterToken,
} from '../adapters/multipart-adapter.service.mjs'

/**
 * Binds NaviosOptionsToken with partial options for testing.
 */
const bindNaviosOptions = (
  container: TestContainer,
  options: Partial<NaviosApplicationOptions>,
) => {
  container.bind(NaviosOptionsToken).toValue(options as NaviosApplicationOptions)
}

const createHandlerMetadata = (
  config: Partial<ZodBaseEndpointOptions>,
  classMethod = 'test',
): HandlerMetadata<ZodBaseEndpointOptions> => ({
  classMethod,
  url: config.url ?? '',
  successStatusCode: 200,
  adapterToken: null,
  headers: {},
  httpMethod: config.method ?? 'GET',
  config: config as ZodBaseEndpointOptions,
  guards: new Set(),
  customAttributes: new Map(),
})

/** The metadata the decorators produced for the only handler of a controller. */
const decoratedMetadata = (controller: ClassType): HandlerMetadata<ZodBaseEndpointOptions> => {
  const [handler] = extractControllerMetadata(controller).endpoints
  return handler as HandlerMetadata<any>
}

/**
 * Test adapter that exposes protected methods for testing
 */
@Injectable()
class TestBunMultipartAdapter extends BunMultipartAdapterService {
  /** Runs a static handler whose controller method resolves with `result`. */
  async respond(
    handlerMetadata: HandlerMetadata<ZodBaseEndpointOptions>,
    result: unknown,
    headers: Record<string, string> = {},
  ): Promise<Response> {
    const context: HandlerContext<ZodBaseEndpointOptions> = {
      methodName: handlerMetadata.classMethod,
      statusCode: handlerMetadata.successStatusCode,
      headers,
      handlerMetadata,
      hasArguments: true,
    }
    const handler = this.createStaticHandler(
      vi.fn().mockResolvedValue(result),
      vi.fn().mockResolvedValue({ data: { file: new File(['a'], 'a.txt') } }),
      context,
    )
    return handler.handler({ url: 'http://localhost:3000/upload' } as any)
  }
}

describe('BunMultipartAdapterService', () => {
  let container: TestContainer

  beforeEach(() => {
    container = new TestContainer()
    bindNaviosOptions(container, { validateResponses: false })
  })

  afterEach(async () => {
    await container.dispose()
  })

  it('should be defined', () => {
    expect(BunMultipartAdapterService).toBeDefined()
  })

  it('should extend BunEndpointAdapterService', async () => {
    const service = await container.get(BunMultipartAdapterToken)
    expect(service).toBeInstanceOf(BunMultipartAdapterService)
  })

  it('should handle form data correctly', async () => {
    const service = await container.get(BunMultipartAdapterToken)

    // Mock handler metadata with request schema
    const mockHandlerMetadata = createHandlerMetadata({
      method: 'POST',
      url: '/upload',
      querySchema: {
        parse: vi.fn().mockReturnValue({}),
      } as any,
      requestSchema: {
        parse: vi.fn().mockReturnValue({ file: 'mock-file', text: 'mock-text' }),
      } as any,
    } as ZodBaseEndpointOptions)

    // Mock BunRequest with formData method
    const mockFormData = new FormData()
    mockFormData.append('file', new File(['content'], 'test.txt', { type: 'text/plain' }))
    mockFormData.append('text', 'hello world')

    const mockRequest = {
      url: 'http://localhost:3000/upload',
      formData: vi.fn().mockResolvedValue(mockFormData),
      params: {},
    } as any

    const getters = service.prepareArguments(mockHandlerMetadata)
    expect(getters).toHaveLength(2) // query schema + request schema

    // Test the form data getter
    const formDataGetter = getters[1]
    const target: Record<string, any> = {}

    await formDataGetter(target, mockRequest)

    expect(target.data).toEqual({ file: 'mock-file', text: 'mock-text' })
    expect(mockHandlerMetadata.config.requestSchema?.parse).toHaveBeenCalledWith({
      file: expect.any(File),
      text: 'hello world',
    })
  })

  it('should handle multiple files with same field name', async () => {
    const service = await container.get(BunMultipartAdapterToken)

    const mockHandlerMetadata = createHandlerMetadata({
      method: 'POST',
      url: '/upload',
      querySchema: {
        parse: vi.fn().mockReturnValue({}),
      } as any,
      requestSchema: {
        parse: vi.fn().mockReturnValue({ files: ['file1', 'file2'] }),
      } as any,
    } as ZodBaseEndpointOptions)

    const mockFormData = new FormData()
    mockFormData.append('files', new File(['content1'], 'test1.txt'))
    mockFormData.append('files', new File(['content2'], 'test2.txt'))

    const mockRequest = {
      url: 'http://localhost:3000/upload',
      formData: vi.fn().mockResolvedValue(mockFormData),
      params: {},
    } as any

    const getters = service.prepareArguments(mockHandlerMetadata)
    const formDataGetter = getters[1]
    const target: Record<string, any> = {}

    await formDataGetter(target, mockRequest)

    expect(target.data).toEqual({ files: ['file1', 'file2'] })
    expect(mockHandlerMetadata.config.requestSchema?.parse).toHaveBeenCalledWith({
      files: [expect.any(File), expect.any(File)],
    })
  })

  describe('response: void endpoints', () => {
    const uploadAvatar = builder().declareEndpoint({
      method: 'PUT',
      url: '/users/$id/avatar',
      body: 'multipart',
      response: 'void',
      requestSchema: z.object({ file: z.instanceof(File) }),
    })

    @Controller()
    class AvatarController {
      @Multipart(uploadAvatar)
      async upload() {}
    }

    @Controller()
    class AcceptedController {
      @Multipart(uploadAvatar)
      @HttpCode(202)
      async upload() {}
    }

    it('should be served by the multipart adapter with a 204 default', () => {
      const metadata = decoratedMetadata(AvatarController)

      expect(metadata.adapterToken).toBe(MultipartAdapterToken)
      expect(metadata.successStatusCode).toBe(204)
    })

    it('should answer 204 without a body or Content-Type', async () => {
      const adapter = await container.get(TestBunMultipartAdapter)

      // A value returned by mistake (not type-safe) must not be sent
      const response = await adapter.respond(
        decoratedMetadata(AvatarController),
        { leaked: true },
        { 'x-custom': 'value' },
      )

      expect(response.status).toBe(204)
      expect(response.body).toBeNull()
      expect(await response.text()).toBe('')
      expect(response.headers.get('Content-Type')).toBeNull()
      expect(response.headers.get('x-custom')).toBe('value')
    })

    it('should use the status set with @HttpCode', async () => {
      const adapter = await container.get(TestBunMultipartAdapter)

      const response = await adapter.respond(decoratedMetadata(AcceptedController), undefined)

      expect(response.status).toBe(202)
      expect(await response.text()).toBe('')
    })
  })

  describe('responses endpoints', () => {
    const importUsers = builder().declareEndpoint({
      method: 'POST',
      url: '/users/import',
      body: 'multipart',
      requestSchema: z.object({ file: z.instanceof(File) }),
      responses: { 200: z.object({ imported: z.number() }), 204: null },
    })

    @Controller()
    class ImportController {
      @Multipart(importUsers)
      async importUsers() {
        return reply(204)
      }
    }

    // These need response validation, which the outer container turned off
    beforeEach(async () => {
      await container.dispose()
      container = new TestContainer()
      bindNaviosOptions(container, { validateResponses: true })
    })

    it('should send the status and body the method replied with', async () => {
      const adapter = await container.get(TestBunMultipartAdapter)

      const response = await adapter.respond(
        decoratedMetadata(ImportController),
        // The schema of status 200 strips what it does not declare
        reply(200, { imported: 3, secret: 'do not send' }),
      )

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('application/json')
      expect(await response.json()).toEqual({ imported: 3 })
    })

    it('should send no body or Content-Type for a null entry', async () => {
      const adapter = await container.get(TestBunMultipartAdapter)

      const response = await adapter.respond(decoratedMetadata(ImportController), reply(204))

      expect(response.status).toBe(204)
      expect(response.body).toBeNull()
      expect(response.headers.get('Content-Type')).toBeNull()
    })

    it('should throw when the body fails the schema of its status', async () => {
      const adapter = await container.get(TestBunMultipartAdapter)

      await expect(
        adapter.respond(decoratedMetadata(ImportController), reply(200, { imported: 'three' })),
      ).rejects.toThrow(
        '[Navios] POST /users/import returned a response that does not match its schema.',
      )
    })

    it('should throw when the method did not return a reply', async () => {
      const adapter = await container.get(TestBunMultipartAdapter)

      await expect(
        adapter.respond(decoratedMetadata(ImportController), { imported: 3 }),
      ).rejects.toThrow(
        '[Navios] POST /users/import is declared with a per-status responses map, so its handler must return reply(status, body), but it returned a value of type object.',
      )
    })
  })
})
