import { builder } from '@navios/builder'
import {
  Controller,
  extractControllerMetadata,
  HttpCode,
  Multipart,
  MultipartAdapterToken,
  NaviosOptionsToken,
  reply as coreReply,
} from '@navios/core'
import { Injectable } from '@navios/di'
import { TestContainer } from '@navios/di/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import type {
  ClassType,
  HandlerContext,
  HandlerMetadata,
  NaviosApplicationOptions,
  ZodBaseEndpointOptions,
} from '@navios/core'

import { FastifyEndpointAdapterService } from '../adapters/endpoint-adapter.service.mjs'
import { FastifyMultipartAdapterService } from '../adapters/multipart-adapter.service.mjs'
import { FastifyMultipartAdapterToken } from '../adapters/multipart-adapter.service.mjs'

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

const createHandlerContext = (
  handlerMetadata: HandlerMetadata<ZodBaseEndpointOptions>,
  overrides: Partial<HandlerContext<ZodBaseEndpointOptions>> = {},
): HandlerContext<ZodBaseEndpointOptions> => ({
  methodName: handlerMetadata.classMethod,
  statusCode: handlerMetadata.successStatusCode,
  headers: handlerMetadata.headers,
  handlerMetadata,
  hasArguments: true,
  ...overrides,
})

