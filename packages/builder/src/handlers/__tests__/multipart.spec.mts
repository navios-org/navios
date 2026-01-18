import { describe, expect, it, vi } from 'vitest'
import { z, ZodError } from 'zod/v4'

import { createMultipart } from '../multipart.mjs'

import type { AbstractResponse, BuilderContext, Client } from '../../types/index.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('createMultipart', () => {
  const responseSchema = z.object({
    id: z.string(),
    filename: z.string(),
  })

  const requestSchema = z.object({
    name: z.string(),
    file: z.instanceof(File),
  })

  const querySchema = z.object({
    overwrite: z.boolean(),
  })

  function createMockClient(response: unknown, status = 200): Client {
    return {
      request: vi.fn().mockResolvedValue({
        data: response,
        status,
        statusText: 'OK',
        headers: {},
      } satisfies AbstractResponse<unknown>),
    }
  }

  function createContext(client: Client, config = {}): BuilderContext {
    return {
      getClient: () => client,
      config,
    }
  }

  describe('basic multipart creation', () => {
    it('should create a callable handler', () => {
      const client = createMockClient({ id: '1', filename: 'test.txt' })
      const context = createContext(client)

      const handler = createMultipart(
        {
          method: 'POST',
          url: '/upload',
          querySchema: undefined,
          requestSchema,
          responseSchema,
        } as any,
        context,
      )

      expect(typeof handler).toBe('function')
    })

    it('should attach config to handler', () => {
      const client = createMockClient({ id: '1', filename: 'test.txt' })
      const context = createContext(client)

      const options = {
        method: 'POST' as const,
        url: '/upload',
        querySchema: undefined,
        requestSchema,
        responseSchema,
      }

      const handler = createMultipart(options as any, context)

      expect(handler.config).toBe(options)
    })
  })

  describe('multipart POST requests', () => {
    it('should make POST request with FormData', async () => {
      const client = createMockClient({ id: '1', filename: 'test.txt' })
      const context = createContext(client)
      const file = new File(['content'], 'test.txt', { type: 'text/plain' })

      const handler = createMultipart(
        {
          method: 'POST',
          url: '/upload',
          querySchema: undefined,
          requestSchema,
          responseSchema,
        } as any,
        context,
      )

      await handler({ data: { name: 'Test File', file } } as any)

      expect(client.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/upload',
        }),
      )

      // Verify FormData was created
      const call = (client.request as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(call.data).toBeInstanceOf(FormData)
      expect(call.data.get('name')).toBe('Test File')
      expect(call.data.get('file')).toBeInstanceOf(File)
    })

    it('should handle URL params', async () => {
      const client = createMockClient({ id: '1', filename: 'avatar.png' })
      const context = createContext(client)
      const file = new File(['content'], 'avatar.png', { type: 'image/png' })

      const handler = createMultipart(
        {
          method: 'POST',
          url: '/users/$userId/avatar',
          querySchema: undefined,
          requestSchema,
          responseSchema,
        } as any,
        context,
      )

      await handler({
        urlParams: { userId: '123' },
        data: { name: 'Avatar', file },
      } as any)

      expect(client.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/users/123/avatar',
        }),
      )
    })

    it('should handle query params', async () => {
      const client = createMockClient({ id: '1', filename: 'test.txt' })
      const context = createContext(client)
      const file = new File(['content'], 'test.txt', { type: 'text/plain' })

      const handler = createMultipart(
        {
          method: 'POST',
          url: '/upload',
          querySchema,
          requestSchema,
          responseSchema,
        } as any,
        context,
      )

      await handler({
        params: { overwrite: true },
        data: { name: 'Test', file },
      } as any)

      expect(client.request).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { overwrite: true },
        }),
      )
    })

    it('should handle URL params and query params together', async () => {
      const client = createMockClient({ id: '1', filename: 'doc.pdf' })
      const context = createContext(client)
      const file = new File(['content'], 'doc.pdf', { type: 'application/pdf' })

      const handler = createMultipart(
        {
          method: 'POST',
          url: '/folders/$folderId/files',
          querySchema,
          requestSchema,
          responseSchema,
        } as any,
        context,
      )

      await handler({
        urlParams: { folderId: '456' },
        params: { overwrite: false },
        data: { name: 'Document', file },
      } as any)

      expect(client.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/folders/456/files',
          params: { overwrite: false },
        }),
      )
    })
  })

  describe('PUT/PATCH multipart requests', () => {
    it('should make PUT request with FormData', async () => {
      const client = createMockClient({ id: '1', filename: 'updated.txt' })
      const context = createContext(client)
      const file = new File(['new content'], 'updated.txt', { type: 'text/plain' })

      const handler = createMultipart(
        {
          method: 'PUT',
          url: '/files/$fileId',
          querySchema: undefined,
          requestSchema,
          responseSchema,
        } as any,
        context,
      )

      await handler({
        urlParams: { fileId: '789' },
        data: { name: 'Updated File', file },
      } as any)

      expect(client.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PUT',
          url: '/files/789',
        }),
      )
    })

    it('should make PATCH request with FormData', async () => {
      const client = createMockClient({ id: '1', filename: 'patched.txt' })
      const context = createContext(client)
      const file = new File(['patched'], 'patched.txt', { type: 'text/plain' })

      const handler = createMultipart(
        {
          method: 'PATCH',
          url: '/files/$fileId',
          querySchema: undefined,
          requestSchema,
          responseSchema,
        } as any,
        context,
      )

      await handler({
        urlParams: { fileId: '789' },
        data: { name: 'Patched File', file },
      } as any)

      expect(client.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PATCH',
        }),
      )
    })
  })

  describe('response parsing', () => {
    it('should parse response with schema', async () => {
      const client = createMockClient({
        id: '1',
        filename: 'test.txt',
        extra: 'ignored',
      })
      const context = createContext(client)
      const file = new File(['content'], 'test.txt', { type: 'text/plain' })

      const handler = createMultipart(
        {
          method: 'POST',
          url: '/upload',
          querySchema: undefined,
          requestSchema,
          responseSchema,
        } as any,
        context,
      )

      const result = await handler({ data: { name: 'Test', file } } as any)

      expect(result).toHaveProperty('id', '1')
      expect(result).toHaveProperty('filename', 'test.txt')
    })

    it('should throw ZodError for invalid response', async () => {
      const client = createMockClient({ invalid: 'data' })
      const context = createContext(client)
      const file = new File(['content'], 'test.txt', { type: 'text/plain' })

      const handler = createMultipart(
        {
          method: 'POST',
          url: '/upload',
          querySchema: undefined,
          requestSchema,
          responseSchema,
        } as any,
        context,
      )

      await expect(handler({ data: { name: 'Test', file } } as any)).rejects.toThrow(ZodError)
    })
  })

  describe('error handling', () => {
    it('should call onError callback on request failure', async () => {
      const onError = vi.fn()
      const client: Client = {
        request: vi.fn().mockRejectedValue(new Error('Upload failed')),
      }
      const context = createContext(client, { onError })
      const file = new File(['content'], 'test.txt', { type: 'text/plain' })

      const handler = createMultipart(
        {
          method: 'POST',
          url: '/upload',
          querySchema: undefined,
          requestSchema,
          responseSchema,
        } as any,
        context,
      )

      await expect(handler({ data: { name: 'Test', file } } as any)).rejects.toThrow(
        'Upload failed',
      )
      expect(onError).toHaveBeenCalled()
    })

    it('should use discriminator response on error', async () => {
      const discriminatorSchema = z.discriminatedUnion('status', [
        z.object({
          status: z.literal('success'),
          id: z.string(),
          filename: z.string(),
        }),
        z.object({ status: z.literal('error'), message: z.string() }),
      ])

      const client: Client = {
        request: vi.fn().mockRejectedValue({
          response: {
            data: { status: 'error', message: 'File too large' },
            status: 413,
            statusText: 'Payload Too Large',
            headers: {},
          },
        }),
      }
      const context = createContext(client, { useDiscriminatorResponse: true })
      const file = new File(['content'], 'large.zip', {
        type: 'application/zip',
      })

      const handler = createMultipart(
        {
          method: 'POST',
          url: '/upload',
          querySchema: undefined,
          requestSchema,
          responseSchema: discriminatorSchema,
        } as any,
        context,
      )

      const result = await handler({ data: { name: 'Large File', file } } as any)

      expect(result).toEqual({ status: 'error', message: 'File too large' })
    })
  })

  describe('FormData content', () => {
    it('should include file with correct name', async () => {
      const client = createMockClient({ id: '1', filename: 'document.pdf' })
      const context = createContext(client)
      const file = new File(['pdf content'], 'document.pdf', {
        type: 'application/pdf',
      })

      const handler = createMultipart(
        {
          method: 'POST',
          url: '/upload',
          querySchema: undefined,
          requestSchema,
          responseSchema,
        } as any,
        context,
      )

      await handler({ data: { name: 'My Document', file } } as any)

      const call = (client.request as ReturnType<typeof vi.fn>).mock.calls[0][0]
      const formDataFile = call.data.get('file') as File
      expect(formDataFile.name).toBe('document.pdf')
    })

    it('should handle multiple fields in FormData', async () => {
      const multiFieldSchema = z.object({
        title: z.string(),
        description: z.string(),
        file: z.instanceof(File),
      })

      const client = createMockClient({ id: '1', filename: 'test.txt' })
      const context = createContext(client)
      const file = new File(['content'], 'test.txt', { type: 'text/plain' })

      const handler = createMultipart(
        {
          method: 'POST',
          url: '/upload',
          querySchema: undefined,
          requestSchema: multiFieldSchema,
          responseSchema,
        } as any,
        context,
      )

      await handler({
        data: {
          title: 'Test Title',
          description: 'Test Description',
          file,
        },
      } as any)

      const call = (client.request as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(call.data.get('title')).toBe('Test Title')
      expect(call.data.get('description')).toBe('Test Description')
      expect(call.data.get('file')).toBeInstanceOf(File)
    })
  })

  describe('request options', () => {
    it('should pass through headers', async () => {
      const client = createMockClient({ id: '1', filename: 'test.txt' })
      const context = createContext(client)
      const file = new File(['content'], 'test.txt', { type: 'text/plain' })

      const handler = createMultipart(
        {
          method: 'POST',
          url: '/upload',
          querySchema: undefined,
          requestSchema,
          responseSchema,
        } as any,
        context,
      )

      await handler({
        data: { name: 'Test', file },
        headers: { 'X-Custom-Header': 'value' },
      } as any)

      expect(client.request).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: { 'X-Custom-Header': 'value' },
        }),
      )
    })

    it('should pass through signal for cancellation', async () => {
      const client = createMockClient({ id: '1', filename: 'test.txt' })
      const context = createContext(client)
      const file = new File(['content'], 'test.txt', { type: 'text/plain' })
      const controller = new AbortController()

      const handler = createMultipart(
        {
          method: 'POST',
          url: '/upload',
          querySchema: undefined,
          requestSchema,
          responseSchema,
        } as any,
        context,
      )

      await handler({
        data: { name: 'Test', file },
        signal: controller.signal,
      } as any)

      expect(client.request).toHaveBeenCalledWith(
        expect.objectContaining({
          signal: controller.signal,
        }),
      )
    })
  })

  describe('default request parameter', () => {
    it('should use empty object as default request', async () => {
      const client = createMockClient({ id: '1', filename: 'default.txt' })
      const context = createContext(client)

      const handler = createMultipart(
        {
          method: 'POST',
          url: '/upload',
          querySchema: undefined,
          requestSchema: undefined,
          responseSchema,
        } as any,
        context,
      )

      await handler()

      expect(client.request).toHaveBeenCalled()
    })
  })
})
