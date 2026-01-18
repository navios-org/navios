import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createPrefetchHelper, createPrefetchHelpers, prefetchAll } from '../query/prefetch.mjs'

describe('createPrefetchHelper', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })
  })

  it('should create a prefetch helper with all methods', () => {
    const mockQueryOptions = vi.fn((params: { userId: string }) => ({
      queryKey: ['users', params.userId] as const,
      queryFn: async () => ({ id: params.userId, name: 'Test User' }),
    }))

    const helper = createPrefetchHelper(mockQueryOptions)

    expect(helper).toHaveProperty('prefetch')
    expect(helper).toHaveProperty('ensureData')
    expect(helper).toHaveProperty('getQueryOptions')
    expect(helper).toHaveProperty('prefetchMany')
    expect(typeof helper.prefetch).toBe('function')
    expect(typeof helper.ensureData).toBe('function')
    expect(typeof helper.getQueryOptions).toBe('function')
    expect(typeof helper.prefetchMany).toBe('function')
  })

  describe('prefetch', () => {
    it('should call queryClient.prefetchQuery with correct options', async () => {
      const mockQueryFn = vi.fn().mockResolvedValue({ id: '123', name: 'Test' })
      const mockQueryOptions = vi.fn((params: { userId: string }) => ({
        queryKey: ['users', params.userId] as const,
        queryFn: mockQueryFn,
      }))

      const helper = createPrefetchHelper(mockQueryOptions)
      await helper.prefetch(queryClient, { userId: '123' })

      expect(mockQueryOptions).toHaveBeenCalledWith({ userId: '123' })
      expect(mockQueryFn).toHaveBeenCalled()
    })

    it('should prefetch data and store in cache', async () => {
      const userData = { id: '456', name: 'Cached User' }
      const mockQueryOptions = vi.fn((params: { userId: string }) => ({
        queryKey: ['users', params.userId] as const,
        queryFn: async () => userData,
      }))

      const helper = createPrefetchHelper(mockQueryOptions)
      await helper.prefetch(queryClient, { userId: '456' })

      const cachedData = queryClient.getQueryData(['users', '456'])
      expect(cachedData).toEqual(userData)
    })
  })

  describe('ensureData', () => {
    it('should return data after ensuring it exists in cache', async () => {
      const userData = { id: '789', name: 'Ensured User' }
      const mockQueryOptions = vi.fn((params: { userId: string }) => ({
        queryKey: ['users', params.userId] as const,
        queryFn: async () => userData,
      }))

      const helper = createPrefetchHelper(mockQueryOptions)
      const result = await helper.ensureData(queryClient, { userId: '789' })

      expect(result).toEqual(userData)
    })

    it('should not refetch if data is already cached', async () => {
      const mockQueryFn = vi.fn().mockResolvedValue({ id: '111', name: 'User' })
      const mockQueryOptions = vi.fn((params: { userId: string }) => ({
        queryKey: ['users', params.userId] as const,
        queryFn: mockQueryFn,
      }))

      // Pre-populate cache
      queryClient.setQueryData(['users', '111'], {
        id: '111',
        name: 'Cached User',
      })

      const helper = createPrefetchHelper(mockQueryOptions)
      const result = await helper.ensureData(queryClient, { userId: '111' })

      expect(result).toEqual({ id: '111', name: 'Cached User' })
      expect(mockQueryFn).not.toHaveBeenCalled()
    })
  })

  describe('getQueryOptions', () => {
    it('should return query options for given params', () => {
      const mockQueryOptions = vi.fn((params: { userId: string }) => ({
        queryKey: ['users', params.userId] as const,
        queryFn: async () => ({ id: params.userId }),
      }))

      const helper = createPrefetchHelper(mockQueryOptions)
      const options = helper.getQueryOptions({ userId: 'abc' })

      expect(mockQueryOptions).toHaveBeenCalledWith({ userId: 'abc' })
      expect(options).toHaveProperty('queryKey', ['users', 'abc'])
      expect(options).toHaveProperty('queryFn')
    })
  })

  describe('prefetchMany', () => {
    it('should prefetch multiple queries in parallel', async () => {
      const mockQueryFn = vi.fn().mockImplementation(async (userId: string) => ({
        id: userId,
        name: `User ${userId}`,
      }))

      const mockQueryOptions = vi.fn((params: { userId: string }) => ({
        queryKey: ['users', params.userId] as const,
        queryFn: () => mockQueryFn(params.userId),
      }))

      const helper = createPrefetchHelper(mockQueryOptions)
      await helper.prefetchMany(queryClient, [{ userId: '1' }, { userId: '2' }, { userId: '3' }])

      expect(queryClient.getQueryData(['users', '1'])).toEqual({
        id: '1',
        name: 'User 1',
      })
      expect(queryClient.getQueryData(['users', '2'])).toEqual({
        id: '2',
        name: 'User 2',
      })
      expect(queryClient.getQueryData(['users', '3'])).toEqual({
        id: '3',
        name: 'User 3',
      })
    })

    it('should handle empty params list', async () => {
      const mockQueryOptions = vi.fn((params: { userId: string }) => ({
        queryKey: ['users', params.userId] as const,
        queryFn: async () => ({ id: params.userId }),
      }))

      const helper = createPrefetchHelper(mockQueryOptions)
      await helper.prefetchMany(queryClient, [])

      expect(mockQueryOptions).not.toHaveBeenCalled()
    })
  })
})

