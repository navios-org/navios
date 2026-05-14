import { builder } from '@navios/builder'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { z } from 'zod/v4'

import type { UseQueryResult, UseSuspenseQueryResult } from '@tanstack/react-query'

import { makeQueryOptions } from '../query/make-options.mjs'

vi.mock('@tanstack/react-query', async (importReal) => {
  const actual = await importReal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQuery: vi.fn((options: { select?: (data: unknown) => unknown }) => ({
      data: options.select ? options.select({ success: true, test: 'hello' }) : undefined,
      _passed: options,
    })),
    useSuspenseQuery: vi.fn((options: { select?: (data: unknown) => unknown }) => ({
      data: options.select ? options.select({ success: true, test: 'hello' }) : undefined,
      _passed: options,
    })),
  }
})

describe('makeQueryOptions', () => {
  const api = builder({})
  const responseSchema = z.discriminatedUnion('success', [
    z.object({ success: z.literal(true), test: z.string() }),
    z.object({ success: z.literal(false), message: z.string() }),
  ])
  const endpoint = api.declareEndpoint({
    method: 'GET',
    url: '/test/$testId/foo/$fooId' as const,
    querySchema: z.object({ foo: z.string() }),
    responseSchema,
  })
  it('should work with types', () => {
    const makeOptions = makeQueryOptions(
      endpoint,
      {},
      {
        select: (data) => ('test' in data ? data.test : undefined),
      },
    )
    const options = makeOptions({
      urlParams: { testId: '1', fooId: '2' },
      params: {
        foo: 'bar',
      },
    })
    expect(options).toBeDefined()
  })

  it('use() accepts a per-call select and forwards it to useQuery', async () => {
    const { useQuery } = await import('@tanstack/react-query')
    const useQueryMock = vi.mocked(useQuery)
    useQueryMock.mockClear()

    const query = makeQueryOptions(endpoint, {})
    const result = query.use(
      { urlParams: { testId: '1', fooId: '2' }, params: { foo: 'bar' } },
      { select: (data) => ('test' in data ? data.test : 'fallback') },
    )

    expect(useQueryMock).toHaveBeenCalledTimes(1)
    const passed = useQueryMock.mock.calls[0]?.[0] as {
      select?: (d: z.output<typeof responseSchema>) => string
    }
    expect(typeof passed.select).toBe('function')
    expect(passed.select?.({ success: true, test: 'hello' })).toBe('hello')
    expect(passed.select?.({ success: false, message: 'no' })).toBe('fallback')
    // Mocked useQuery applies the select and returns it as `data`.
    expect((result as unknown as { data: unknown }).data).toBe('hello')
  })

  it('useSuspense() accepts a per-call select and forwards it', async () => {
    const { useSuspenseQuery } = await import('@tanstack/react-query')
    const useSuspenseQueryMock = vi.mocked(useSuspenseQuery)
    useSuspenseQueryMock.mockClear()

    const query = makeQueryOptions(endpoint, {})
    const result = query.useSuspense(
      { urlParams: { testId: '1', fooId: '2' }, params: { foo: 'bar' } },
      { select: (data) => ('test' in data ? data.test.length : 0) },
    )

    expect(useSuspenseQueryMock).toHaveBeenCalledTimes(1)
    const passed = useSuspenseQueryMock.mock.calls[0]?.[0] as {
      select?: (d: z.output<typeof responseSchema>) => number
    }
    expect(typeof passed.select).toBe('function')
    expect(passed.select?.({ success: true, test: 'hello' })).toBe(5)
    expect((result as unknown as { data: unknown }).data).toBe(5)
  })

  it('per-call select narrows the hook return type to TSelected', () => {
    const query = makeQueryOptions(endpoint, {})
    // Compile-time check only — never runs.
    const _check = (): void => {
      const a = query.use(
        { urlParams: { testId: '1', fooId: '2' }, params: { foo: 'bar' } },
        { select: (data) => ('test' in data ? data.test : null) },
      )
      expectTypeOf(a).toEqualTypeOf<UseQueryResult<string | null, Error>>()

      const b = query.useSuspense(
        { urlParams: { testId: '1', fooId: '2' }, params: { foo: 'bar' } },
        { select: (data) => ('test' in data ? data.test.length : 0) },
      )
      expectTypeOf(b).toEqualTypeOf<UseSuspenseQueryResult<number, Error>>()
    }
    expect(_check).toBeTypeOf('function')
  })
})
