import { builder } from '@navios/builder'
import { create } from '@navios/http'
import { makeNaviosFakeAdapter } from '@navios/http/testing'
import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import { makeQueryOptions } from '../make-options.mjs'

describe('envelope + unwrap', () => {
  const adapter = makeNaviosFakeAdapter()
  const api = builder({})
  api.provideClient(create({ adapter: adapter.fetch }))

  const getUser = api.declareEndpoint({
    method: 'GET',
    url: '/u' as const,
    responseSchema: z.object({ name: z.string() }),
    errorSchema: { 404: z.object({ msg: z.string() }) },
    result: 'envelope',
  })

  it("unwrap: 'none' (default) — envelope is the cached data", async () => {
    adapter.mock(
      '/u',
      'GET',
      () =>
        new Response(JSON.stringify({ name: 'A' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    )
    const opts = makeQueryOptions(getUser, {})({} as never)
    const qc = new QueryClient()
    const data: any = await qc.fetchQuery(opts)
    expect(data.ok).toBe(true)
    if (data.ok) {
      expect(data.data).toEqual({ name: 'A' })
      expect(data.response.status).toBe(200)
    }
  })

  it("unwrap: 'throw-on-error' — RQ error channel fires with typed envelope error", async () => {
    adapter.mock(
      '/u',
      'GET',
      () =>
        new Response(JSON.stringify({ msg: 'gone' }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        }),
    )
    const opts = makeQueryOptions(getUser, { unwrap: 'throw-on-error' })({} as never)
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    await expect(qc.fetchQuery(opts)).rejects.toMatchObject({ kind: 'http', status: 404 })
  })

  it("unwrap: 'throw-on-error' — success path returns unwrapped data", async () => {
    adapter.mock(
      '/u',
      'GET',
      () =>
        new Response(JSON.stringify({ name: 'A' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    )
    const opts = makeQueryOptions(getUser, { unwrap: 'throw-on-error' })({} as never)
    const qc = new QueryClient()
    const data: any = await qc.fetchQuery(opts)
    expect(data).toEqual({ name: 'A' })
  })
})
