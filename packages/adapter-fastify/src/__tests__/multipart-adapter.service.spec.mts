import { NaviosOptionsToken } from '@navios/core'
import { Injectable } from '@navios/di'
import { TestContainer } from '@navios/di/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import type { EndpointOptions } from '@navios/builder'
import type { HandlerMetadata, NaviosApplicationOptions } from '@navios/core'

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

/**
 * Test adapter that exposes protected methods for testing
 */
@Injectable()
class TestFastifyMultipartAdapter extends FastifyMultipartAdapterService {
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
