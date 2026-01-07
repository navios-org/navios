import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import type { MockClient } from './mock-client.mjs'

import { builder } from '../../builder.mjs'
import { UnknownResponseError } from '../../errors/unknown-response-error.mjs'
import { isErrorResponse, isErrorStatus } from '../../types/error-schema.mjs'
import {
  createMockClient,
  errorResponse,
  successResponse,
} from './mock-client.mjs'

describe('Error Scenarios', () => {
  describe('without discriminator mode', () => {
    let mockClient: MockClient
    let api: ReturnType<typeof builder>

    beforeEach(() => {
      mockClient = createMockClient()
      api = builder({ useDiscriminatorResponse: false })
      api.provideClient(mockClient)
    })

    it('should throw on 4xx error response', async () => {
      const getUser = api.declareEndpoint({
        method: 'GET',
        url: '/users/$userId',
        responseSchema: z.object({ id: z.string() }),
      })

      mockClient.mockResponse(
        'GET',
        '/users/123',
        errorResponse({ error: 'User not found' }, 404),
      )

      await expect(getUser({ urlParams: { userId: '123' } })).rejects.toThrow()
    })

    it('should throw on 5xx error response', async () => {
      const getUser = api.declareEndpoint({
        method: 'GET',
        url: '/users/$userId',
        responseSchema: z.object({ id: z.string() }),
      })

      mockClient.mockResponse(
        'GET',
        '/users/123',
        errorResponse({ error: 'Internal server error' }, 500),
      )

      await expect(getUser({ urlParams: { userId: '123' } })).rejects.toThrow()
    })

    it('should throw on network error', async () => {
      mockClient.setFailure(true, new Error('Network failure'))

      const getUser = api.declareEndpoint({
        method: 'GET',
        url: '/users/$userId',
        responseSchema: z.object({ id: z.string() }),
      })

      await expect(getUser({ urlParams: { userId: '123' } })).rejects.toThrow(
        'Network failure',
      )
    })

    it('should throw on response schema validation failure', async () => {
      const getUser = api.declareEndpoint({
        method: 'GET',
        url: '/users/$userId',
        responseSchema: z.object({
          id: z.string(),
          name: z.string(),
        }),
      })

      // Response missing required 'name' field
      mockClient.mockResponse(
        'GET',
        '/users/123',
        successResponse({ id: '123' }),
      )

      await expect(getUser({ urlParams: { userId: '123' } })).rejects.toThrow()
    })
  })

  describe('with discriminator mode and errorSchema', () => {
    let mockClient: MockClient
    let api: ReturnType<typeof builder<true>>

    beforeEach(() => {
      mockClient = createMockClient()
      api = builder({ useDiscriminatorResponse: true })
      api.provideClient(mockClient)
    })

    it('should return parsed error response with __status for 400', async () => {
      const createUser = api.declareEndpoint({
        method: 'POST',
        url: '/users',
        requestSchema: z.object({ name: z.string() }),
        responseSchema: z.object({ id: z.string(), name: z.string() }),
        errorSchema: {
          400: z.object({ error: z.string(), field: z.string() }),
          404: z.object({ message: z.string() }),
        },
      })

      mockClient.mockResponse(
        'POST',
        '/users',
        errorResponse({ error: 'Validation failed', field: 'email' }, 400),
      )

      const result = await createUser({ data: { name: 'John' } })

      expect(result).toEqual({
        error: 'Validation failed',
        field: 'email',
        __status: 400,
      })
    })

    it('should return parsed error response with __status for 404', async () => {
      const getUser = api.declareEndpoint({
        method: 'GET',
        url: '/users/$userId',
        responseSchema: z.object({ id: z.string(), name: z.string() }),
        errorSchema: {
          404: z.object({ message: z.string() }),
          403: z.object({ reason: z.string() }),
        },
      })

      mockClient.mockResponse(
        'GET',
        '/users/123',
        errorResponse({ message: 'User not found' }, 404),
      )

      const result = await getUser({ urlParams: { userId: '123' } })

      expect(result).toEqual({
        message: 'User not found',
        __status: 404,
      })
    })

    it('should throw UnknownResponseError for unhandled status code', async () => {
      const getUser = api.declareEndpoint({
        method: 'GET',
        url: '/users/$userId',
        responseSchema: z.object({ id: z.string() }),
        errorSchema: {
          404: z.object({ message: z.string() }),
        },
      })

      // 500 is not in errorSchema
      mockClient.mockResponse(
        'GET',
        '/users/123',
        errorResponse({ error: 'Internal server error' }, 500),
      )

      await expect(getUser({ urlParams: { userId: '123' } })).rejects.toThrow(
        UnknownResponseError,
      )
    })

    it('should return success response when request succeeds', async () => {
      const getUser = api.declareEndpoint({
        method: 'GET',
        url: '/users/$userId',
        responseSchema: z.object({ id: z.string(), name: z.string() }),
        errorSchema: {
          404: z.object({ message: z.string() }),
        },
      })

      mockClient.mockResponse(
        'GET',
        '/users/123',
        successResponse({
          id: '123',
          name: 'John',
        }),
      )

      const result = await getUser({ urlParams: { userId: '123' } })

      expect(result).toEqual({ id: '123', name: 'John' })
      // Success response should NOT have __status
      expect('__status' in result).toBe(false)
    })
  })

  describe('type guards', () => {
    let mockClient: MockClient
    let api: ReturnType<typeof builder<true>>

    beforeEach(() => {
      mockClient = createMockClient()
      api = builder({ useDiscriminatorResponse: true })
      api.provideClient(mockClient)
    })

    it('should work with isErrorStatus type guard', async () => {
      const getUser = api.declareEndpoint({
        method: 'GET',
        url: '/users/$userId',
        responseSchema: z.object({ id: z.string(), name: z.string() }),
        errorSchema: {
          404: z.object({ message: z.string() }),
          403: z.object({ reason: z.string() }),
        },
      })

      mockClient.mockResponse(
        'GET',
        '/users/123',
        errorResponse({ message: 'User not found' }, 404),
      )

      const result = await getUser({ urlParams: { userId: '123' } })

      if (isErrorStatus(result, 404)) {
        expect(result.message).toBe('User not found')
        expect(result.__status).toBe(404)
      } else {
        throw new Error('Expected 404 error')
      }
    })

    it('should work with isErrorResponse type guard', async () => {
      const getUser = api.declareEndpoint({
        method: 'GET',
        url: '/users/$userId',
        responseSchema: z.object({ id: z.string(), name: z.string() }),
        errorSchema: {
          404: z.object({ message: z.string() }),
        },
      })

      mockClient.mockResponse(
        'GET',
        '/users/123',
        errorResponse({ message: 'User not found' }, 404),
      )

      const result = await getUser({ urlParams: { userId: '123' } })

      if (isErrorResponse(result)) {
        expect(result.__status).toBe(404)
      } else {
        throw new Error('Expected error response')
      }
    })

    it('should return false for success responses', async () => {
      const getUser = api.declareEndpoint({
        method: 'GET',
        url: '/users/$userId',
        responseSchema: z.object({ id: z.string(), name: z.string() }),
        errorSchema: {
          404: z.object({ message: z.string() }),
        },
      })

      mockClient.mockResponse(
        'GET',
        '/users/123',
        successResponse({
          id: '123',
          name: 'John',
        }),
      )

      const result = await getUser({ urlParams: { userId: '123' } })

      expect(isErrorResponse(result)).toBe(false)
      expect(isErrorStatus(result, 404)).toBe(false)
    })
  })

  describe('URL params validation', () => {
    let mockClient: MockClient
    let api: ReturnType<typeof builder>

    beforeEach(() => {
      mockClient = createMockClient({
        defaultResponse: successResponse({ id: '123' }),
      })
      api = builder()
      api.provideClient(mockClient)
    })

    it('should throw when required URL param is missing', async () => {
      const getUser = api.declareEndpoint({
        method: 'GET',
        url: '/users/$userId',
        responseSchema: z.object({ id: z.string() }),
      })

      // @ts-expect-error - Testing runtime behavior with missing param
      await expect(getUser({})).rejects.toThrow(/urlParams/)
    })

    it('should throw when URL param value is undefined', async () => {
      const getUser = api.declareEndpoint({
        method: 'GET',
        url: '/users/$userId',
        responseSchema: z.object({ id: z.string() }),
      })

      await expect(
        // @ts-expect-error - Testing runtime behavior
        getUser({ urlParams: { userId: undefined } }),
      ).rejects.toThrow()
    })

    it('should validate URL params against urlParamsSchema', async () => {
      const getUser = api.declareEndpoint({
        method: 'GET',
        url: '/users/$userId',
        responseSchema: z.object({ id: z.string() }),
        urlParamsSchema: z.object({
          userId: z.uuid(),
        }),
      })

      await expect(
        getUser({ urlParams: { userId: 'not-a-uuid' } }),
      ).rejects.toThrow()
    })

    it('should pass validation when urlParamsSchema matches', async () => {
      mockClient.mockResponse(
        'GET',
        '/users/123e4567-e89b-12d3-a456-426614174000',
        successResponse({ id: '123e4567-e89b-12d3-a456-426614174000' }),
      )

      const getUser = api.declareEndpoint({
        method: 'GET',
        url: '/users/$userId',
        responseSchema: z.object({ id: z.string() }),
        urlParamsSchema: z.object({
          userId: z.uuid(),
        }),
      })

      const result = await getUser({
        urlParams: { userId: '123e4567-e89b-12d3-a456-426614174000' },
      })

      expect(result).toEqual({ id: '123e4567-e89b-12d3-a456-426614174000' })
    })

    it('should URL-encode special characters in params', async () => {
      mockClient.mockResponse(
        'GET',
        '/search/hello%20world%20%26%20foo%3Dbar',
        successResponse({ results: [] }),
      )

      const search = api.declareEndpoint({
        method: 'GET',
        url: '/search/$query',
        responseSchema: z.object({ results: z.array(z.unknown()) }),
      })

      await search({ urlParams: { query: 'hello world & foo=bar' } })

      expect(mockClient.getLastCall()?.url).toBe(
        '/search/hello%20world%20%26%20foo%3Dbar',
      )
    })
  })

  describe('query params validation', () => {
    let mockClient: MockClient
    let api: ReturnType<typeof builder>

    beforeEach(() => {
      mockClient = createMockClient({
        defaultResponse: successResponse([]),
      })
      api = builder()
      api.provideClient(mockClient)
    })

    it('should throw when query params fail schema validation', async () => {
      const searchUsers = api.declareEndpoint({
        method: 'GET',
        url: '/users',
        querySchema: z.object({
          page: z.number().min(1),
          limit: z.number().max(100),
        }),
        responseSchema: z.array(z.object({ id: z.string() })),
      })

      await expect(
        searchUsers({ params: { page: 0, limit: 10 } }),
      ).rejects.toThrow()
    })

    it('should transform query params using schema', async () => {
      mockClient.mockResponse('GET', '/users', successResponse([]))

      const searchUsers = api.declareEndpoint({
        method: 'GET',
        url: '/users',
        querySchema: z.object({
          page: z.coerce.number(),
          active: z.coerce.boolean(),
        }),
        responseSchema: z.array(z.object({ id: z.string() })),
      })

      // Pass strings that will be coerced
      await searchUsers({ params: { page: 1, active: true } })

      expect(mockClient.getLastCall()?.params).toEqual({
        page: 1,
        active: true,
      })
    })
  })

  describe('request body validation', () => {
    let mockClient: MockClient
    let api: ReturnType<typeof builder>

    beforeEach(() => {
      mockClient = createMockClient({
        defaultResponse: successResponse({ id: '1' }),
      })
      api = builder()
      api.provideClient(mockClient)
    })

    it('should throw when request body fails schema validation', async () => {
      const createUser = api.declareEndpoint({
        method: 'POST',
        url: '/users',
        requestSchema: z.object({
          name: z.string().min(2),
          email: z.string().email(),
        }),
        responseSchema: z.object({ id: z.string() }),
      })

      await expect(
        createUser({ data: { name: 'A', email: 'invalid' } }),
      ).rejects.toThrow()
    })

    it('should transform request body using schema', async () => {
      mockClient.mockResponse('POST', '/users', successResponse({ id: '1' }))

      const createUser = api.declareEndpoint({
        method: 'POST',
        url: '/users',
        requestSchema: z.object({
          name: z.string().trim(),
          age: z.coerce.number(),
        }),
        responseSchema: z.object({ id: z.string() }),
      })

      await createUser({ data: { name: '  John  ', age: 25 } })

      expect(mockClient.getLastCall()?.data).toEqual({
        name: 'John', // trimmed
        age: 25,
      })
    })
  })

  describe('client options', () => {
    let mockClient: MockClient
    let api: ReturnType<typeof builder>

    beforeEach(() => {
      mockClient = createMockClient({
        defaultResponse: successResponse({ id: '1' }),
      })
      api = builder()
      api.provideClient(mockClient)
    })

    it('should pass clientOptions to request', async () => {
      mockClient.mockResponse(
        'GET',
        '/users/123',
        successResponse({ id: '123' }),
      )

      const getUser = api.declareEndpoint({
        method: 'GET',
        url: '/users/$userId',
        responseSchema: z.object({ id: z.string() }),
        clientOptions: {
          timeout: 30000,
          headers: { 'X-Custom-Header': 'custom-value' },
        },
      })

      await getUser({ urlParams: { userId: '123' } })

      const lastCall = mockClient.getLastCall()
      expect(lastCall?.timeout).toBe(30000)
      expect(lastCall?.headers).toEqual({ 'X-Custom-Header': 'custom-value' })
    })

    it('should merge clientOptions headers with request headers', async () => {
      mockClient.mockResponse(
        'GET',
        '/users/123',
        successResponse({ id: '123' }),
      )

      const getUser = api.declareEndpoint({
        method: 'GET',
        url: '/users/$userId',
        responseSchema: z.object({ id: z.string() }),
        clientOptions: {
          headers: { 'X-Client-Option': 'from-config' },
        },
      })

      await getUser({
        urlParams: { userId: '123' },
        headers: { 'X-Request-Header': 'from-request' },
      })

      const lastCall = mockClient.getLastCall()
      expect(lastCall?.headers).toEqual({
        'X-Client-Option': 'from-config',
        'X-Request-Header': 'from-request',
      })
    })

    it('should allow request headers to override clientOptions headers', async () => {
      mockClient.mockResponse(
        'GET',
        '/users/123',
        successResponse({ id: '123' }),
      )

      const getUser = api.declareEndpoint({
        method: 'GET',
        url: '/users/$userId',
        responseSchema: z.object({ id: z.string() }),
        clientOptions: {
          headers: { Authorization: 'Bearer config-token' },
        },
      })

      await getUser({
        urlParams: { userId: '123' },
        headers: { Authorization: 'Bearer request-token' },
      })

      const lastCall = mockClient.getLastCall()
      expect(lastCall?.headers?.Authorization).toBe('Bearer request-token')
    })
  })

  describe('client not provided', () => {
    it('should throw when client is not provided', async () => {
      const api = builder()
      // Note: provideClient NOT called

      const getUser = api.declareEndpoint({
        method: 'GET',
        url: '/users/$userId',
        responseSchema: z.object({ id: z.string() }),
      })

      await expect(getUser({ urlParams: { userId: '123' } })).rejects.toThrow(
        /Client was not provided/,
      )
    })
  })
})
