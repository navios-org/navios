import { makeNaviosFakeAdapter } from 'navios/testing'

import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { createAPI } from '../createAPI.mjs'

describe('navios-zod', () => {
  it('should parse the response', async () => {
    const adapter = makeNaviosFakeAdapter()
    adapter.mock(
      '/api/test',
      'GET',
      () => new Response(JSON.stringify({ data: 'test' })),
    )
    const api = createAPI({ baseURL: '/api', adapter: adapter.fetch })
    const getTest = api.declareEndpoint({
      method: 'GET',
      url: '/test',
      responseSchema: z.object({ data: z.string() }),
    })
    const result = await getTest()
    expect(result).toEqual({ data: 'test' })
  })

  it('should work with descriminators', async () => {
    const adapter = makeNaviosFakeAdapter()
    let sentSuccess = false
    adapter.mock('/api/test', 'POST', () => {
      if (!sentSuccess) {
        sentSuccess = true
        return new Response(JSON.stringify({ content: 'test' }))
      }
      return new Response(JSON.stringify({ error: 'test' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })
    })
    const api = createAPI({
      baseURL: '/api',
      adapter: adapter.fetch,
      useDiscriminatorResponse: true,
      useWholeResponse: true,
    })
    const request = z.object({
      foo: z.string(),
      bar: z.coerce.number(),
    })
    const descrimintatedSchema = z.discriminatedUnion('status', [
      z.object({
        status: z.literal(200),
        data: z.object({
          content: z.string(),
        }),
      }),
      z.object({
        status: z.literal(400),
        data: z.object({
          error: z.string(),
        }),
      }),
    ])
    const getTest = api.declareEndpoint({
      method: 'POST',
      url: '/test',
      responseSchema: descrimintatedSchema,
      requestSchema: request,
    })
    const a = api.declareEndpoint({
      method: 'POST',
      responseSchema: descrimintatedSchema,
      url: '/test',
    })
    const result = await getTest({
      data: {
        foo: 'foo',
        bar: 42,
      },
    })
    expect(result).toEqual({
      status: 200,
      data: { content: 'test' },
    })
    const result2 = await getTest({
      data: {
        foo: 'foo',
        bar: 42,
      },
    })
    expect(result2).toEqual({ status: 400, data: { error: 'test' } })
  })

  it('should ask for a bind parameter', async () => {
    const adapter = makeNaviosFakeAdapter()
    adapter.mock(
      '/api/bar/test',
      'GET',
      () => new Response(JSON.stringify({ data: 'test' })),
    )
    const api = createAPI({ baseURL: '/api', adapter: adapter.fetch })
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
    const api = createAPI({ baseURL: '/api', adapter: adapter.fetch })
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
