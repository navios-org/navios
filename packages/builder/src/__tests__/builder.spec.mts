import { describe, expect, it, vi } from 'vitest'
import { z, ZodError } from 'zod/v4'

import { builder } from '../http/builder.mjs'
import { EndpointError, NaviosError } from '../index.mjs'

import type { Client } from '../index.mjs'

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
      expect(api).toHaveProperty('provideClient')
      expect(api).toHaveProperty('getClient')
      expect(api).toHaveProperty('withClient')
      expect(api).not.toHaveProperty('declareMultipart')
      expect(api).not.toHaveProperty('declareStream')
    })

    it('should accept optional config', () => {
      const onError = vi.fn()
      const api = builder({ onError })

      expect(api).toBeDefined()
    })

    it('should accept a client in the config', () => {
      const client = createMockClient({ id: '1', name: 'Test' })
      const api = builder({ client, onError: vi.fn() })

      expect(api.getClient()).toBe(client)
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
      expect(() => api.getClient()).toThrow('[Navios-API]: Client was not provided')
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

  describe("declareEndpoint with body: 'multipart'", () => {
    it('should bind URL params on a multipart endpoint', async () => {
      const api = builder()
      const client = createMockClient({ id: '1', name: 'avatar.png' })
      api.provideClient(client)

      const endpoint = api.declareEndpoint({
        method: 'POST',
        url: '/users/$userId/avatar',
        body: 'multipart',
        requestSchema: z.object({ file: z.instanceof(File) }),
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
          data: expect.any(FormData),
        }),
      )
    })

    it('should send an empty FormData when there is no requestSchema and no data', async () => {
      const api = builder()
      const client = createMockClient({ id: '1', name: 'Test' })
      api.provideClient(client)

      const endpoint = api.declareEndpoint({
        method: 'POST',
        url: '/upload',
        body: 'multipart',
        responseSchema,
      })

      await endpoint()

      const call = vi.mocked(client.request).mock.calls[0]![0]
      expect(call.data).toBeInstanceOf(FormData)
      expect([...(call.data as FormData).keys()]).toEqual([])
    })

    it('should attach config to multipart endpoint', () => {
      const api = builder()

      const endpoint = api.declareEndpoint({
        method: 'POST',
        url: '/upload',
        body: 'multipart',
        responseSchema,
      })

      expect(endpoint.config).toMatchObject({
        method: 'POST',
        url: '/upload',
        body: 'multipart',
      })
    })
  })

  describe("declareEndpoint with response: 'blob'", () => {
    function createBlobClient(blob: Blob): Client {
      return {
        request: vi.fn().mockResolvedValue({
          data: blob,
          status: 200,
          statusText: 'OK',
          headers: {},
        }),
      }
    }

    it('should parse query params on a blob endpoint', async () => {
      const blob = new Blob(['csv content'], { type: 'text/csv' })
      const api = builder()
      const client = createBlobClient(blob)
      api.provideClient(client)

      const endpoint = api.declareEndpoint({
        method: 'GET',
        url: '/export',
        response: 'blob',
        querySchema,
      })

      await expect(endpoint({ params: { page: 1, limit: 100 } })).resolves.toBe(blob)

      expect(client.request).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { page: 1, limit: 100 },
          responseType: 'blob',
        }),
      )
    })

    it('should send a validated body on a POST blob endpoint', async () => {
      const blob = new Blob(['generated report'], { type: 'application/pdf' })
      const api = builder()
      const client = createBlobClient(blob)
      api.provideClient(client)

      const endpoint = api.declareEndpoint({
        method: 'POST',
        url: '/reports/generate',
        response: 'blob',
        requestSchema,
      })

      await endpoint({ data: { name: 'Report', email: 'test@example.com' } })

      expect(client.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          data: { name: 'Report', email: 'test@example.com' },
          responseType: 'blob',
        }),
      )
    })

    it('should attach config to blob endpoint', () => {
      const api = builder()

      const endpoint = api.declareEndpoint({
        method: 'GET',
        url: '/download',
        response: 'blob',
      })

      expect(endpoint.config).toEqual({
        method: 'GET',
        url: '/download',
        response: 'blob',
      })
    })
  })

  describe('error handling with config', () => {
    it('should wrap a transport failure in an EndpointError and pass it to onError', async () => {
      const onError = vi.fn<(error: EndpointError) => void>()
      const cause = new Error('Network error')
      const client: Client = {
        request: vi.fn().mockRejectedValue(cause),
      }
      const api = builder({ client, onError })

      const endpoint = api.declareEndpoint({
        method: 'GET',
        url: '/users',
        responseSchema,
      })

      const thrown = await endpoint({}).catch((e: unknown) => e)

      expect(thrown).toBeInstanceOf(EndpointError)
      expect(thrown).toMatchObject({
        kind: 'network',
        cause,
        endpoint: { method: 'GET', url: '/users' },
      })
      expect((thrown as EndpointError).message).not.toBe('Network error')
      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError.mock.calls[0]![0]).toBe(thrown)
    })

    it('should report invalid request data as request-validation, not a raw ZodError', async () => {
      const client = createMockClient({ id: '1', name: 'Test' })
      const api = builder({ client })

      const endpoint = api.declareEndpoint({
        method: 'POST',
        url: '/users',
        requestSchema,
        responseSchema,
      })

      const thrown = await endpoint({ data: { name: 'John' } as never }).catch((e: unknown) => e)

      expect(thrown).toBeInstanceOf(EndpointError)
      expect(thrown).not.toBeInstanceOf(ZodError)
      expect((thrown as EndpointError).kind).toBe('request-validation')
      expect((thrown as EndpointError).cause).toBeInstanceOf(ZodError)
      expect(client.request).not.toHaveBeenCalled()
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

        expect(client.request).toHaveBeenCalledWith(expect.objectContaining({ method }))
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

        expect(client.request).toHaveBeenCalledWith(expect.objectContaining({ method }))
      },
    )
  })
})
