import { describe, it, expect, beforeEach } from 'vitest'
import { z } from 'zod/v4'

import { builder } from '../../builder.mjs'
import { UnknownResponseError } from '../../errors/unknown-response-error.mjs'
import { isErrorResponse, isErrorStatus } from '../../types/error-schema.mjs'
import { createMockClient, errorResponse, successResponse, type MockClient } from './mock-client.mjs'

describe('Discriminator Mode', () => {
  describe('useDiscriminatorResponse: true', () => {
    let mockClient: MockClient
    let api: ReturnType<typeof builder<true>>

    beforeEach(() => {
      mockClient = createMockClient()
      api = builder({ useDiscriminatorResponse: true })
      api.provideClient(mockClient)
    })

    describe('with errorSchema', () => {
      it('should return success response without __status', async () => {
        mockClient.mockResponse('GET', '/users/123', successResponse({
          id: '123',
          name: 'John Doe',
          email: 'john@example.com',
        }))

        const getUser = api.declareEndpoint({
          method: 'GET',
          url: '/users/$userId',
          responseSchema: z.object({
            id: z.string(),
            name: z.string(),
            email: z.string(),
          }),
          errorSchema: {
            404: z.object({ error: z.literal('Not found'), resource: z.string() }),
            403: z.object({ error: z.literal('Forbidden'), reason: z.string() }),
          },
        })

        const result = await getUser({ urlParams: { userId: '123' } })

        expect(result).toEqual({
          id: '123',
          name: 'John Doe',
          email: 'john@example.com',
        })
        expect('__status' in result).toBe(false)
      })

      it('should return 404 error with __status', async () => {
        mockClient.mockResponse('GET', '/users/999', errorResponse(
          { error: 'Not found', resource: 'user' },
          404,
        ))

        const getUser = api.declareEndpoint({
          method: 'GET',
          url: '/users/$userId',
          responseSchema: z.object({ id: z.string(), name: z.string() }),
          errorSchema: {
            404: z.object({ error: z.literal('Not found'), resource: z.string() }),
            403: z.object({ error: z.literal('Forbidden'), reason: z.string() }),
          },
        })

        const result = await getUser({ urlParams: { userId: '999' } })

        expect(result).toEqual({
          error: 'Not found',
          resource: 'user',
          __status: 404,
        })
      })

      it('should return 403 error with __status', async () => {
        mockClient.mockResponse('GET', '/users/123', errorResponse(
          { error: 'Forbidden', reason: 'Insufficient permissions' },
          403,
        ))

        const getUser = api.declareEndpoint({
          method: 'GET',
          url: '/users/$userId',
          responseSchema: z.object({ id: z.string(), name: z.string() }),
          errorSchema: {
            404: z.object({ error: z.literal('Not found'), resource: z.string() }),
            403: z.object({ error: z.literal('Forbidden'), reason: z.string() }),
          },
        })

        const result = await getUser({ urlParams: { userId: '123' } })

        expect(result).toEqual({
          error: 'Forbidden',
          reason: 'Insufficient permissions',
          __status: 403,
        })
      })

      it('should throw UnknownResponseError for unhandled status', async () => {
        mockClient.mockResponse('GET', '/users/123', errorResponse(
          { message: 'Internal server error' },
          500,
        ))

        const getUser = api.declareEndpoint({
          method: 'GET',
          url: '/users/$userId',
          responseSchema: z.object({ id: z.string() }),
          errorSchema: {
            404: z.object({ error: z.string() }),
          },
        })

        const error = await getUser({ urlParams: { userId: '123' } }).catch((e) => e)

        expect(error).toBeInstanceOf(UnknownResponseError)
        expect(error.statusCode).toBe(500)
      })

      it('should throw when error response fails errorSchema validation', async () => {
        mockClient.mockResponse('GET', '/users/123', errorResponse(
          { wrongField: 'wrong value' },  // Doesn't match expected schema
          404,
        ))

        const getUser = api.declareEndpoint({
          method: 'GET',
          url: '/users/$userId',
          responseSchema: z.object({ id: z.string() }),
          errorSchema: {
            404: z.object({ error: z.string(), resource: z.string() }),
          },
        })

        await expect(getUser({ urlParams: { userId: '123' } })).rejects.toThrow()
      })
    })

    describe('without errorSchema (legacy discriminatedUnion)', () => {
      it('should parse response with discriminatedUnion responseSchema', async () => {
        const responseSchema = z.discriminatedUnion('type', [
          z.object({ type: z.literal('success'), data: z.object({ id: z.string() }) }),
          z.object({ type: z.literal('error'), message: z.string() }),
        ])

        mockClient.mockResponse('GET', '/resource', successResponse({
          type: 'success',
          data: { id: '123' },
        }))

        const getResource = api.declareEndpoint({
          method: 'GET',
          url: '/resource',
          responseSchema,
        })

        const result = await getResource({})

        expect(result).toEqual({
          type: 'success',
          data: { id: '123' },
        })
      })

      it('should parse error response with discriminatedUnion responseSchema', async () => {
        const responseSchema = z.discriminatedUnion('type', [
          z.object({ type: z.literal('success'), data: z.object({ id: z.string() }) }),
          z.object({ type: z.literal('error'), message: z.string() }),
        ])

        mockClient.mockResponse('GET', '/resource', errorResponse({
          type: 'error',
          message: 'Something went wrong',
        }, 400))

        const getResource = api.declareEndpoint({
          method: 'GET',
          url: '/resource',
          responseSchema,
        })

        const result = await getResource({})

        expect(result).toEqual({
          type: 'error',
          message: 'Something went wrong',
        })
      })
    })

    describe('type discrimination patterns', () => {
      it('should allow discrimination using isErrorStatus', async () => {
        mockClient.mockResponse('POST', '/orders', errorResponse(
          { error: 'Out of stock', productId: 'ABC123' },
          400,
        ))

        const createOrder = api.declareEndpoint({
          method: 'POST',
          url: '/orders',
          requestSchema: z.object({ productId: z.string(), quantity: z.number() }),
          responseSchema: z.object({ orderId: z.string(), status: z.string() }),
          errorSchema: {
            400: z.object({ error: z.string(), productId: z.string() }),
            404: z.object({ error: z.string() }),
            409: z.object({ error: z.string(), conflictWith: z.string() }),
          },
        })

        const result = await createOrder({ data: { productId: 'ABC123', quantity: 5 } })

        // Pattern: check specific status
        if (isErrorStatus(result, 400)) {
          expect(result.error).toBe('Out of stock')
          expect(result.productId).toBe('ABC123')
          expect(result.__status).toBe(400)
        } else if (isErrorStatus(result, 404)) {
          throw new Error('Should not be 404')
        } else if (isErrorStatus(result, 409)) {
          throw new Error('Should not be 409')
        } else {
          throw new Error('Should be an error')
        }
      })

      it('should allow discrimination using isErrorResponse', async () => {
        mockClient.mockResponse('POST', '/orders', errorResponse(
          { error: 'Conflict', conflictWith: 'ORDER-789' },
          409,
        ))

        const createOrder = api.declareEndpoint({
          method: 'POST',
          url: '/orders',
          requestSchema: z.object({ productId: z.string() }),
          responseSchema: z.object({ orderId: z.string() }),
          errorSchema: {
            400: z.object({ error: z.string() }),
            409: z.object({ error: z.string(), conflictWith: z.string() }),
          },
        })

        const result = await createOrder({ data: { productId: 'ABC' } })

        // Pattern: check if any error
        if (isErrorResponse(result)) {
          expect(result.__status).toBe(409)
          // Then narrow further
          if (isErrorStatus(result, 409)) {
            expect(result.conflictWith).toBe('ORDER-789')
          }
        } else {
          throw new Error('Should be an error response')
        }
      })

      it('should allow success handling when no error', async () => {
        mockClient.mockResponse('POST', '/orders', successResponse({
          orderId: 'ORD-123',
          status: 'pending',
        }))

        const createOrder = api.declareEndpoint({
          method: 'POST',
          url: '/orders',
          requestSchema: z.object({ productId: z.string() }),
          responseSchema: z.object({ orderId: z.string(), status: z.string() }),
          errorSchema: {
            400: z.object({ error: z.string() }),
          },
        })

        const result = await createOrder({ data: { productId: 'ABC' } })

        if (isErrorResponse(result)) {
          throw new Error('Should not be an error')
        }

        // TypeScript should know this is the success type
        expect(result.orderId).toBe('ORD-123')
        expect(result.status).toBe('pending')
      })
    })
  })

  describe('useDiscriminatorResponse: false (default)', () => {
    let mockClient: MockClient
    let api: ReturnType<typeof builder<false>>

    beforeEach(() => {
      mockClient = createMockClient()
      api = builder({ useDiscriminatorResponse: false })
      api.provideClient(mockClient)
    })

    it('should throw on any error response', async () => {
      mockClient.mockResponse('GET', '/users/123', errorResponse(
        { error: 'Not found' },
        404,
      ))

      const getUser = api.declareEndpoint({
        method: 'GET',
        url: '/users/$userId',
        responseSchema: z.object({ id: z.string() }),
        // Even with errorSchema, errors are thrown in non-discriminator mode
        errorSchema: {
          404: z.object({ error: z.string() }),
        },
      })

      await expect(getUser({ urlParams: { userId: '123' } })).rejects.toThrow()
    })

    it('should return success response normally', async () => {
      mockClient.mockResponse('GET', '/users/123', successResponse({
        id: '123',
        name: 'John',
      }))

      const getUser = api.declareEndpoint({
        method: 'GET',
        url: '/users/$userId',
        responseSchema: z.object({ id: z.string(), name: z.string() }),
      })

      const result = await getUser({ urlParams: { userId: '123' } })

      expect(result).toEqual({ id: '123', name: 'John' })
    })
  })

  describe('stream endpoints with discriminator', () => {
    let mockClient: MockClient
    let api: ReturnType<typeof builder<true>>

    beforeEach(() => {
      mockClient = createMockClient()
      api = builder({ useDiscriminatorResponse: true })
      api.provideClient(mockClient)
    })

    it('should return Blob on success', async () => {
      const blob = new Blob(['file content'], { type: 'text/plain' })
      mockClient.mockResponse('GET', '/files/123', successResponse(blob))

      const downloadFile = api.declareStream({
        method: 'GET',
        url: '/files/$fileId',
        errorSchema: {
          404: z.object({ error: z.string() }),
        },
      })

      const result = await downloadFile({ urlParams: { fileId: '123' } })

      expect(result).toBeInstanceOf(Blob)
    })

    it('should return error with __status on stream error', async () => {
      mockClient.mockResponse('GET', '/files/123', errorResponse(
        { error: 'File not found' },
        404,
      ))

      const downloadFile = api.declareStream({
        method: 'GET',
        url: '/files/$fileId',
        errorSchema: {
          404: z.object({ error: z.string() }),
        },
      })

      const result = await downloadFile({ urlParams: { fileId: '123' } })

      expect(result).toEqual({
        error: 'File not found',
        __status: 404,
      })
    })
  })

  describe('error callbacks', () => {
    let mockClient: MockClient

    it('should call onError callback before returning error', async () => {
      mockClient = createMockClient()
      const onError = vi.fn()

      const api = builder({
        useDiscriminatorResponse: true,
        onError,
      })
      api.provideClient(mockClient)

      mockClient.mockResponse('GET', '/users/123', errorResponse(
        { error: 'Not found' },
        404,
      ))

      const getUser = api.declareEndpoint({
        method: 'GET',
        url: '/users/$userId',
        responseSchema: z.object({ id: z.string() }),
        errorSchema: {
          404: z.object({ error: z.string() }),
        },
      })

      await getUser({ urlParams: { userId: '123' } })

      expect(onError).toHaveBeenCalledTimes(1)
    })

    it('should call onZodError when error parsing fails', async () => {
      mockClient = createMockClient()
      const onZodError = vi.fn()

      const api = builder({
        useDiscriminatorResponse: true,
        onZodError,
      })
      api.provideClient(mockClient)

      mockClient.mockResponse('GET', '/users/123', errorResponse(
        { wrongShape: true },  // Doesn't match errorSchema
        404,
      ))

      const getUser = api.declareEndpoint({
        method: 'GET',
        url: '/users/$userId',
        responseSchema: z.object({ id: z.string() }),
        errorSchema: {
          404: z.object({ error: z.string() }),
        },
      })

      await expect(getUser({ urlParams: { userId: '123' } })).rejects.toThrow()

      expect(onZodError).toHaveBeenCalledTimes(1)
    })
  })
})

// Import vi for mock functions
import { vi } from 'vitest'
