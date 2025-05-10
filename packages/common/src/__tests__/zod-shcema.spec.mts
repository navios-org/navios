import { create } from 'navios'
import { makeNaviosFakeAdapter } from 'navios/testing'

import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { builder } from '../builder.mjs'

describe('navios common', () => {
  it('should parse the response', async () => {
    const adapter = makeNaviosFakeAdapter()
    adapter.mock(
      '/api/test',
      'GET',
      () => new Response(JSON.stringify({ data: 'test' })),
    )
    const api = builder()
    const client = create({ baseURL: '/api', adapter: adapter.fetch })
    api.provideClient(client)
    const getTest = api.declareEndpoint({
      method: 'GET',
      url: '/test',
      responseSchema: z.object({ data: z.string() }),
    })
    const result = await getTest({})
    expect(result).toEqual({ data: 'test' })
  })

  it('should ask for a bind parameter', async () => {
    const adapter = makeNaviosFakeAdapter()
    adapter.mock(
      '/api/bar/test',
      'GET',
      () => new Response(JSON.stringify({ data: 'test' })),
    )
    const api = builder()
    const client = create({ baseURL: '/api', adapter: adapter.fetch })
    api.provideClient(client)
    const getTest = api.declareEndpoint({
      method: 'GET',
      url: '/$foo/test' as const,
      responseSchema: z.object({ data: z.string() }),
    })
    const result = await getTest({
      urlParams: {
        foo: 'bar',
      },
    })
    expect(result).toEqual({ data: 'test' })
  })

  it('should work with union request schemas', async () => {
    const adapter = makeNaviosFakeAdapter()
    adapter.mock(
      '/api/bar/test',
      'POST',
      () => new Response(JSON.stringify({ data: 'test' })),
    )
    const api = builder()
    const client = create({ baseURL: '/api', adapter: adapter.fetch })
    api.provideClient(client)
    const requestSchema = z.union([
      z.object({
        foo: z.string(),
        bar: z.coerce.number(),
      }),
      z.object({
        baz: z.string(),
        qux: z.coerce.number(),
      }),
    ])
    const getTest = api.declareEndpoint({
      method: 'POST',
      url: '/bar/test' as const,
      responseSchema: z.object({ data: z.string() }),
      requestSchema,
    })
    const result = await getTest({
      data: {
        foo: 'foo',
        bar: 42,
      },
    })
    expect(result).toEqual({ data: 'test' })
  })
})
