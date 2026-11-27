import { builder } from '@navios/builder'
import { keepPreviousData, QueryClient, skipToken } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import { declareClient } from '../client/declare-client.mjs'

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

const reportSchema = z.object({ rows: z.array(z.number()) })

describe('TanStack options on a query declaration', () => {
  let ctx: ReturnType<typeof setup>

  beforeEach(() => {
    vi.clearAllMocks()
    ctx = setup(() => ({ data: { rows: [1, 2] } }))
  })

  it('puts them in the options of every call, under the call site', () => {
    const getReport = ctx.client.query({
      method: 'GET',
      url: '/reports/$id',
      responseSchema: reportSchema,
      keyPrefix: ['reporting'],
      staleTime: Infinity,
      gcTime: Infinity,
      refetchOnWindowFocus: false,
    })

    const plain = getReport({ urlParams: { id: 1 } })
    const overridden = getReport({ urlParams: { id: 1 } }, { staleTime: 0 })

    expect(plain).toMatchObject({
      staleTime: Infinity,
      gcTime: Infinity,
      refetchOnWindowFocus: false,
    })
    expect(overridden).toMatchObject({ staleTime: 0, gcTime: Infinity })
    expect(plain).not.toHaveProperty('keyPrefix')
    expect(plain.queryKey).toEqual([
      'reporting',
      'GET',
      '/reports/$id',
      'query',
      { urlParams: { id: '1' } },
    ])
  })

  it('passes them to the hooks, including a query disabled with skipToken', () => {
    const getReport = ctx.client.query(
      ctx.api.declareEndpoint({ method: 'GET', url: '/reports', responseSchema: reportSchema }),
      { placeholderData: keepPreviousData, retry: 2 },
    )

    getReport.use(undefined, { retry: 5 })
    getReport.useSuspense()
    getReport.use(skipToken)

    expect(hooks.useQuery.mock.calls[0]![0]).toMatchObject({
      placeholderData: keepPreviousData,
      retry: 5,
    })
    expect(hooks.useSuspenseQuery.mock.calls[0]![0]).toMatchObject({ retry: 2 })
    expect(hooks.useQuery.mock.calls[1]![0]).toMatchObject({ retry: 2, queryFn: skipToken })
  })

  it('applies staleTime to fetch, so fresh data is not fetched again', async () => {
    const getReport = ctx.client.query({
      method: 'GET',
      url: '/reports',
      responseSchema: reportSchema,
      staleTime: Infinity,
    })

    await getReport.fetch(ctx.queryClient)
    await getReport.fetch(ctx.queryClient)
    await getReport.prefetch(ctx.queryClient)

    expect(ctx.http.calls).toHaveLength(1)
  })

  it('puts them in the options of an infinite query, with its pagination', () => {
    const listRows = ctx.client.infiniteQuery({
      method: 'GET',
      url: '/rows',
      querySchema: z.object({ offset: z.number() }),
      responseSchema: reportSchema,
      getNextPageParam: (_last, _pages, param) => ({ offset: param.offset + 10 }),
      staleTime: 30_000,
      refetchOnMount: false,
    })

    const options = listRows({ params: { offset: 0 } }, { refetchOnMount: true })

    expect(options).toMatchObject({
      staleTime: 30_000,
      refetchOnMount: true,
      initialPageParam: { offset: 0 },
    })
    expect(options.getNextPageParam).toBeTypeOf('function')
  })
})

describe('shared error schemas of the builder', () => {
  it('parse the error bodies of inline declarations', async () => {
    const http = makeHttp(() => ({
      status: 401,
      data: { error: { message: 'Sign in again' } },
    }))
    const api = builder({
      client: http.client,
      errorSchema: { 401: z.object({ error: z.object({ message: z.string() }) }) },
    })
    const client = declareClient({ api })
    const getMe = client.query({ method: 'GET', url: '/me', responseSchema: z.any() })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const error = await getMe.fetch(queryClient).catch((e: unknown) => e)

    expect(error).toMatchObject({
      kind: 'http',
      status: 401,
      body: { error: { message: 'Sign in again' } },
    })
  })
})
