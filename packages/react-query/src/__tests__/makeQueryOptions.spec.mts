import { builder } from '@navios/common'

import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { makeQueryOptions } from '../make-query-options.mjs'

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
      {
        processResponse: (data) => {
          if (!data.success) {
            throw new Error(data.message)
          }
          return data
        },
      },
      {
        select: (data) => data.test,
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
})
