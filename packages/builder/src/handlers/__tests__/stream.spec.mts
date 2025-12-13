import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import type { AbstractResponse, BuilderContext, Client } from '../../types/index.mjs'

import { createStream } from '../stream.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('createStream', () => {
  const querySchema = z.object({
    format: z.enum(['pdf', 'csv', 'xlsx']),
  })

  const requestSchema = z.object({
    filters: z.object({
      startDate: z.string(),
      endDate: z.string(),
    }),
  })

  function createMockClient(blob: Blob): Client {
    return {
      request: vi.fn().mockResolvedValue({
        data: blob,
        status: 200,
        statusText: 'OK',
        headers: {},
      } satisfies AbstractResponse<Blob>),
    }
  }

  function createContext(client: Client, config = {}): BuilderContext {
    return {
      getClient: () => client,
      config,
    }
  }

  describe('basic stream creation', () => {
    it('should create a callable handler', () => {
      const blob = new Blob(['content'], { type: 'application/octet-stream' })
      const client = createMockClient(blob)
      const context = createContext(client)

      const handler = createStream(
        {
          method: 'GET',
          url: '/download',
        } as any,
        context,
      )

      expect(typeof handler).toBe('function')
    })

    it('should attach config to handler', () => {
      const blob = new Blob(['content'], { type: 'application/octet-stream' })
      const client = createMockClient(blob)
      const context = createContext(client)

      const options = {
        method: 'GET' as const,
        url: '/download',
      }

      const handler = createStream(options as any, context)

      expect(handler.config).toBe(options)
    })
  })

  describe('GET stream requests', () => {
    it('should make GET request and return Blob', async () => {
      const blob = new Blob(['file content'], { type: 'text/plain' })
      const client = createMockClient(blob)
      const context = createContext(client)

      const handler = createStream(
        {
          method: 'GET',
          url: '/download',
        } as any,
        context,
      )

      const result = await handler({} as any)

      expect(client.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: '/download',
          responseType: 'blob',
        }),
      )
      expect(result).toBe(blob)
    })

    it('should handle URL params', async () => {
      const blob = new Blob(['pdf content'], { type: 'application/pdf' })
      const client = createMockClient(blob)
      const context = createContext(client)

      const handler = createStream(
        {
          method: 'GET',
          url: '/files/$fileId/download',
        } as any,
        context,
      )

      await handler({ urlParams: { fileId: '123' } } as any)

      expect(client.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/files/123/download',
        }),
      )
    })

    it('should handle query params', async () => {
      const blob = new Blob(['csv content'], { type: 'text/csv' })
      const client = createMockClient(blob)
      const context = createContext(client)

      const handler = createStream(
        {
          method: 'GET',
          url: '/export',
          querySchema,
        } as any,
        context,
      )

      await handler({ params: { format: 'csv' } } as any)

      expect(client.request).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { format: 'csv' },
        }),
      )
    })

    it('should handle both URL params and query params', async () => {
      const blob = new Blob(['report'], { type: 'application/pdf' })
      const client = createMockClient(blob)
      const context = createContext(client)

      const handler = createStream(
        {
          method: 'GET',
          url: '/reports/$reportId/export',
          querySchema,
        } as any,
        context,
      )

      await handler({
        urlParams: { reportId: '456' },
        params: { format: 'pdf' },
      } as any)

      expect(client.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/reports/456/export',
          params: { format: 'pdf' },
        }),
      )
    })
  })

  describe('POST stream requests', () => {
    it('should make POST request with data and return Blob', async () => {
      const blob = new Blob(['generated report'], { type: 'application/pdf' })
      const client = createMockClient(blob)
      const context = createContext(client)

      const handler = createStream(
        {
          method: 'POST',
          url: '/reports/generate',
          requestSchema,
        } as any,
        context,
      )

      await handler({
        data: {
          filters: { startDate: '2024-01-01', endDate: '2024-12-31' },
        },
      } as any)

      expect(client.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/reports/generate',
          data: {
            filters: { startDate: '2024-01-01', endDate: '2024-12-31' },
          },
        }),
      )
    })

    it('should handle POST with URL params and data', async () => {
      const blob = new Blob(['user report'], { type: 'application/pdf' })
      const client = createMockClient(blob)
      const context = createContext(client)

      const handler = createStream(
        {
          method: 'POST',
          url: '/users/$userId/reports/generate',
          requestSchema,
        } as any,
        context,
      )

      await handler({
        urlParams: { userId: '789' },
        data: {
          filters: { startDate: '2024-01-01', endDate: '2024-06-30' },
        },
      } as any)

      expect(client.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/users/789/reports/generate',
        }),
      )
    })
  })

  describe('PUT/PATCH stream requests', () => {
    it('should make PUT request and return Blob', async () => {
      const blob = new Blob(['updated content'], { type: 'application/pdf' })
      const client = createMockClient(blob)
      const context = createContext(client)

      const handler = createStream(
        {
          method: 'PUT',
          url: '/documents/$docId/render',
          requestSchema,
        } as any,
        context,
      )

      await handler({
        urlParams: { docId: '100' },
        data: {
          filters: { startDate: '2024-01-01', endDate: '2024-12-31' },
        },
      } as any)

      expect(client.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PUT',
        }),
      )
    })

    it('should make PATCH request and return Blob', async () => {
      const blob = new Blob(['patched content'], { type: 'application/pdf' })
      const client = createMockClient(blob)
      const context = createContext(client)

      const handler = createStream(
        {
          method: 'PATCH',
          url: '/documents/$docId/render',
          requestSchema,
        } as any,
        context,
      )

      await handler({
        urlParams: { docId: '100' },
        data: {
          filters: { startDate: '2024-01-01', endDate: '2024-12-31' },
        },
      } as any)

      expect(client.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PATCH',
        }),
      )
    })
  })

  describe('DELETE stream requests', () => {
    it('should make DELETE request and return Blob', async () => {
      const blob = new Blob(['deletion report'], { type: 'application/json' })
      const client = createMockClient(blob)
      const context = createContext(client)

      const handler = createStream(
        {
          method: 'DELETE',
          url: '/cleanup/$batchId',
        } as any,
        context,
      )

      await handler({ urlParams: { batchId: '999' } } as any)

      expect(client.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'DELETE',
          url: '/cleanup/999',
        }),
      )
    })
  })

  describe('responseType handling', () => {
    it('should always set responseType to blob', async () => {
      const blob = new Blob(['content'], { type: 'application/octet-stream' })
      const client = createMockClient(blob)
      const context = createContext(client)

      const handler = createStream(
        {
          method: 'GET',
          url: '/download',
        } as any,
        context,
      )

      await handler({} as any)

      expect(client.request).toHaveBeenCalledWith(
        expect.objectContaining({
          responseType: 'blob',
        }),
      )
    })

    it('should preserve responseType even with other request options', async () => {
      const blob = new Blob(['content'], { type: 'application/octet-stream' })
      const client = createMockClient(blob)
      const context = createContext(client)

      const handler = createStream(
        {
          method: 'GET',
          url: '/download',
        } as any,
        context,
      )

      await handler({
        headers: { Accept: 'application/pdf' },
      } as any)

      expect(client.request).toHaveBeenCalledWith(
        expect.objectContaining({
          responseType: 'blob',
          headers: { Accept: 'application/pdf' },
        }),
      )
    })
  })

  describe('error handling', () => {
    it('should call onError callback on request failure', async () => {
      const onError = vi.fn()
      const client: Client = {
        request: vi.fn().mockRejectedValue(new Error('Download failed')),
      }
      const context = createContext(client, { onError })

      const handler = createStream(
        {
          method: 'GET',
          url: '/download',
        } as any,
        context,
      )

      await expect(handler({} as any)).rejects.toThrow('Download failed')
      expect(onError).toHaveBeenCalled()
    })

    it('should handle network errors', async () => {
      const client: Client = {
        request: vi.fn().mockRejectedValue(new Error('Network error')),
      }
      const context = createContext(client)

      const handler = createStream(
        {
          method: 'GET',
          url: '/download',
        } as any,
        context,
      )

      await expect(handler({} as any)).rejects.toThrow('Network error')
    })

    it('should handle timeout errors', async () => {
      const client: Client = {
        request: vi.fn().mockRejectedValue(new Error('Request timeout')),
      }
      const context = createContext(client)

      const handler = createStream(
        {
          method: 'GET',
          url: '/download/large-file',
        } as any,
        context,
      )

      await expect(handler({} as any)).rejects.toThrow('Request timeout')
    })
  })

  describe('request options', () => {
    it('should pass through headers', async () => {
      const blob = new Blob(['content'], { type: 'application/pdf' })
      const client = createMockClient(blob)
      const context = createContext(client)

      const handler = createStream(
        {
          method: 'GET',
          url: '/download',
        } as any,
        context,
      )

      await handler({
        headers: {
          Authorization: 'Bearer token',
          'Accept-Language': 'en-US',
        },
      } as any)

      expect(client.request).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer token',
            'Accept-Language': 'en-US',
          },
        }),
      )
    })

    it('should pass through signal for cancellation', async () => {
      const blob = new Blob(['content'], { type: 'application/pdf' })
      const client = createMockClient(blob)
      const context = createContext(client)
      const controller = new AbortController()

      const handler = createStream(
        {
          method: 'GET',
          url: '/download',
        } as any,
        context,
      )

      await handler({ signal: controller.signal } as any)

      expect(client.request).toHaveBeenCalledWith(
        expect.objectContaining({
          signal: controller.signal,
        }),
      )
    })
  })

  describe('default request parameter', () => {
    it('should use empty object as default request', async () => {
      const blob = new Blob(['content'], { type: 'application/octet-stream' })
      const client = createMockClient(blob)
      const context = createContext(client)

      const handler = createStream(
        {
          method: 'GET',
          url: '/download',
        } as any,
        context,
      )

      await handler()

      expect(client.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: '/download',
          responseType: 'blob',
        }),
      )
    })
  })

  describe('return type', () => {
    it('should return the Blob from response data', async () => {
      const expectedBlob = new Blob(['test content'], { type: 'text/plain' })
      const client = createMockClient(expectedBlob)
      const context = createContext(client)

      const handler = createStream(
        {
          method: 'GET',
          url: '/download',
        } as any,
        context,
      )

      const result = await handler({} as any)

      expect(result).toBe(expectedBlob)
      expect(result).toBeInstanceOf(Blob)
    })
  })
})
