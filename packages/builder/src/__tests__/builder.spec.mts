import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import type { Client } from '../types/index.mjs'

import { builder } from '../builder.mjs'
import { NaviosError } from '../errors/index.mjs'

describe('builder', () => {
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

  function createMockClient(response: unknown): Client {
    return {
      request: vi.fn().mockResolvedValue({
        data: response,
        status: 200,
        statusText: 'OK',
        headers: {},
      }),
    }
  }

  describe('builder creation', () => {
    it('should create a builder instance', () => {
      const api = builder()

      expect(api).toHaveProperty('declareEndpoint')
      expect(api).toHaveProperty('declareMultipart')
      expect(api).toHaveProperty('declareStream')
      expect(api).toHaveProperty('provideClient')
      expect(api).toHaveProperty('getClient')
    })

    it('should accept optional config', () => {
      const onError = vi.fn()
      const api = builder({ onError })

      expect(api).toBeDefined()
    })

    it('should accept config with useDiscriminatorResponse', () => {
      const api = builder({ useDiscriminatorResponse: true })

      expect(api).toBeDefined()
    })

    it('should accept config with onZodError', () => {
      const onZodError = vi.fn()
      const api = builder({ onZodError })

      expect(api).toBeDefined()
    })

    it('should accept full config', () => {
      const api = builder({
        onError: vi.fn(),
        onZodError: vi.fn(),
        useDiscriminatorResponse: true,
      })

      expect(api).toBeDefined()
    })
  })

  describe('provideClient', () => {
    it('should provide a client', () => {
      const api = builder()
      const client = createMockClient({ id: '1', name: 'Test' })

      api.provideClient(client)

      expect(api.getClient()).toBe(client)
    })

    it('should allow replacing the client', () => {
      const api = builder()
      const client1 = createMockClient({ id: '1', name: 'First' })
      const client2 = createMockClient({ id: '2', name: 'Second' })

      api.provideClient(client1)
      expect(api.getClient()).toBe(client1)

      api.provideClient(client2)
      expect(api.getClient()).toBe(client2)
    })
  })

  describe('getClient', () => {
    it('should throw NaviosError when client is not provided', () => {
      const api = builder()

      expect(() => api.getClient()).toThrow(NaviosError)
      expect(() => api.getClient()).toThrow(
        '[Navios-API]: Client was not provided',
      )
    })

    it('should return the provided client', () => {
      const api = builder()
      const client = createMockClient({ id: '1', name: 'Test' })

      api.provideClient(client)

      expect(api.getClient()).toBe(client)
    })
  })

  describe('declareEndpoint', () => {
    it('should create a GET endpoint', async () => {
      const api = builder()
      const client = createMockClient({ id: '1', name: 'Test' })
      api.provideClient(client)

      const endpoint = api.declareEndpoint({
        method: 'GET',
        url: '/users',
        responseSchema,
      })

      const result = await endpoint({})

      expect(result).toEqual({ id: '1', name: 'Test' })
      expect(client.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: '/users',
        }),
      )
    })

    it('should create a POST endpoint', async () => {
      const api = builder()
      const client = createMockClient({ id: '1', name: 'John' })
      api.provideClient(client)

      const endpoint = api.declareEndpoint({
        method: 'POST',
        url: '/users',
        requestSchema,
        responseSchema,
      })

      const result = await endpoint({
        data: { name: 'John', email: 'john@example.com' },
      })

      expect(result).toEqual({ id: '1', name: 'John' })
    })

    it('should create endpoint with query schema', async () => {
      const api = builder()
      const client = createMockClient({ id: '1', name: 'Test' })
      api.provideClient(client)

      const endpoint = api.declareEndpoint({
        method: 'GET',
        url: '/users',
        querySchema,
        responseSchema,
      })

      await endpoint({ params: { page: 1, limit: 10 } })

      expect(client.request).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { page: 1, limit: 10 },
        }),
      )
    })

    it('should create endpoint with URL params', async () => {
      const api = builder()
      const client = createMockClient({ id: '123', name: 'Test' })
      api.provideClient(client)

      const endpoint = api.declareEndpoint({
        method: 'GET',
        url: '/users/$userId',
        responseSchema,
      })

      await endpoint({ urlParams: { userId: '123' } })

      expect(client.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/users/123',
        }),
      )
    })

    it('should attach config to endpoint', () => {
      const api = builder()
      const client = createMockClient({ id: '1', name: 'Test' })
      api.provideClient(client)

      const config = {
        method: 'GET' as const,
        url: '/users',
        responseSchema,
      }

      const endpoint = api.declareEndpoint(config)

      expect(endpoint.config).toMatchObject({
        method: 'GET',
        url: '/users',
      })
    })
  })

  describe('declareMultipart', () => {
    it('should create a multipart endpoint', async () => {
      const api = builder()
      const client = createMockClient({ id: '1', name: 'uploaded.txt' })
      api.provideClient(client)

      const multipartSchema = z.object({
        name: z.string(),
        file: z.instanceof(File),
      })

      const endpoint = api.declareMultipart({
        method: 'POST',
        url: '/upload',
        requestSchema: multipartSchema,
        responseSchema,
      })

      const file = new File(['content'], 'test.txt', { type: 'text/plain' })
      const result = await endpoint({ data: { name: 'Test', file } })

      expect(result).toEqual({ id: '1', name: 'uploaded.txt' })

      const call = (client.request as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(call.data).toBeInstanceOf(FormData)
    })

    it('should create multipart endpoint with URL params', async () => {
      const api = builder()
      const client = createMockClient({ id: '1', name: 'avatar.png' })
      api.provideClient(client)

      const multipartSchema = z.object({
        file: z.instanceof(File),
      })

      const endpoint = api.declareMultipart({
        method: 'POST',
        url: '/users/$userId/avatar',
        requestSchema: multipartSchema,
        responseSchema,
      })

      const file = new File(['image'], 'avatar.png', { type: 'image/png' })
      await endpoint({
        urlParams: { userId: '123' },
        data: { file },
      })

      expect(client.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/users/123/avatar',
        }),
      )
    })

    it('should attach config to multipart endpoint', () => {
      const api = builder()
      const client = createMockClient({ id: '1', name: 'Test' })
      api.provideClient(client)

      const endpoint = api.declareMultipart({
        method: 'POST',
        url: '/upload',
        responseSchema,
      })

      expect(endpoint.config).toMatchObject({
        method: 'POST',
        url: '/upload',
      })
    })
  })

  describe('declareStream', () => {
    it('should create a stream endpoint', async () => {
      const blob = new Blob(['file content'], { type: 'text/plain' })
      const api = builder()
      const client: Client = {
        request: vi.fn().mockResolvedValue({
          data: blob,
          status: 200,
          statusText: 'OK',
          headers: {},
        }),
      }
      api.provideClient(client)

      const endpoint = api.declareStream({
        method: 'GET',
        url: '/download',
      })

      const result = await endpoint({})

      expect(result).toBe(blob)
      expect(client.request).toHaveBeenCalledWith(
        expect.objectContaining({
          responseType: 'blob',
        }),
      )
    })

    it('should create stream endpoint with query params', async () => {
      const blob = new Blob(['csv content'], { type: 'text/csv' })
      const api = builder()
      const client: Client = {
        request: vi.fn().mockResolvedValue({
          data: blob,
          status: 200,
          statusText: 'OK',
          headers: {},
        }),
      }
      api.provideClient(client)

      const endpoint = api.declareStream({
        method: 'GET',
        url: '/export',
        querySchema,
      })

      await endpoint({ params: { page: 1, limit: 100 } })

      expect(client.request).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { page: 1, limit: 100 },
        }),
      )
    })

    it('should create POST stream endpoint', async () => {
      const blob = new Blob(['generated report'], { type: 'application/pdf' })
      const api = builder()
      const client: Client = {
        request: vi.fn().mockResolvedValue({
          data: blob,
          status: 200,
          statusText: 'OK',
          headers: {},
        }),
      }
      api.provideClient(client)

      const endpoint = api.declareStream({
        method: 'POST',
        url: '/reports/generate',
        requestSchema,
      })

      await endpoint({ data: { name: 'Report', email: 'test@example.com' } })

      expect(client.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
        }),
      )
    })

    it('should attach config to stream endpoint', () => {
      const api = builder()
      const client: Client = {
        request: vi.fn().mockResolvedValue({
          data: new Blob(),
          status: 200,
          statusText: 'OK',
          headers: {},
        }),
      }
      api.provideClient(client)

      const endpoint = api.declareStream({
        method: 'GET',
        url: '/download',
      })

      expect(endpoint.config).toMatchObject({
        method: 'GET',
        url: '/download',
      })
    })
  })

  describe('error handling with config', () => {
    it('should call onError when request fails', async () => {
      const onError = vi.fn()
      const api = builder({ onError })
      const client: Client = {
        request: vi.fn().mockRejectedValue(new Error('Network error')),
      }
      api.provideClient(client)

      const endpoint = api.declareEndpoint({
        method: 'GET',
        url: '/users',
        responseSchema,
      })

      await expect(endpoint({})).rejects.toThrow('Network error')
      expect(onError).toHaveBeenCalled()
    })

    it('should use discriminator response when configured', async () => {
      const discriminatorSchema = z.discriminatedUnion('type', [
        z.object({ type: z.literal('success'), id: z.string(), name: z.string() }),
        z.object({ type: z.literal('error'), message: z.string() }),
      ])

      const api = builder({ useDiscriminatorResponse: true })
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
      api.provideClient(client)

      const endpoint = api.declareEndpoint({
        method: 'GET',
        url: '/users/$userId',
        responseSchema: discriminatorSchema,
      })

      const result = await endpoint({ urlParams: { userId: '999' } })

      expect(result).toEqual({ type: 'error', message: 'Not found' })
    })
  })

  describe('multiple builders', () => {
    it('should support multiple independent builder instances', async () => {
      const api1 = builder()
      const api2 = builder()

      const client1 = createMockClient({ id: '1', name: 'Client1' })
      const client2 = createMockClient({ id: '2', name: 'Client2' })

      api1.provideClient(client1)
      api2.provideClient(client2)

      const endpoint1 = api1.declareEndpoint({
        method: 'GET',
        url: '/users',
        responseSchema,
      })

      const endpoint2 = api2.declareEndpoint({
        method: 'GET',
        url: '/users',
        responseSchema,
      })

      const result1 = await endpoint1({})
      const result2 = await endpoint2({})

      expect(result1).toEqual({ id: '1', name: 'Client1' })
      expect(result2).toEqual({ id: '2', name: 'Client2' })
    })
  })

  describe('HTTP methods', () => {
    it.each(['GET', 'DELETE', 'HEAD', 'OPTIONS'] as const)(
      'should support %s method for read-only endpoints',
      async (method) => {
        const api = builder()
        const client = createMockClient({ id: '1', name: 'Test' })
        api.provideClient(client)

        const endpoint = api.declareEndpoint({
          method,
          url: '/resource',
          responseSchema,
        })

        await endpoint({})

        expect(client.request).toHaveBeenCalledWith(
          expect.objectContaining({ method }),
        )
      },
    )

    it.each(['POST', 'PUT', 'PATCH'] as const)(
      'should support %s method for write endpoints',
      async (method) => {
        const api = builder()
        const client = createMockClient({ id: '1', name: 'Test' })
        api.provideClient(client)

        const endpoint = api.declareEndpoint({
          method,
          url: '/resource',
          requestSchema,
          responseSchema,
        })

        await endpoint({ data: { name: 'Test', email: 'test@example.com' } })

        expect(client.request).toHaveBeenCalledWith(
          expect.objectContaining({ method }),
        )
      },
    )
  })
})
