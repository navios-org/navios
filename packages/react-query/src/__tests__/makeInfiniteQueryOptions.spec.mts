import { builder } from '@navios/builder'

import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { makeInfiniteQueryOptions } from '../make-infinite-query-options.mjs'

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
        processResponse: (data) => {
          if (!data.success) {
            throw new Error(data.message)
          }
          return data
        },
      },
      {
        select: (data) => data.pages.map((page) => page.test).flat(),
      },
    )
    const options = makeOptions({
      // @ts-expect-error it's internal type
      urlParams: { testId: '1', fooId: '2' },
      params: {},
    })
    expect(options).toBeDefined()
  })
})
