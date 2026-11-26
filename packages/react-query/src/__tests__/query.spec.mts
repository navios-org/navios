import { EndpointError } from '@navios/builder'
import { hashKey, QueryClient, skipToken } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import { declareClient } from '../client/declare-client.mjs'
import { getHttpClient, setHttpClient } from '../endpoint/http-client.mjs'

import { makeHttp, setup } from './helpers.mjs'

const hooks = vi.hoisted(() => ({
  useQuery: vi.fn((options: unknown) => options),
  useSuspenseQuery: vi.fn((options: unknown) => options),
  useInfiniteQuery: vi.fn((options: unknown) => options),
  useSuspenseInfiniteQuery: vi.fn((options: unknown) => options),
}))

vi.mock('@tanstack/react-query', async (importReal) => ({
  ...(await importReal<typeof import('@tanstack/react-query')>()),
  ...hooks,
}))

const userSchema = z.object({ id: z.string(), name: z.string() })

describe('client.query', () => {
  let ctx: ReturnType<typeof setup>

  beforeEach(() => {
    vi.clearAllMocks()
    ctx = setup(() => ({ data: { id: '1', name: 'Ada' } }))
  })

  describe('keys', () => {
    it('puts method and URL template first, inputs last', () => {
      const getUser = ctx.client.query({
        method: 'GET',
        url: '/users/$userId',
        querySchema: z.object({ expand: z.string().optional() }),
        responseSchema: userSchema,
      })

      expect(getUser({ urlParams: { userId: 42 }, params: { expand: 'team' } }).queryKey).toEqual([
        'GET',
        '/users/$userId',
        { urlParams: { userId: '42' }, params: { expand: 'team' } },
      ])
      expect(getUser.key()).toEqual(['GET', '/users/$userId'])
      expect(getUser.key({ urlParams: { userId: 42 } })).toEqual([
        'GET',
        '/users/$userId',
        { urlParams: { userId: '42' } },
      ])
    })

    it('includes the request body, so different bodies are different entries', () => {
      const search = ctx.client.query({
        method: 'POST',
        url: '/users/search',
        requestSchema: z.object({ q: z.string() }),
        responseSchema: z.array(userSchema),
      })

      expect(search({ data: { q: 'a' } }).queryKey).toEqual([
        'POST',
        '/users/search',
        { data: { q: 'a' } },
      ])
      expect(search({ data: { q: 'a' } }).queryKey).not.toEqual(
        search({ data: { q: 'b' } }).queryKey,
      )
    })

    it('includes the method, so GET and POST on one URL do not collide', () => {
      const list = ctx.client.query({ method: 'GET', url: '/users', responseSchema: z.any() })
      const post = ctx.client.query({ method: 'POST', url: '/users', responseSchema: z.any() })

      expect(list().queryKey).not.toEqual(post().queryKey)
    })

    it('ignores signal, headers and timeout, and normalizes empty inputs', () => {
      const list = ctx.client.query({
        method: 'GET',
        url: '/users',
        querySchema: z.object({ page: z.number().optional() }),
        responseSchema: z.any(),
      })

      expect(list().queryKey).toEqual(['GET', '/users'])
      expect(list({ params: {} }).queryKey).toEqual(['GET', '/users'])
      expect(list({ params: { page: undefined } }).queryKey).toEqual(['GET', '/users'])
      expect(list({ headers: { a: 'b' }, timeout: 5, signal: null }).queryKey).toEqual([
        'GET',
        '/users',
      ])
    })

    it('treats numeric and string URL params as the same entry', () => {
      const getUser = ctx.client.query({
        method: 'GET',
        url: '/users/$id',
        responseSchema: z.any(),
      })
      expect(getUser({ urlParams: { id: 1 } }).queryKey).toEqual(
        getUser({ urlParams: { id: '1' } }).queryKey,
      )
    })

    it('tells non-plain inputs apart by content', async () => {
      const search = ctx.client.query({
        method: 'POST',
        url: '/search',
        querySchema: z.any(),
        requestSchema: z.any(),
        responseSchema: z.any(),
      })
      const hash = (args: Parameters<typeof search>[0]) => hashKey(search(args).queryKey)
      const different = (a: Parameters<typeof search>[0], b: Parameters<typeof search>[0]) =>
        expect(hash(a)).not.toBe(hash(b))

      different(
        { params: new URLSearchParams('q=1') as never },
        { params: new URLSearchParams('q=2') as never },
      )
      different(
        { data: { f: new File(['a'], 'a.txt') } },
        { data: { f: new File(['bbb'], 'b.txt') } },
      )
      const one = new FormData()
      one.append('a', '1')
      const two = new FormData()
      two.append('a', '2')
      different({ data: one }, { data: two })
      different({ data: new Set([1]) }, { data: new Set([2]) })
      different({ data: new Map([['a', 1]]) }, { data: new Map([['a', 2]]) })
      different({ params: { id: 10n } }, { params: { id: 11n } })

      // Same content still means the same entry.
      expect(hash({ params: new URLSearchParams('q=1') as never })).toBe(
        hash({ params: new URLSearchParams('q=1') as never }),
      )
      expect(hash({ data: { nested: { list: [1, { a: 1 }] } } })).toBe(
        hash({ data: { nested: { list: [1, { a: 1 }] } } }),
      )
    })

    it('fetches again for a different URLSearchParams query', async () => {
      const list = ctx.client.query({
        method: 'GET',
        url: '/items',
        querySchema: z.instanceof(URLSearchParams),
        responseSchema: z.any(),
      })
      ctx.http.respond((config) => ({ data: String(config.params) }))

      const apples = await list.ensure(ctx.queryClient, {
        params: new URLSearchParams('q=apples') as never,
      })
      const pears = await list.ensure(ctx.queryClient, {
        params: new URLSearchParams('q=pears') as never,
      })

      expect(apples).toBe('q=apples')
      expect(pears).toBe('q=pears')
      expect(ctx.http.calls).toHaveLength(2)
    })

    it('applies keyPrefix and keySuffix from client defaults and per query', () => {
      const scoped = setup()
      const getUser = ctx.client.query(
        scoped.api.declareEndpoint({ method: 'GET', url: '/users/$id', responseSchema: z.any() }),
        { keyPrefix: ['tenant-1'], keySuffix: ['v2'] },
      )

      expect(getUser({ urlParams: { id: 1 } }).queryKey).toEqual([
        'tenant-1',
        'GET',
        '/users/$id',
        'v2',
        { urlParams: { id: '1' } },
      ])
    })

    it('puts the client defaults around the query own segments instead of replacing them', () => {
      const client = declareClient({
        api: ctx.api,
        defaults: { keyPrefix: ['core'], keySuffix: ['v1'] },
      })
      const endpoint = ctx.api.declareEndpoint({
        method: 'GET',
        url: '/users/$id',
        responseSchema: z.any(),
      })

      const scoped = client.query(endpoint, { keyPrefix: ['tenant-1'], keySuffix: ['beta'] })
      const inline = client.query({
        method: 'GET',
        url: '/users',
        responseSchema: z.any(),
        keyPrefix: ['admin'],
      })
      const plain = client.query(endpoint)

      expect(scoped.key()).toEqual(['core', 'tenant-1', 'GET', '/users/$id', 'v1', 'beta'])
      expect(inline.key()).toEqual(['core', 'admin', 'GET', '/users', 'v1'])
      expect(plain.key()).toEqual(['core', 'GET', '/users/$id', 'v1'])
    })
  })

  describe('fetching', () => {
    it('queryFn calls the endpoint and resolves with parsed data', async () => {
      const getUser = ctx.client.query({
        method: 'GET',
        url: '/users/$userId',
        responseSchema: userSchema,
      })

      const data = await getUser.fetch(ctx.queryClient, { urlParams: { userId: 7 } })

      expect(data).toEqual({ id: '1', name: 'Ada' })
      expect(ctx.http.calls[0]).toMatchObject({ method: 'GET', url: '/users/7' })
      expect(ctx.http.calls[0]?.signal).toBeInstanceOf(AbortSignal)
      expect(getUser.getData(ctx.queryClient, { urlParams: { userId: 7 } })).toEqual(data)
    })

    it('rejects with the typed EndpointError, which lands in the error channel', async () => {
      ctx.http.respond(() => ({ status: 404, data: { message: 'gone' } }))
      const getUser = ctx.client.query({
        method: 'GET',
        url: '/users/$userId',
        responseSchema: userSchema,
        errorSchema: { 404: z.object({ message: z.string() }) },
      })

      const error = await getUser
        .fetch(ctx.queryClient, { urlParams: { userId: 7 } })
        .catch((e: unknown) => e)

      expect(error).toBeInstanceOf(EndpointError)
      expect(error).toMatchObject({ kind: 'http', status: 404, body: { message: 'gone' } })
      const state = ctx.queryClient.getQueryState(getUser.key({ urlParams: { userId: 7 } }))
      expect(state?.status).toBe('error')
      expect(state?.data).toBeUndefined()
    })

    it('reports invalid args through the error channel instead of throwing while rendering', async () => {
      const list = ctx.client.query({
        method: 'GET',
        url: '/users',
        querySchema: z.object({ page: z.number() }),
        responseSchema: z.any(),
      })

      const options = list({ params: { page: 'x' as never } })
      expect(options.queryKey).toEqual(['GET', '/users', { params: { page: 'x' } }])
      await expect(
        list.fetch(ctx.queryClient, { params: { page: 'x' as never } }),
      ).rejects.toMatchObject({ kind: 'request-validation' })
      expect(ctx.http.calls).toHaveLength(0)
    })

    it('prefetch never rejects and fills the cache', async () => {
      const getUser = ctx.client.query({
        method: 'GET',
        url: '/users/$userId',
        responseSchema: userSchema,
      })

      await expect(
        getUser.prefetch(ctx.queryClient, { urlParams: { userId: 1 } }),
      ).resolves.toBeUndefined()
      expect(getUser.getData(ctx.queryClient, { urlParams: { userId: 1 } })).toEqual({
        id: '1',
        name: 'Ada',
      })

      ctx.http.respond(() => ({ status: 500 }))
      await expect(
        getUser.prefetch(ctx.queryClient, { urlParams: { userId: 2 } }),
      ).resolves.toBeUndefined()
    })

    it('ensure returns cached data without a request, however stale', async () => {
      const getUser = ctx.client.query({
        method: 'GET',
        url: '/users/$userId',
        responseSchema: userSchema,
      })
      const args = { urlParams: { userId: 1 } }

      await expect(getUser.ensure(ctx.queryClient, args)).resolves.toEqual({ id: '1', name: 'Ada' })
      expect(ctx.http.calls).toHaveLength(1)

      getUser.setData(ctx.queryClient, args, { id: '1', name: 'Cached' })
      await ctx.queryClient.invalidateQueries({ queryKey: getUser.key(args), refetchType: 'none' })
      await expect(getUser.ensure(ctx.queryClient, args)).resolves.toEqual({
        id: '1',
        name: 'Cached',
      })
      expect(ctx.http.calls).toHaveLength(1)
    })

    it('setData and getData address the same entry as the hook', () => {
      const getUser = ctx.client.query({
        method: 'GET',
        url: '/users/$userId',
        responseSchema: userSchema,
      })
      const args = { urlParams: { userId: 1 } }

      getUser.setData(ctx.queryClient, args, { id: '1', name: 'Manual' })

      expect(ctx.queryClient.getQueryData(getUser(args).queryKey)).toEqual({
        id: '1',
        name: 'Manual',
      })
      getUser.setData(ctx.queryClient, args, (old) => old && { ...old, name: 'Updated' })
      expect(getUser.getData(ctx.queryClient, args)?.name).toBe('Updated')
    })
  })

  describe('invalidate', () => {
    function seed() {
      const getUser = ctx.client.query({
        method: 'GET',
        url: '/users/$userId',
        querySchema: z.object({ expand: z.string().optional() }),
        responseSchema: z.any(),
      })
      const listUsers = ctx.client.query({ method: 'GET', url: '/users', responseSchema: z.any() })
      const getPosts = ctx.client.query({
        method: 'GET',
        url: '/users/$userId/posts',
        responseSchema: z.any(),
      })
      getUser.setData(ctx.queryClient, { urlParams: { userId: 1 } }, 'u1')
      getUser.setData(ctx.queryClient, { urlParams: { userId: 1 }, params: { expand: 'x' } }, 'u1x')
      getUser.setData(ctx.queryClient, { urlParams: { userId: 2 } }, 'u2')
      listUsers.setData(ctx.queryClient, {}, 'list')
      getPosts.setData(ctx.queryClient, { urlParams: { userId: 1 } }, 'posts')
      const invalidated = () =>
        ctx.queryClient
          .getQueryCache()
          .getAll()
          .filter((q) => q.state.isInvalidated)
          .map((q) => q.state.data)
          .sort()
      return { getUser, listUsers, getPosts, invalidated }
    }

    it('without args: every entry of the endpoint and nothing else', async () => {
      const { getUser, invalidated } = seed()
      await getUser.invalidate(ctx.queryClient)
      expect(invalidated()).toEqual(['u1', 'u1x', 'u2'])
    })

    it('with partial args: the matching entries, whatever the query params', async () => {
      const { getUser, invalidated } = seed()
      await getUser.invalidate(ctx.queryClient, { urlParams: { userId: 1 } })
      expect(invalidated()).toEqual(['u1', 'u1x'])
    })

    it('with exact: one entry', async () => {
      const { getUser, invalidated } = seed()
      await getUser.invalidate(ctx.queryClient, { urlParams: { userId: 1 } }, { exact: true })
      expect(invalidated()).toEqual(['u1'])
    })

    it('a list endpoint does not take the detail endpoints with it', async () => {
      const { listUsers, invalidated } = seed()
      await listUsers.invalidate(ctx.queryClient)
      expect(invalidated()).toEqual(['list'])
    })
  })

  describe('hooks', () => {
    it('use passes built options plus any TanStack option', () => {
      const getUser = ctx.client.query({
        method: 'GET',
        url: '/users/$userId',
        responseSchema: userSchema,
      })
      const select = (user: { name: string }) => user.name

      getUser.use({ urlParams: { userId: 1 } }, { staleTime: 5000, enabled: false, select })

      expect(hooks.useQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ['GET', '/users/$userId', { urlParams: { userId: '1' } }],
          staleTime: 5000,
          enabled: false,
          select,
        }),
      )
    })

    it('use(skipToken) disables the query under a key that is never fetched', () => {
      const getUser = ctx.client.query({
        method: 'GET',
        url: '/users/$userId',
        responseSchema: userSchema,
      })

      getUser.use(skipToken)

      expect(hooks.useQuery).toHaveBeenCalledWith({
        queryKey: ['GET', '/users/$userId', 'skipped'],
        queryFn: skipToken,
      })
    })

    it('useSuspense builds the same options', () => {
      const list = ctx.client.query({ method: 'GET', url: '/users', responseSchema: z.any() })
      list.useSuspense()
      expect(hooks.useSuspenseQuery).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['GET', '/users'] }),
      )
    })
  })

  it('uses the HTTP client bound to the QueryClient, for per-request SSR clients', async () => {
    const perRequest = makeHttp(() => ({ data: { id: '9', name: 'Per request' } }))
    const getUser = ctx.client.query({
      method: 'GET',
      url: '/users/$userId',
      responseSchema: userSchema,
    })
    const requestQueryClient = new QueryClient()
    setHttpClient(requestQueryClient, perRequest.client)

    const data = await getUser.fetch(requestQueryClient, { urlParams: { userId: 9 } })
    await getUser.fetch(ctx.queryClient, { urlParams: { userId: 9 } })

    expect(data).toEqual({ id: '9', name: 'Per request' })
    expect(perRequest.calls).toHaveLength(1)
    expect(ctx.http.calls).toHaveLength(1)
    expect(getHttpClient(requestQueryClient)).toBe(perRequest.client)
  })

  describe('withResponse', () => {
    it('delivers data with plain response metadata under its own key', async () => {
      ctx.http.respond(() => ({
        data: { id: '1', name: 'Ada' },
        headers: { ETag: 'abc', 'x-total': '42' },
      }))
      const endpoint = ctx.api.declareEndpoint({
        method: 'GET',
        url: '/users/$userId',
        responseSchema: userSchema,
      })
      const plain = ctx.client.query(endpoint)
      const withMeta = ctx.client.query(endpoint, { withResponse: true })
      const args = { urlParams: { userId: 1 } }

      const result = await withMeta.fetch(ctx.queryClient, args)

      expect(result).toEqual({
        data: { id: '1', name: 'Ada' },
        response: { status: 200, statusText: 'OK', headers: { etag: 'abc', 'x-total': '42' } },
      })
      expect(JSON.parse(JSON.stringify(result))).toEqual(result)
      expect(withMeta(args).queryKey).toEqual([
        'GET',
        '/users/$userId',
        'with-response',
        { urlParams: { userId: '1' } },
      ])
      expect(plain.getData(ctx.queryClient, args)).toBeUndefined()
    })

    it('still throws the EndpointError on failure', async () => {
      ctx.http.respond(() => ({ status: 500 }))
      const list = ctx.client.query({
        method: 'GET',
        url: '/users',
        responseSchema: z.any(),
        withResponse: true,
      })

      await expect(list.fetch(ctx.queryClient)).rejects.toBeInstanceOf(EndpointError)
    })
  })

  it('exposes the endpoint and accepts an existing handler', async () => {
    const endpoint = ctx.api.declareEndpoint({
      method: 'GET',
      url: '/users',
      responseSchema: z.any(),
    })
    const list = ctx.client.query(endpoint)

    expect(list.endpoint).toBe(endpoint)
    await list.fetch(ctx.queryClient)
    expect(ctx.http.calls[0]?.url).toBe('/users')
  })
})

