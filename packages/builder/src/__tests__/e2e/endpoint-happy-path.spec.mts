import { describe, it, expect, beforeEach } from 'vitest'
import { z } from 'zod/v4'

import { builder } from '../../builder.mjs'
import { createMockClient, successResponse, type MockClient } from './mock-client.mjs'

describe('Endpoint Happy Path', () => {
  let mockClient: MockClient
  let api: ReturnType<typeof builder>

  beforeEach(() => {
    mockClient = createMockClient({
      defaultResponse: successResponse({ id: '1', name: 'Test User' }),
    })
    api = builder()
    api.provideClient(mockClient)
  })

  describe('GET requests', () => {
    it('should make GET request without URL params', async () => {
      const getUsers = api.declareEndpoint({
        method: 'GET',
        url: '/users',
        responseSchema: z.array(z.object({ id: z.string(), name: z.string() })),
      })

      mockClient.mockResponse('GET', '/users', successResponse([
        { id: '1', name: 'User 1' },
        { id: '2', name: 'User 2' },
      ]))

      const result = await getUsers({})

      expect(result).toEqual([
        { id: '1', name: 'User 1' },
        { id: '2', name: 'User 2' },
      ])
      expect(mockClient.getLastCall()).toMatchObject({
        method: 'GET',
        url: '/users',
      })
    })

    it('should make GET request with URL params', async () => {
      const getUser = api.declareEndpoint({
        method: 'GET',
        url: '/users/$userId',
        responseSchema: z.object({ id: z.string(), name: z.string() }),
      })

      mockClient.mockResponse('GET', '/users/123', successResponse({ id: '123', name: 'John' }))

      const result = await getUser({ urlParams: { userId: '123' } })

      expect(result).toEqual({ id: '123', name: 'John' })
      expect(mockClient.getLastCall()?.url).toBe('/users/123')
    })

    it('should make GET request with multiple URL params', async () => {
      const getPost = api.declareEndpoint({
        method: 'GET',
        url: '/users/$userId/posts/$postId',
        responseSchema: z.object({ id: z.string(), title: z.string() }),
      })

      mockClient.mockResponse('GET', '/users/123/posts/456', successResponse({
        id: '456',
        title: 'Test Post',
      }))

      const result = await getPost({ urlParams: { userId: '123', postId: '456' } })

      expect(result).toEqual({ id: '456', title: 'Test Post' })
      expect(mockClient.getLastCall()?.url).toBe('/users/123/posts/456')
    })

    it('should make GET request with query parameters', async () => {
      const searchUsers = api.declareEndpoint({
        method: 'GET',
        url: '/users',
        querySchema: z.object({
          page: z.number(),
          limit: z.number(),
          search: z.string().optional(),
        }),
        responseSchema: z.array(z.object({ id: z.string(), name: z.string() })),
      })

      mockClient.mockResponse('GET', '/users', successResponse([{ id: '1', name: 'Found User' }]))

      const result = await searchUsers({
        params: { page: 1, limit: 10, search: 'test' },
      })

      expect(result).toEqual([{ id: '1', name: 'Found User' }])
      expect(mockClient.getLastCall()?.params).toEqual({
        page: 1,
        limit: 10,
        search: 'test',
      })
    })

    it('should make GET request with URL params and query params', async () => {
      const getUserPosts = api.declareEndpoint({
        method: 'GET',
        url: '/users/$userId/posts',
        querySchema: z.object({ page: z.number() }),
        responseSchema: z.array(z.object({ id: z.string(), title: z.string() })),
      })

      mockClient.mockResponse('GET', '/users/123/posts', successResponse([
        { id: '1', title: 'Post 1' },
      ]))

      const result = await getUserPosts({
        urlParams: { userId: '123' },
        params: { page: 1 },
      })

      expect(result).toEqual([{ id: '1', title: 'Post 1' }])
      expect(mockClient.getLastCall()).toMatchObject({
        method: 'GET',
        url: '/users/123/posts',
        params: { page: 1 },
      })
    })
  })

  describe('POST requests', () => {
    it('should make POST request with body', async () => {
      const createUser = api.declareEndpoint({
        method: 'POST',
        url: '/users',
        requestSchema: z.object({
          name: z.string(),
          email: z.string().email(),
        }),
        responseSchema: z.object({ id: z.string(), name: z.string(), email: z.string() }),
      })

      mockClient.mockResponse('POST', '/users', successResponse(
        { id: '456', name: 'Jane', email: 'jane@example.com' },
        201,
      ))

      const result = await createUser({
        data: { name: 'Jane', email: 'jane@example.com' },
      })

      expect(result).toEqual({ id: '456', name: 'Jane', email: 'jane@example.com' })
      expect(mockClient.getLastCall()).toMatchObject({
        method: 'POST',
        url: '/users',
        data: { name: 'Jane', email: 'jane@example.com' },
      })
    })

    it('should make POST request with URL params and body', async () => {
      const createPost = api.declareEndpoint({
        method: 'POST',
        url: '/users/$userId/posts',
        requestSchema: z.object({ title: z.string(), content: z.string() }),
        responseSchema: z.object({ id: z.string(), title: z.string() }),
      })

      mockClient.mockResponse('POST', '/users/123/posts', successResponse({
        id: '789',
        title: 'New Post',
      }))

      const result = await createPost({
        urlParams: { userId: '123' },
        data: { title: 'New Post', content: 'Post content' },
      })

      expect(result).toEqual({ id: '789', title: 'New Post' })
      expect(mockClient.getLastCall()).toMatchObject({
        method: 'POST',
        url: '/users/123/posts',
        data: { title: 'New Post', content: 'Post content' },
      })
    })
  })

  describe('PUT/PATCH requests', () => {
    it('should make PUT request', async () => {
      const updateUser = api.declareEndpoint({
        method: 'PUT',
        url: '/users/$userId',
        requestSchema: z.object({ name: z.string(), email: z.string() }),
        responseSchema: z.object({ id: z.string(), name: z.string(), email: z.string() }),
      })

      mockClient.mockResponse('PUT', '/users/123', successResponse({
        id: '123',
        name: 'Updated',
        email: 'updated@example.com',
      }))

      const result = await updateUser({
        urlParams: { userId: '123' },
        data: { name: 'Updated', email: 'updated@example.com' },
      })

      expect(result).toEqual({ id: '123', name: 'Updated', email: 'updated@example.com' })
    })

    it('should make PATCH request', async () => {
      const patchUser = api.declareEndpoint({
        method: 'PATCH',
        url: '/users/$userId',
        requestSchema: z.object({ name: z.string().optional() }),
        responseSchema: z.object({ id: z.string(), name: z.string() }),
      })

      mockClient.mockResponse('PATCH', '/users/123', successResponse({
        id: '123',
        name: 'Patched Name',
      }))

      const result = await patchUser({
        urlParams: { userId: '123' },
        data: { name: 'Patched Name' },
      })

      expect(result).toEqual({ id: '123', name: 'Patched Name' })
    })
  })

  describe('DELETE requests', () => {
    it('should make DELETE request', async () => {
      const deleteUser = api.declareEndpoint({
        method: 'DELETE',
        url: '/users/$userId',
        responseSchema: z.object({ success: z.boolean() }),
      })

      mockClient.mockResponse('DELETE', '/users/123', successResponse({ success: true }))

      const result = await deleteUser({ urlParams: { userId: '123' } })

      expect(result).toEqual({ success: true })
      expect(mockClient.getLastCall()).toMatchObject({
        method: 'DELETE',
        url: '/users/123',
      })
    })
  })

  describe('request options', () => {
    it('should pass signal to client', async () => {
      const controller = new AbortController()

      const getUser = api.declareEndpoint({
        method: 'GET',
        url: '/users/$userId',
        responseSchema: z.object({ id: z.string() }),
      })

      mockClient.mockResponse('GET', '/users/123', successResponse({ id: '123' }))

      await getUser({
        urlParams: { userId: '123' },
        signal: controller.signal,
      })

      expect(mockClient.getLastCall()?.signal).toBe(controller.signal)
    })

    it('should pass headers to client', async () => {
      const getUser = api.declareEndpoint({
        method: 'GET',
        url: '/users/$userId',
        responseSchema: z.object({ id: z.string() }),
      })

      mockClient.mockResponse('GET', '/users/123', successResponse({ id: '123' }))

      await getUser({
        urlParams: { userId: '123' },
        headers: { Authorization: 'Bearer token123' },
      })

      expect(mockClient.getLastCall()?.headers).toEqual({ Authorization: 'Bearer token123' })
    })
  })

  describe('response schema validation', () => {
    it('should parse response with schema', async () => {
      const getUser = api.declareEndpoint({
        method: 'GET',
        url: '/users/$userId',
        responseSchema: z.object({
          id: z.string(),
          name: z.string(),
          createdAt: z.coerce.date(),
        }),
      })

      mockClient.mockResponse('GET', '/users/123', successResponse({
        id: '123',
        name: 'John',
        createdAt: '2024-01-01T00:00:00.000Z',
      }))

      const result = await getUser({ urlParams: { userId: '123' } })

      expect(result.id).toBe('123')
      expect(result.name).toBe('John')
      expect(result.createdAt).toBeInstanceOf(Date)
    })

    it('should validate response against schema', async () => {
      const getUser = api.declareEndpoint({
        method: 'GET',
        url: '/users/$userId',
        responseSchema: z.object({
          id: z.string(),
          name: z.string(),
        }),
      })

      // Response missing required field
      mockClient.mockResponse('GET', '/users/123', successResponse({
        id: '123',
        // name is missing
      }))

      await expect(getUser({ urlParams: { userId: '123' } })).rejects.toThrow()
    })
  })

  describe('handler config', () => {
    it('should attach config to handler', () => {
      const options = {
        method: 'GET' as const,
        url: '/users/$userId',
        responseSchema: z.object({ id: z.string() }),
      }

      const getUser = api.declareEndpoint(options)

      expect(getUser.config).toEqual(options)
    })
  })
})
