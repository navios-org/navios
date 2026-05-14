import { builder } from '@navios/builder'
import { create } from '@navios/http'
import { makeNaviosFakeAdapter } from '@navios/http/testing'
import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import { makeInfiniteQueryOptions } from '../make-infinite-options.mjs'

describe('envelope + unwrap for infinite queries', () => {
  const adapter = makeNaviosFakeAdapter()
  const api = builder({})
  api.provideClient(create({ adapter: adapter.fetch }))

  const listUsers = api.declareEndpoint({
    method: 'GET',
    url: '/u' as const,
    querySchema: z.object({ cursor: z.string().optional() }),
    responseSchema: z.object({
      items: z.array(z.object({ id: z.string() })),
      nextCursor: z.string().nullable(),
    }),
    result: 'envelope',
  })

  it("default 'none' — each page is the envelope", async () => {
    adapter.mock(
      '/u',
      'GET',
      () =>
        new Response(JSON.stringify({ items: [{ id: '1' }], nextCursor: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    )
    const opts = makeInfiniteQueryOptions(listUsers as any, {
      getNextPageParam: (last: any) => (last.ok ? (last.data.nextCursor ?? undefined) : undefined),
      initialPageParam: { cursor: undefined },
    })({} as never)
    const qc = new QueryClient()
    const data: any = await qc.fetchInfiniteQuery(opts)
    expect(data.pages[0].ok).toBe(true)
    if (data.pages[0].ok) {
      expect(data.pages[0].data).toEqual({ items: [{ id: '1' }], nextCursor: null })
    }
  })

  it("'pages' — pages contain unwrapped bodies", async () => {
    adapter.mock(
      '/u',
      'GET',
      () =>
        new Response(JSON.stringify({ items: [{ id: '1' }], nextCursor: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    )
    const opts = makeInfiniteQueryOptions(listUsers as any, {
      unwrap: 'pages',
      getNextPageParam: (last: any) => last.nextCursor ?? undefined,
      initialPageParam: { cursor: undefined },
    })({} as never)
    const qc = new QueryClient()
    const data: any = await qc.fetchInfiniteQuery(opts)
    expect(data.pages[0]).toEqual({ items: [{ id: '1' }], nextCursor: null })
  })

  it("'pages' — page error stops pagination", async () => {
    adapter.mock(
      '/u',
      'GET',
      () =>
        new Response('boom', {
          status: 500,
          headers: { 'content-type': 'text/plain' },
        }),
    )
    const opts = makeInfiniteQueryOptions(listUsers as any, {
      unwrap: 'pages',
      getNextPageParam: () => undefined,
      initialPageParam: { cursor: undefined },
    })({} as never)
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    await expect(qc.fetchInfiniteQuery(opts)).rejects.toMatchObject({
      kind: 'http-unknown',
      status: 500,
    })
  })
})