describe('createPrefetchHelpers', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })
  })

  it('should create helpers for multiple queries', () => {
    const queries = {
      user: vi.fn((params: { userId: string }) => ({
        queryKey: ['users', params.userId] as const,
        queryFn: async () => ({ id: params.userId }),
      })),
      posts: vi.fn((params: { userId: string }) => ({
        queryKey: ['users', params.userId, 'posts'] as const,
        queryFn: async () => [{ id: '1', title: 'Post 1' }],
      })),
    }

    const helpers = createPrefetchHelpers(queries)

    expect(helpers).toHaveProperty('user')
    expect(helpers).toHaveProperty('posts')
    expect(helpers.user).toHaveProperty('prefetch')
    expect(helpers.posts).toHaveProperty('prefetch')
  })

  it('should work with individual helpers independently', async () => {
    const queries = {
      user: vi.fn((params: { userId: string }) => ({
        queryKey: ['users', params.userId] as const,
        queryFn: async () => ({ id: params.userId, name: 'User' }),
      })),
      posts: vi.fn((params: { userId: string }) => ({
        queryKey: ['users', params.userId, 'posts'] as const,
        queryFn: async () => [{ id: '1', title: 'Post' }],
      })),
    }

    const helpers = createPrefetchHelpers(queries)

    await helpers.user.prefetch(queryClient, { userId: '123' })
    await helpers.posts.prefetch(queryClient, { userId: '123' })

    expect(queryClient.getQueryData(['users', '123'])).toEqual({
      id: '123',
      name: 'User',
    })
    expect(queryClient.getQueryData(['users', '123', 'posts'])).toEqual([
      { id: '1', title: 'Post' },
    ])
  })
})

describe('prefetchAll', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })
  })

  it('should prefetch all queries in parallel', async () => {
    const userHelper = createPrefetchHelper(
      vi.fn((params: { userId: string }) => ({
        queryKey: ['users', params.userId] as const,
        queryFn: async () => ({ id: params.userId, name: 'User' }),
      })),
    )

    const postsHelper = createPrefetchHelper(
      vi.fn((params: { userId: string; limit: number }) => ({
        queryKey: ['users', params.userId, 'posts', params.limit] as const,
        queryFn: async () => [{ id: '1', title: 'Post' }],
      })),
    )

    await prefetchAll(queryClient, [
      { helper: userHelper, params: { userId: '123' } },
      { helper: postsHelper, params: { userId: '123', limit: 10 } },
    ])

    expect(queryClient.getQueryData(['users', '123'])).toEqual({
      id: '123',
      name: 'User',
    })
    expect(queryClient.getQueryData(['users', '123', 'posts', 10])).toEqual([
      { id: '1', title: 'Post' },
    ])
  })

  it('should handle empty prefetches array', async () => {
    await expect(prefetchAll(queryClient, [])).resolves.toBeUndefined()
  })

  it('should handle errors in individual prefetches', async () => {
    const errorHelper = createPrefetchHelper<Record<string, never>, { error: boolean }>(
      vi.fn(() => ({
        queryKey: ['error'] as const,
        queryFn: async (): Promise<{ error: boolean }> => {
          throw new Error('Fetch failed')
        },
      })),
    )

    const successHelper = createPrefetchHelper<Record<string, never>, { success: boolean }>(
      vi.fn(() => ({
        queryKey: ['success'] as const,
        queryFn: async () => ({ success: true }),
      })),
    )

    // prefetchAll should not throw even if individual queries fail
    // because prefetchQuery doesn't throw
    await expect(
      prefetchAll(queryClient, [
        { helper: errorHelper, params: {} },
        { helper: successHelper, params: {} },
      ]),
    ).resolves.toBeUndefined()

    // Success query should still be cached
    expect(queryClient.getQueryData(['success'])).toEqual({ success: true })
  })
})
