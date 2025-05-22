import { builder } from '@navios/builder'

import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { declareClient } from '../declare-client.mjs'

describe('client type check', () => {
  const api = builder({
    useDiscriminatorResponse: true,
  })
  const client = declareClient({
    api,
  })
  it('simple query', () => {
    const query = client.query({
      url: 'test/$foo',
      method: 'GET',
      responseSchema: z.object({
        test: z.string(),
      }),
    })
    const options = query({
      urlParams: {
        foo: 'bar',
      },
    })
    expect(options.queryKey).toEqual(['test', 'bar', []])
    expect(query.use).toBeDefined()
    expect(query.useSuspense).toBeDefined()
    expect(query.invalidate).toBeDefined()
    expect(query.invalidateAll).toBeDefined()
    expect(query.queryKey).toBeDefined()
  })
  it('query with params', () => {
    const query = client.query({
      url: 'test/$foo',
      method: 'GET',
      querySchema: z.object({
        foo: z.string(),
      }),
      responseSchema: z.object({
        test: z.string(),
      }),
    })
    const options = query({
      urlParams: {
        foo: 'bar',
      },
      params: {
        foo: 'bar',
      },
    })
    expect(options.queryKey).toEqual(['test', 'bar', { foo: 'bar' }])
    expect(query.use).toBeDefined()
    expect(query.useSuspense).toBeDefined()
    expect(query.invalidate).toBeDefined()
    expect(query.invalidateAll).toBeDefined()
    expect(query.queryKey).toBeDefined()
  })
})
