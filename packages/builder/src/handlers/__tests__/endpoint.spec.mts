import { describe, expect, it, vi } from 'vitest'
import { z, ZodError } from 'zod/v4'

import type { AbstractResponse, BuilderContext, Client } from '../../types/index.mjs'

import { createEndpoint } from '../endpoint.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('createEndpoint', () => {
  const responseSchema = z.object({
    id: z.string(),
    name: z.string(),
  })

  const querySchema = z.object({
    page: z.number(),
    limit: z.number(),
  })

  const requestSchema = z.object({
    name: z.string(),
    email: z.string(),
  })

  function createMockClient(
    response: unknown,
    status = 200,
  ): Client {
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

  describe('basic endpoint creation', () => {
    it('should create a callable handler', () => {
      const client = createMockClient({ id: '1', name: 'Test' })
      const context = createContext(client)

      const handler = createEndpoint(
        {
          method: 'GET',
          url: '/users',
          responseSchema,
        } as any,
        context,
      )

      expect(typeof handler).toBe('function')
    })

    it('should attach config to handler', () => {
      const client = createMockClient({ id: '1', name: 'Test' })
      const context = createContext(client)

      const options = {
        method: 'GET' as const,
        url: '/users',
        responseSchema,
      }

      const handler = createEndpoint(options as any, context)

      expect(handler.config).toBe(options)
    })
  })

  describe('GET requests', () => {
    it('should make GET request and parse response', async () => {
      const client = createMockClient({ id: '1', name: 'Test' })
      const context = createContext(client)

      const handler = createEndpoint(
        {
          method: 'GET',
          url: '/users',
          responseSchema,
        } as any,
        context,
      )

      const result = await handler({} as any)

      expect(client.request).toHaveBeenCalledWith({
        method: 'GET',
        url: '/users',
        params: {},
        data: undefined,
      })
      expect(result).toEqual({ id: '1', name: 'Test' })
    })

    it('should handle URL params', async () => {
      const client = createMockClient({ id: '1', name: 'Test' })
      const context = createContext(client)

      const handler = createEndpoint(
        {
          method: 'GET',
          url: '/users/$userId',
          responseSchema,
        } as any,
        context,
      )

      await handler({ urlParams: { userId: '123' } } as any)

      expect(client.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: '/users/123',
        }),
      )
    })

    it('should handle query params', async () => {
      const client = createMockClient({ id: '1', name: 'Test' })
      const context = createContext(client)

      const handler = createEndpoint(
        {
          method: 'GET',
          url: '/users',
          querySchema,
          responseSchema,
        } as any,
        context,
      )

      await handler({ params: { page: 1, limit: 10 } } as any)

      expect(client.request).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { page: 1, limit: 10 },
        }),
      )
    })

    it('should handle both URL params and query params', async () => {
      const client = createMockClient({ id: '1', name: 'Test' })
      const context = createContext(client)

      const handler = createEndpoint(
        {
          method: 'GET',
          url: '/users/$userId/posts',
          querySchema,
          responseSchema,
        } as any,
        context,
      )

      await handler({
        urlParams: { userId: '123' },
        params: { page: 1, limit: 10 },
      } as any)

      expect(client.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/users/123/posts',
          params: { page: 1, limit: 10 },
        }),
      )
    })
  })

  describe('POST/PUT/PATCH requests', () => {
    it('should make POST request with data', async () => {
      const client = createMockClient({ id: '1', name: 'John' })
      const context = createContext(client)

      const handler = createEndpoint(
        {
          method: 'POST',
          url: '/users',
          requestSchema,
          responseSchema,
        } as any,
        context,
      )

      await handler({ data: { name: 'John', email: 'john@example.com' } } as any)

      expect(client.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          data: { name: 'John', email: 'john@example.com' },
        }),
      )
    })

    it('should make PUT request with URL params and data', async () => {
      const client = createMockClient({ id: '1', name: 'John' })
      const context = createContext(client)

      const handler = createEndpoint(
        {
          method: 'PUT',
          url: '/users/$userId',
          requestSchema,
          responseSchema,
        } as any,
        context,
      )

      await handler({
        urlParams: { userId: '123' },
        data: { name: 'John', email: 'john@example.com' },
      } as any)

      expect(client.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PUT',
          url: '/users/123',
          data: { name: 'John', email: 'john@example.com' },
        }),
      )
    })

    it('should make PATCH request', async () => {
      const client = createMockClient({ id: '1', name: 'John' })
      const context = createContext(client)

      const handler = createEndpoint(
        {
          method: 'PATCH',
          url: '/users/$userId',
          requestSchema,
          responseSchema,
        } as any,
        context,
      )

      await handler({
        urlParams: { userId: '123' },
        data: { name: 'John', email: 'john@example.com' },
      } as any)

      expect(client.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PATCH',
        }),
      )
    })
  })

  describe('DELETE requests', () => {
    it('should make DELETE request', async () => {
      const client = createMockClient({ id: '1', name: 'Deleted' })
      const context = createContext(client)

      const handler = createEndpoint(
        {
          method: 'DELETE',
          url: '/users/$userId',
          responseSchema,
        } as any,
        context,
      )

      await handler({ urlParams: { userId: '123' } } as any)

      expect(client.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'DELETE',
          url: '/users/123',
        }),
      )
    })
  })

  describe('response parsing', () => {
    it('should parse response with schema', async () => {
      const client = createMockClient({ id: '1', name: 'Test', extra: 'field' })
      const context = createContext(client)

      const handler = createEndpoint(
        {
          method: 'GET',
          url: '/users',
          responseSchema,
        } as any,
        context,
      )

      const result = await handler({} as any)

      // Schema should strip extra fields (strict parsing behavior depends on zod version)
      expect(result).toHaveProperty('id', '1')
      expect(result).toHaveProperty('name', 'Test')
    })

    it('should throw ZodError for invalid response', async () => {
      const client = createMockClient({ invalid: 'data' })
      const context = createContext(client)

      const handler = createEndpoint(
        {
          method: 'GET',
          url: '/users',
          responseSchema,
        } as any,
        context,
      )

      await expect(handler({} as any)).rejects.toThrow(ZodError)
    })

    it('should transform response with schema', async () => {
      const transformSchema = z.object({
        id: z.coerce.string(),
        name: z.string().transform((s) => s.toUpperCase()),
      })

      const client = createMockClient({ id: 123, name: 'test' })
      const context = createContext(client)

      const handler = createEndpoint(
        {
          method: 'GET',
          url: '/users',
          responseSchema: transformSchema,
        } as any,
        context,
      )

      const result = await handler({} as any)

      expect(result).toEqual({ id: '123', name: 'TEST' })
    })
  })

  describe('error handling', () => {
    it('should call onError callback on request failure', async () => {
      const onError = vi.fn()
      const client: Client = {
        request: vi.fn().mockRejectedValue(new Error('Network error')),
      }
      const context = createContext(client, { onError })

      const handler = createEndpoint(
        {
          method: 'GET',
          url: '/users',
          responseSchema,
        } as any,
        context,
      )

      await expect(handler({} as any)).rejects.toThrow('Network error')
      expect(onError).toHaveBeenCalled()
    })

    it('should use discriminator response on error', async () => {
      const discriminatorSchema = z.discriminatedUnion('type', [
        z.object({ type: z.literal('success'), id: z.string(), name: z.string() }),
        z.object({ type: z.literal('error'), message: z.string() }),
      ])

      const client: Client = {
        request: vi.fn().mockRejectedValue({
          response: {
            data: { type: 'error', message: 'Not found' },
            status: 404,
            statusText: 'Not Found',
            headers: {},
          },
        }),
      }
      const context = createContext(client, { useDiscriminatorResponse: true })

      const handler = createEndpoint(
        {
          method: 'GET',
          url: '/users',
          responseSchema: discriminatorSchema,
        } as any,
        context,
      )

      const result = await handler({} as any)

      expect(result).toEqual({ type: 'error', message: 'Not found' })
    })
  })

  describe('request options', () => {
    it('should pass through headers', async () => {
      const client = createMockClient({ id: '1', name: 'Test' })
      const context = createContext(client)

      const handler = createEndpoint(
        {
          method: 'GET',
          url: '/users',
          responseSchema,
        } as any,
        context,
      )

      await handler({ headers: { Authorization: 'Bearer token' } } as any)

      expect(client.request).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: { Authorization: 'Bearer token' },
        }),
      )
    })

    it('should pass through signal for cancellation', async () => {
      const client = createMockClient({ id: '1', name: 'Test' })
      const context = createContext(client)
      const controller = new AbortController()

      const handler = createEndpoint(
        {
          method: 'GET',
          url: '/users',
          responseSchema,
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
      const client = createMockClient({ id: '1', name: 'Test' })
      const context = createContext(client)

      const handler = createEndpoint(
        {
          method: 'GET',
          url: '/users',
          responseSchema,
        } as any,
        context,
      )

      // Call without arguments
      await handler()

      expect(client.request).toHaveBeenCalledWith({
        method: 'GET',
        url: '/users',
        params: {},
        data: undefined,
      })
    })
  })
})