describe('client.infiniteQuery', () => {
  let ctx: ReturnType<typeof setup>
  const pageSchema = z.object({ items: z.array(z.number()), next: z.number().nullable() })

  function declare() {
    return ctx.client.infiniteQuery({
      method: 'GET',
      url: '/items',
      querySchema: z.object({ page: z.number(), size: z.number().optional() }),
      responseSchema: pageSchema,
      getNextPageParam: (lastPage, _pages, lastParam) =>
        lastPage.next === null ? undefined : { ...lastParam, page: lastPage.next },
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ctx = setup((config) => {
      const page = (config.params as { page: number }).page
      return { data: { items: [page], next: page < 2 ? page + 1 : null } }
    })
  })

  it('never shares a key with the plain query of the same endpoint', () => {
    const plain = ctx.client.query({
      method: 'GET',
      url: '/items',
      querySchema: z.object({ page: z.number() }),
      responseSchema: pageSchema,
    })
    const infinite = declare()

    expect(infinite({ params: { page: 1 } }).queryKey).toEqual([
      'GET',
      '/items',
      'infinite',
      { params: { page: 1 } },
    ])
    expect(plain({ params: { page: 1 } }).queryKey).toEqual([
      'GET',
      '/items',
      { params: { page: 1 } },
    ])
  })

  it('merges the page param over the call params; first page uses the params', async () => {
    const infinite = declare()
    const options = infinite({ params: { page: 1, size: 10 } })

    expect(options.initialPageParam).toEqual({ page: 1, size: 10 })

    const data = await infinite.fetch(ctx.queryClient, { params: { page: 1, size: 10 } })
    expect(data.pages).toEqual([{ items: [1], next: 2 }])
    expect(ctx.http.calls[0]?.params).toEqual({ page: 1, size: 10 })

    const next = options.getNextPageParam(data.pages[0]!, data.pages, data.pageParams[0]!, [])
    expect(next).toEqual({ page: 2, size: 10 })
    expect(infinite.getData(ctx.queryClient, { params: { page: 1, size: 10 } })).toEqual(data)
  })

  it('honours an explicit initialPageParam', () => {
    const infinite = ctx.client.infiniteQuery(
      ctx.api.declareEndpoint({
        method: 'GET',
        url: '/items',
        querySchema: z.object({ page: z.number() }),
        responseSchema: pageSchema,
      }),
      { getNextPageParam: () => undefined, initialPageParam: { page: 5 } },
    )
    expect(infinite({ params: { page: 1 } }).initialPageParam).toEqual({ page: 5 })
  })

  it('prefetch and ensure go through queryClient.infiniteQuery', async () => {
    const infinite = declare()
    const args = { params: { page: 1 } }

    await expect(infinite.prefetch(ctx.queryClient, args)).resolves.toBeUndefined()
    expect(ctx.http.calls).toHaveLength(1)
    const ensured = await infinite.ensure(ctx.queryClient, args)
    expect(ensured.pages).toHaveLength(1)
    expect(ctx.http.calls).toHaveLength(1)
  })

  it('use passes pagination and TanStack options to useInfiniteQuery', () => {
    const infinite = declare()
    infinite.use({ params: { page: 1 } }, { staleTime: 1 })

    expect(hooks.useInfiniteQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['GET', '/items', 'infinite', { params: { page: 1 } }],
        staleTime: 1,
        initialPageParam: { page: 1 },
        getNextPageParam: expect.any(Function),
      }),
    )
  })

  it('invalidating the endpoint from the plain query also covers the infinite entries', async () => {
    const plain = ctx.client.query({
      method: 'GET',
      url: '/items',
      querySchema: z.object({ page: z.number() }),
      responseSchema: pageSchema,
    })
    const infinite = declare()
    await infinite.fetch(ctx.queryClient, { params: { page: 1 } })

    await plain.invalidate(ctx.queryClient, undefined, { refetchType: 'none' })

    expect(
      ctx.queryClient.getQueryState(infinite.key({ params: { page: 1 } }))?.isInvalidated,
    ).toBe(true)
  })
})