const createMockReply = () => ({
  status: vi.fn().mockReturnThis(),
  headers: vi.fn().mockReturnThis(),
  send: vi.fn().mockReturnThis(),
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
class TestFastifyMultipartAdapter extends FastifyMultipartAdapterService {
  testCreateStaticHandler(
    boundMethod: (...args: any[]) => Promise<any>,
    formatArguments: (request: any) => any,
    context: HandlerContext<ZodBaseEndpointOptions>,
  ) {
    return this.createStaticHandler(boundMethod, formatArguments, context)
  }

  testAnalyzeSchema(shape: any) {
    return (this as any).analyzeSchema(shape)
  }

  async testPopulateRequest(structure: any, part: any, req: any) {
    return (this as any).populateRequest(structure, part, req)
  }
}

describe('FastifyMultipartAdapterService', () => {
  let container: TestContainer

  beforeEach(() => {
    container = new TestContainer()
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe('provideSchema', () => {
    it('should include querystring schema when provided', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(FastifyMultipartAdapterToken)
      const querySchema = z.object({ uploadId: z.string() })
      const handlerMetadata = createHandlerMetadata({
        method: 'POST',
        url: '/upload',
        querySchema,
        requestSchema: z.object({ file: z.instanceof(File) }),
      })

      const schema = adapter.provideSchema(handlerMetadata)

      expect(schema.querystring).toBe(querySchema)
      expect(schema.body).toBeUndefined() // Multipart doesn't use body schema
    })

    it('should include response schema when validateResponses is true', async () => {
      bindNaviosOptions(container, { validateResponses: true })

      const adapter = await container.get(FastifyMultipartAdapterToken)
      const responseSchema = z.object({ success: z.boolean() })
      const handlerMetadata = createHandlerMetadata({
        method: 'POST',
        url: '/upload',
        requestSchema: z.object({ file: z.instanceof(File) }),
        responseSchema,
      })

      const schema = adapter.provideSchema(handlerMetadata)

      expect(schema.response).toBeDefined()
      expect(schema.response[200]).toBe(responseSchema)
    })

    it('should not include response schema when validateResponses is false', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(FastifyMultipartAdapterToken)
      const responseSchema = z.object({ success: z.boolean() })
      const handlerMetadata = createHandlerMetadata({
        method: 'POST',
        url: '/upload',
        requestSchema: z.object({ file: z.instanceof(File) }),
        responseSchema,
      })

      const schema = adapter.provideSchema(handlerMetadata)

      expect(schema.response).toBeUndefined()
    })
  })

  describe('response: void endpoints', () => {
    const fileSchema = z.object({ file: z.instanceof(File) })
    const uploadAvatar = builder().declareEndpoint({
      method: 'PUT',
      url: '/users/$id/avatar',
      body: 'multipart',
      response: 'void',
      requestSchema: fileSchema,
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

    it('should answer 204 without a body', async () => {
      bindNaviosOptions(container, { validateResponses: true })

      const adapter = await container.get(TestFastifyMultipartAdapter)
      // A value returned by mistake (not type-safe) must not be sent
      const boundMethod = vi.fn().mockResolvedValue({ leaked: true })
      const argument = { urlParams: { id: '1' }, data: { file: new File(['a'], 'a.txt') } }
      const context = createHandlerContext(decoratedMetadata(AvatarController), {
        headers: { 'x-custom': 'value' },
      })

      const result = adapter.testCreateStaticHandler(
        boundMethod,
        vi.fn().mockResolvedValue(argument),
        context,
      )
      const reply = createMockReply()
      await result.handler({} as any, reply as any)

      expect(boundMethod).toHaveBeenCalledWith(argument)
      expect(reply.status).toHaveBeenCalledWith(204)
      expect(reply.headers).toHaveBeenCalledWith({ 'x-custom': 'value' })
      expect(reply.send).toHaveBeenCalledWith()
    })

    it('should use the status set with @HttpCode', async () => {
      bindNaviosOptions(container, { validateResponses: true })

      const adapter = await container.get(TestFastifyMultipartAdapter)
      const result = adapter.testCreateStaticHandler(
        vi.fn().mockResolvedValue(undefined),
        vi.fn().mockResolvedValue({}),
        createHandlerContext(decoratedMetadata(AcceptedController)),
      )
      const reply = createMockReply()
      await result.handler({} as any, reply as any)

      expect(reply.status).toHaveBeenCalledWith(202)
      expect(reply.send).toHaveBeenCalledWith()
    })

    it('should not register a success schema, a body schema, or anything at all', async () => {
      bindNaviosOptions(container, { validateResponses: true })

      const adapter = await container.get(FastifyMultipartAdapterToken)
      const errorSchema = { 413: z.object({ message: z.string() }) }

      expect(adapter.provideSchema(decoratedMetadata(AvatarController))).toEqual({})

      const withSchemas = createHandlerMetadata({
        ...uploadAvatar.config,
        responseSchema: z.object({ ignored: z.string() }),
        errorSchema,
      })
      const schema = adapter.provideSchema(withSchemas)

      expect(schema.response).toEqual(errorSchema)
      expect(schema.body).toBeUndefined()
    })
  })

  describe('responses endpoints', () => {
    const fileSchema = z.object({ file: z.instanceof(File) })
    const reportSchema = z.object({ imported: z.number() })
    const createdSchema = z.object({ id: z.string() })
    const errorSchema = { 413: z.object({ message: z.string() }) }
    const importUsers = builder().declareEndpoint({
      method: 'POST',
      url: '/users/import',
      body: 'multipart',
      requestSchema: fileSchema,
      querySchema: z.object({ dryRun: z.string().optional() }),
      responses: { 200: reportSchema, 201: createdSchema, 204: null },
      errorSchema,
    })

    @Controller()
    class ImportController {
      @Multipart(importUsers)
      async importUsers() {
        return coreReply(204)
      }
    }

    const metadata = () => decoratedMetadata(ImportController)

    it('should send the status and body the method replied with', async () => {
      bindNaviosOptions(container, { validateResponses: true })

      const adapter = await container.get(TestFastifyMultipartAdapter)
      const context = createHandlerContext(metadata(), { headers: { 'x-custom': 'value' } })

      for (const [result, status, body] of [
        [coreReply(200, { imported: 3 }), 200, { imported: 3 }],
        [coreReply(201, { id: '2' }), 201, { id: '2' }],
      ] as const) {
        const handler = adapter.testCreateStaticHandler(
          vi.fn().mockResolvedValue(result),
          vi.fn().mockResolvedValue({ data: { file: new File(['a'], 'a.txt') } }),
          context,
        )
        const reply = createMockReply()
        await handler.handler({} as any, reply as any)

        expect(reply.status).toHaveBeenCalledWith(status)
        expect(reply.headers).toHaveBeenCalledWith({ 'x-custom': 'value' })
        expect(reply.send).toHaveBeenCalledWith(body)
      }
    })

    it('should send no body for a null entry', async () => {
      bindNaviosOptions(container, { validateResponses: true })

      const adapter = await container.get(TestFastifyMultipartAdapter)
      const handler = adapter.testCreateStaticHandler(
        vi.fn().mockResolvedValue(coreReply(204, { leaked: true })),
        vi.fn().mockResolvedValue({}),
        createHandlerContext(metadata()),
      )
      const reply = createMockReply()
      await handler.handler({} as any, reply as any)

      expect(reply.status).toHaveBeenCalledWith(204)
      expect(reply.send).toHaveBeenCalledWith()
    })

    it('should throw when the method did not return a reply', async () => {
      bindNaviosOptions(container, { validateResponses: true })

      const adapter = await container.get(TestFastifyMultipartAdapter)
      const handler = adapter.testCreateStaticHandler(
        vi.fn().mockResolvedValue({ imported: 3 }),
        vi.fn().mockResolvedValue({}),
        createHandlerContext(metadata()),
      )
      const reply = createMockReply()

      await expect(handler.handler({} as any, reply as any)).rejects.toThrow(
        'POST /users/import is declared with a per-status responses map',
      )
      expect(reply.send).not.toHaveBeenCalled()
    })

    it('should register a response schema for each status that has one, and no body', async () => {
      bindNaviosOptions(container, { validateResponses: true })

      const adapter = await container.get(FastifyMultipartAdapterToken)
      const schema = adapter.provideSchema(metadata())

      expect(adapter.hasSchema(metadata())).toBe(true)
      expect(schema.response).toEqual({ ...errorSchema, 200: reportSchema, 201: createdSchema })
      expect(schema.response[204]).toBeUndefined()
      expect(schema.querystring).toBe(importUsers.config.querySchema)
      expect(schema.body).toBeUndefined()
    })

    it('should register no response schema when validateResponses is false', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(FastifyMultipartAdapterToken)

      expect(adapter.provideSchema(metadata()).response).toBeUndefined()
    })

    it('should register what the endpoint adapter registers, minus the body', async () => {
      bindNaviosOptions(container, { validateResponses: true })

      const multipart = await container.get(FastifyMultipartAdapterToken)
      const endpoint = await container.get(FastifyEndpointAdapterService)
      const { body, ...expected } = endpoint.provideSchema(metadata())

      expect(body).toBe(fileSchema)
      expect(multipart.provideSchema(metadata())).toEqual(expected)
    })
  })

  describe('analyzeSchema', () => {
    it('should detect array fields', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(TestFastifyMultipartAdapter)
      const shape = {
        files: z.array(z.instanceof(File)),
        tags: z.array(z.string()),
      }

      const result = adapter.testAnalyzeSchema(shape)

      expect(result.files.isArray).toBe(true)
      expect(result.tags.isArray).toBe(true)
    })

    it('should detect optional fields', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(TestFastifyMultipartAdapter)
      const shape = {
        requiredField: z.string(),
        optionalField: z.string().optional(),
      }

      const result = adapter.testAnalyzeSchema(shape)

      expect(result.requiredField.isOptional).toBe(false)
      expect(result.optionalField.isOptional).toBe(true)
    })

    it('should detect object fields', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(TestFastifyMultipartAdapter)
      const shape = {
        metadata: z.object({ key: z.string() }),
        simpleField: z.string(),
      }

      const result = adapter.testAnalyzeSchema(shape)

      expect(result.metadata.isObject).toBe(true)
      expect(result.simpleField.isObject).toBe(false)
    })

    it('should handle optional arrays', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(TestFastifyMultipartAdapter)
      const shape = {
        optionalFiles: z.array(z.instanceof(File)).optional(),
      }

      const result = adapter.testAnalyzeSchema(shape)

      expect(result.optionalFiles.isArray).toBe(true)
      expect(result.optionalFiles.isOptional).toBe(true)
    })
  })

  describe('populateRequest', () => {
    it('should handle file parts', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(TestFastifyMultipartAdapter)
      const structure = {
        avatar: { isArray: false, isOptional: false, isObject: false },
      }
      const mockPart = {
        type: 'file',
        fieldname: 'avatar',
        filename: 'test.png',
        mimetype: 'image/png',
        toBuffer: vi.fn().mockResolvedValue(Buffer.from('file-content')),
      }
      const req: Record<string, any> = {}

      await adapter.testPopulateRequest(structure, mockPart, req)

      expect(req.avatar).toBeInstanceOf(File)
      expect(req.avatar.name).toBe('test.png')
      expect(req.avatar.type).toBe('image/png')
    })

    it('should handle value parts', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(TestFastifyMultipartAdapter)
      const structure = {
        title: { isArray: false, isOptional: false, isObject: false },
      }
      const mockPart = {
        type: 'field',
        fieldname: 'title',
        value: 'My Title',
      }
      const req: Record<string, any> = {}

      await adapter.testPopulateRequest(structure, mockPart, req)

      expect(req.title).toBe('My Title')
    })

    it('should handle array fields', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(TestFastifyMultipartAdapter)
      const structure = {
        tags: { isArray: true, isOptional: false, isObject: false },
      }
      const req: Record<string, any> = {}

      await adapter.testPopulateRequest(
        structure,
        { type: 'field', fieldname: 'tags', value: 'tag1' },
        req,
      )
      await adapter.testPopulateRequest(
        structure,
        { type: 'field', fieldname: 'tags', value: 'tag2' },
        req,
      )

      expect(req.tags).toEqual(['tag1', 'tag2'])
    })

    it('should parse JSON for object fields', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(TestFastifyMultipartAdapter)
      const structure = {
        metadata: { isArray: false, isOptional: false, isObject: true },
      }
      const mockPart = {
        type: 'field',
        fieldname: 'metadata',
        value: '{"key":"value","count":42}',
      }
      const req: Record<string, any> = {}

      await adapter.testPopulateRequest(structure, mockPart, req)

      expect(req.metadata).toEqual({ key: 'value', count: 42 })
    })

    it('should handle invalid JSON for object fields', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(TestFastifyMultipartAdapter)
      const structure = {
        metadata: { isArray: false, isOptional: false, isObject: true },
      }
      const mockPart = {
        type: 'field',
        fieldname: 'metadata',
        value: 'not-valid-json',
      }
      const req: Record<string, any> = {}

      await adapter.testPopulateRequest(structure, mockPart, req)

      expect(req.metadata).toBeNull()
    })

    it('should handle file arrays', async () => {
      bindNaviosOptions(container, { validateResponses: false })

      const adapter = await container.get(TestFastifyMultipartAdapter)
      const structure = {
        files: { isArray: true, isOptional: false, isObject: false },
      }
      const req: Record<string, any> = {}

      const file1 = {
        type: 'file',
        fieldname: 'files',
        filename: 'file1.txt',
        mimetype: 'text/plain',
        toBuffer: vi.fn().mockResolvedValue(Buffer.from('content1')),
      }
      const file2 = {
        type: 'file',
        fieldname: 'files',
        filename: 'file2.txt',
        mimetype: 'text/plain',
        toBuffer: vi.fn().mockResolvedValue(Buffer.from('content2')),
      }

      await adapter.testPopulateRequest(structure, file1, req)
      await adapter.testPopulateRequest(structure, file2, req)

      expect(req.files).toHaveLength(2)
      expect(req.files[0]).toBeInstanceOf(File)
      expect(req.files[0].name).toBe('file1.txt')
      expect(req.files[1]).toBeInstanceOf(File)
      expect(req.files[1].name).toBe('file2.txt')
    })
  })
})
