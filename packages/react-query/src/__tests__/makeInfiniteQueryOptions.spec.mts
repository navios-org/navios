import { builder } from '@navios/builder'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { z } from 'zod/v4'

import type {
  InfiniteData,
  UseInfiniteQueryResult,
  UseSuspenseInfiniteQueryResult,
} from '@tanstack/react-query'

import { makeInfiniteQueryOptions } from '../query/make-infinite-options.mjs'

vi.mock('@tanstack/react-query', async (importReal) => {
  const actual = await importReal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useInfiniteQuery: vi.fn((options: { select?: (data: unknown) => unknown }) => ({
      _passed: options,
      data: options.select,
    })),
    useSuspenseInfiniteQuery: vi.fn((options: { select?: (data: unknown) => unknown }) => ({
      _passed: options,
      data: options.select,
    })),
  }
})

describe('makeInfiniteQueryOptions', () => {
  const api = builder({})
  const responseSchema = z.discriminatedUnion('success', [
    z.object({ success: z.literal(true), test: z.string() }),
    z.object({ success: z.literal(false), message: z.string() }),
  ])
  const endpoint = api.declareEndpoint({
    method: 'GET',
    url: '/test/$testId/foo/$fooId' as const,
    querySchema: z.object({ foo: z.string().optional() }),
    responseSchema,
  })
  it('should work with types', () => {
    const makeOptions = makeInfiniteQueryOptions(
      endpoint,
      {
        getNextPageParam: (lastPage) => ({
          foo: 'test' in lastPage ? lastPage.test : undefined,
        }),
      },
      {
        select: (data) => data.pages.flatMap((page) => ('test' in page ? [page.test] : [])),
      },
    )
    const options = makeOptions({
      urlParams: { testId: '1', fooId: '2' },
      params: {},
    })
    expect(options).toBeDefined()
  })

  it('use() accepts a per-call select and forwards it to useInfiniteQuery', async () => {
    const { useInfiniteQuery } = await import('@tanstack/react-query')
    const useInfiniteQueryMock = vi.mocked(useInfiniteQuery)
    useInfiniteQueryMock.mockClear()

    const query = makeInfiniteQueryOptions(endpoint, {
      getNextPageParam: (lastPage) => ({
        foo: 'test' in lastPage ? lastPage.test : undefined,
      }),
    })

    query.use(
      { urlParams: { testId: '1', fooId: '2' }, params: {} },
      {
        select: (data) => data.pages.flatMap((page) => ('test' in page ? [page.test] : [])),
      },
    )

    expect(useInfiniteQueryMock).toHaveBeenCalledTimes(1)
    const passed = useInfiniteQueryMock.mock.calls[0]?.[0] as {
      select?: (d: InfiniteData<z.output<typeof responseSchema>>) => string[]
    }
    expect(typeof passed.select).toBe('function')
    expect(
      passed.select?.({
        pages: [
          { success: true, test: 'one' },
          { success: false, message: 'skip' },
          { success: true, test: 'two' },
        ],
        pageParams: [{}, {}, {}],
      }),
    ).toEqual(['one', 'two'])
  })

  it('useSuspense() accepts a per-call select and forwards it', async () => {
    const { useSuspenseInfiniteQuery } = await import('@tanstack/react-query')
    const useSuspenseInfiniteQueryMock = vi.mocked(useSuspenseInfiniteQuery)
    useSuspenseInfiniteQueryMock.mockClear()

    const query = makeInfiniteQueryOptions(endpoint, {
      getNextPageParam: () => undefined,
    })

    query.useSuspense(
      { urlParams: { testId: '1', fooId: '2' }, params: {} },
      { select: (data) => data.pages.length },
    )

    expect(useSuspenseInfiniteQueryMock).toHaveBeenCalledTimes(1)
    const passed = useSuspenseInfiniteQueryMock.mock.calls[0]?.[0] as {
      select?: (d: InfiniteData<z.output<typeof responseSchema>>) => number
    }
    expect(typeof passed.select).toBe('function')
    expect(
      passed.select?.({
        pages: [
          { success: true, test: 'one' },
          { success: true, test: 'two' },
        ],
        pageParams: [{}, {}],
      }),
    ).toBe(2)
  })

  it('per-call select narrows the infinite hook return type to TSelected', () => {
    const query = makeInfiniteQueryOptions(endpoint, {
      getNextPageParam: () => undefined,
    })
    const _check = (): void => {
      const a = query.use(
        { urlParams: { testId: '1', fooId: '2' }, params: {} },
        {
          select: (data) => data.pages.flatMap((page) => ('test' in page ? [page.test] : [])),
        },
      )
      expectTypeOf(a).toEqualTypeOf<UseInfiniteQueryResult<string[], Error>>()

      const b = query.useSuspense(
        { urlParams: { testId: '1', fooId: '2' }, params: {} },
        { select: (data) => data.pages.length },
      )
      expectTypeOf(b).toEqualTypeOf<UseSuspenseInfiniteQueryResult<number, Error>>()
    }
    expect(_check).toBeTypeOf('function')
  })
})
