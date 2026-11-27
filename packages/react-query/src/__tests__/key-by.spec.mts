// @vitest-environment jsdom
import { builder } from '@navios/builder'
import { QueryClient, QueryClientProvider, skipToken } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import type { AbstractRequestConfig, Client } from '@navios/builder'
import type { ReactNode } from 'react'

import { declareClient } from '../client/declare-client.mjs'

import { makeHttp } from './helpers.mjs'

/** The query params a request was sent with, as JSON would carry them. */
function sentParams(config: AbstractRequestConfig | undefined) {
  return JSON.parse(JSON.stringify(config?.params ?? {})) as Record<string, unknown>
}

/** Answers every request with the params it was sent with. */
const echo = (config: AbstractRequestConfig) => ({ data: { params: sentParams(config) } })

const paramsSchema = z.object({
  q: z.string().optional(),
  role: z.string().optional(),
  sort: z.string().optional(),
})
const echoSchema = z.object({ params: z.record(z.string(), z.unknown()) })

/** HTTP client whose requests stay pending until the test answers them. */
function controlledHttp() {
  const pending: Array<{ config: AbstractRequestConfig; resolve: () => void }> = []
  const client: Client = {
    request: (config) =>
      new Promise((resolve) => {
        pending.push({
          config,
          resolve: () =>
            resolve({
              status: 200,
              statusText: 'OK',
              headers: {},
              data: { params: sentParams(config) },
            } as never),
        })
      }),
  }
  return { client, pending }
}

function setup() {
  const http = makeHttp(echo)
  const api = builder({ client: http.client })
  const client = declareClient({ api })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
  return { http, api, client, queryClient, wrapper }
}

describe('keyBy', () => {
  let ctx: ReturnType<typeof setup>

  beforeEach(() => {
    ctx = setup()
  })

  afterEach(() => {
    cleanup()
    ctx.queryClient.clear()
  })

  const users = {
    method: 'GET',
    url: '/users',
    querySchema: paramsSchema,
    responseSchema: echoSchema,
  } as const

  /** One entry for every search: `params` never identify it. */
  const searchUsers = () => ctx.client.query({ ...users, keyBy: { params: false } })
  /** One entry per role: the other params are shared. */
  const searchByRole = () => ctx.client.query({ ...users, keyBy: { params: ['role'] } })
  const plainUsers = () => ctx.client.query(users)

  describe('keys', () => {
    it('leaves a part out of the key and marks the entry with the rule', () => {
      const orgUsers = ctx.client.query({
        method: 'GET',
        url: '/orgs/$orgId/users',
        querySchema: paramsSchema,
        responseSchema: echoSchema,
        keyBy: { params: false },
      })

      expect(orgUsers.key()).toEqual([
        'GET',
        '/orgs/$orgId/users',
        'query',
        { keyBy: 'params:false' },
      ])
      expect(orgUsers.key({ urlParams: { orgId: 1 } })).toEqual([
        'GET',
        '/orgs/$orgId/users',
        'query',
        { keyBy: 'params:false' },
        { urlParams: { orgId: '1' } },
      ])
    })

    it('keeps only the listed fields of a part', async () => {
      const search = searchByRole()

      expect(search.key({ params: { role: 'admin' } })).toEqual([
        'GET',
        '/users',
        'query',
        { keyBy: 'params:["role"]' },
        { params: { role: 'admin' } },
      ])

      await search.fetch(ctx.queryClient, { params: { role: 'admin', q: 'ada' } })
      expect(ctx.queryClient.getQueryCache().getAll()[0]?.queryKey).toEqual(
        search.key({ params: { role: 'admin' } }),
      )
    })

    it('keeps one entry for the endpoint with keyBy: false', () => {
      const search = ctx.client.query({ ...users, keyBy: false })

      expect(search.key()).toEqual(['GET', '/users', 'query', { keyBy: false }])
    })

    it('gives the same entry whatever the order of the listed fields', () => {
      expect(ctx.client.query({ ...users, keyBy: { params: ['sort', 'role'] } }).key()).toEqual(
        ctx.client.query({ ...users, keyBy: { params: ['role', 'sort'] } }).key(),
      )
    })

    it('adds no marker when every input is kept', () => {
      expect(ctx.client.query({ ...users, keyBy: {} }).key()).toEqual(['GET', '/users', 'query'])
      expect(ctx.client.query({ ...users, keyBy: { params: true } }).key()).toEqual([
        'GET',
        '/users',
        'query',
      ])
    })

    it('never shares an entry with a plain declaration of the endpoint', async () => {
      const plain = plainUsers()
      const shared = searchUsers()

      await plain.fetch(ctx.queryClient)
      await shared.fetch(ctx.queryClient, { params: { q: 'ada' } })

      expect(plain.getData(ctx.queryClient)).toEqual({ params: {} })
      expect(shared.getData(ctx.queryClient)).toEqual({ params: { q: 'ada' } })
    })

    it('is still addressed by the plain whole-endpoint key', async () => {
      const plain = plainUsers()
      const shared = searchUsers()
      await shared.fetch(ctx.queryClient, { params: { q: 'ada' } })

      await plain.invalidate(ctx.queryClient, undefined, { refetchType: 'none' })

      expect(ctx.queryClient.getQueryState(shared.key())?.isInvalidated).toBe(true)
    })
  })

  describe('fetch, prefetch and ensure', () => {
    it('fetch with new shared inputs fetches even when the entry is fresh', async () => {
      const search = ctx.client.query({ ...users, keyBy: { params: false }, staleTime: Infinity })

      await search.fetch(ctx.queryClient, { params: { q: 'a' } })
      const next = await search.fetch(ctx.queryClient, { params: { q: 'b' } })

      expect(next).toEqual({ params: { q: 'b' } })
      expect(search.getData(ctx.queryClient)).toEqual({ params: { q: 'b' } })
      expect(ctx.http.calls).toHaveLength(2)
    })

    it('fetch with the same shared inputs uses the fresh entry', async () => {
      const search = ctx.client.query({ ...users, keyBy: { params: false }, staleTime: Infinity })

      await search.fetch(ctx.queryClient, { params: { q: 'a' } })
      await search.fetch(ctx.queryClient, { params: { q: 'a' } })
      await search.prefetch(ctx.queryClient, { params: { q: 'a' } })

      expect(ctx.http.calls).toHaveLength(1)
    })

    it('fetch without shared inputs requests with the ones sent last', async () => {
      const search = searchUsers()

      await search.fetch(ctx.queryClient, { params: { q: 'a' } })
      await search.fetch(ctx.queryClient)

      expect(ctx.http.calls.map(sentParams)).toEqual([{ q: 'a' }, { q: 'a' }])
    })

    it('ensure returns the cached entry unless the shared inputs change', async () => {
      const search = searchUsers()

      await search.ensure(ctx.queryClient, { params: { q: 'a' } })
      await search.ensure(ctx.queryClient, { params: { q: 'a' } })
      expect(await search.ensure(ctx.queryClient)).toEqual({ params: { q: 'a' } })
      expect(ctx.http.calls).toHaveLength(1)

      expect(await search.ensure(ctx.queryClient, { params: { q: 'b' } })).toEqual({
        params: { q: 'b' },
      })
      expect(ctx.http.calls).toHaveLength(2)
    })

    it('clears a shared input sent as undefined', async () => {
      const search = searchByRole()

      await search.fetch(ctx.queryClient, { params: { role: 'admin', q: 'a' } })
      await search.fetch(ctx.queryClient, { params: { role: 'admin', q: undefined } })

      expect(ctx.http.calls.map(sentParams)).toEqual([{ role: 'admin', q: 'a' }, { role: 'admin' }])
    })

    it('replaces only the shared fields a call has', async () => {
      const search = searchByRole()

      await search.fetch(ctx.queryClient, { params: { role: 'admin', q: 'a', sort: 'name' } })
      await search.fetch(ctx.queryClient, { params: { role: 'admin', q: 'b' } })

      expect(sentParams(ctx.http.calls[1])).toEqual({ role: 'admin', q: 'b', sort: 'name' })
    })

    it('replaces a whole part left out with false', async () => {
      const search = searchUsers()

      await search.fetch(ctx.queryClient, { params: { q: 'a', sort: 'name' } })
      await search.fetch(ctx.queryClient, { params: { q: 'b' } })
      await search.fetch(ctx.queryClient, { params: undefined })

      expect(ctx.http.calls.map(sentParams)).toEqual([{ q: 'a', sort: 'name' }, { q: 'b' }, {}])
    })

    it('keeps the shared inputs of each entry apart', async () => {
      const search = searchByRole()

      await search.fetch(ctx.queryClient, { params: { role: 'admin', q: 'a' } })
      await search.fetch(ctx.queryClient, { params: { role: 'guest', q: 'b' } })
      await search.fetch(ctx.queryClient, { params: { role: 'admin' } })

      expect(sentParams(ctx.http.calls[2])).toEqual({ role: 'admin', q: 'a' })
    })

    it('keeps the shared inputs per QueryClient', async () => {
      const search = searchUsers()
      const other = new QueryClient({ defaultOptions: { queries: { retry: false } } })

      await search.fetch(ctx.queryClient, { params: { q: 'a' } })
      await search.fetch(other)

      expect(sentParams(ctx.http.calls[1])).toEqual({})
    })

    it('forgets the shared inputs when the entry is removed', async () => {
      const search = searchUsers()

      await search.fetch(ctx.queryClient, { params: { q: 'a' } })
      ctx.queryClient.removeQueries({ queryKey: search.key() })
      await search.fetch(ctx.queryClient)

      expect(sentParams(ctx.http.calls[1])).toEqual({})
    })

    it('invalidation refetches with the shared inputs sent last', async () => {
      const search = searchUsers()

      await search.fetch(ctx.queryClient, { params: { q: 'a' } })
      await search.fetch(ctx.queryClient, { params: { q: 'b' } })
      await search.invalidate(ctx.queryClient, undefined, { refetchType: 'all' })

      expect(ctx.http.calls.map(sentParams)).toEqual([{ q: 'a' }, { q: 'b' }, { q: 'b' }])
    })

    it('repeats a request overtaken by new shared inputs', async () => {
      const { client: http, pending } = controlledHttp()
      const client = declareClient({ api: builder({ client: http }) })
      const search = client.query({ ...users, keyBy: { params: false } })

      const first = search.fetch(ctx.queryClient, { params: { q: 'a' } })
      await waitFor(() => expect(pending).toHaveLength(1))
      // No data yet, so TanStack joins the request in flight
      const second = search.fetch(ctx.queryClient, { params: { q: 'b' } })
      pending[0]!.resolve()
      await waitFor(() => expect(pending).toHaveLength(2))
      pending[1]!.resolve()

      expect(sentParams(pending[1]!.config)).toEqual({ q: 'b' })
      expect(await first).toEqual({ params: { q: 'b' } })
      expect(await second).toEqual({ params: { q: 'b' } })
    })

    it('gives two concurrent fetches with the same new inputs their data', async () => {
      const { client: http, pending } = controlledHttp()
      const client = declareClient({ api: builder({ client: http }) })
      const search = client.query({ ...users, keyBy: { params: false }, staleTime: 60_000 })
      const first = search.fetch(ctx.queryClient, { params: { q: 'a' } })
      await waitFor(() => expect(pending).toHaveLength(1))
      pending[0]!.resolve()
      await first

      const b1 = search.fetch(ctx.queryClient, { params: { q: 'b' } })
      const b2 = search.fetch(ctx.queryClient, { params: { q: 'b' } })
      await waitFor(() => expect(pending).toHaveLength(2))
      pending[1]!.resolve()

      expect(await b1).toEqual({ params: { q: 'b' } })
      expect(await b2).toEqual({ params: { q: 'b' } })
    })

    it('fetches again after a request for the shared inputs failed', async () => {
      let failures = 1
      ctx.http.respond((config) =>
        sentParams(config).q === 'b' && failures-- > 0
          ? { status: 500, data: { message: 'down' } }
          : echo(config),
      )
      const search = ctx.client.query({ ...users, keyBy: { params: false }, staleTime: 60_000 })

      await search.fetch(ctx.queryClient, { params: { q: 'a' } })
      await expect(search.fetch(ctx.queryClient, { params: { q: 'b' } })).rejects.toBeDefined()

      expect(await search.ensure(ctx.queryClient, { params: { q: 'b' } })).toEqual({
        params: { q: 'b' },
      })
    })

    it('fetches again when a request is cancelled back to other inputs’ data', async () => {
      const { client: http, pending } = controlledHttp()
      const client = declareClient({ api: builder({ client: http }) })
      const search = client.query({ ...users, keyBy: { params: false }, staleTime: 60_000 })
      const first = search.fetch(ctx.queryClient, { params: { q: 'a' } })
      await waitFor(() => expect(pending).toHaveLength(1))
      pending[0]!.resolve()
      await first

      const b = search.fetch(ctx.queryClient, { params: { q: 'b' } })
      await waitFor(() => expect(pending).toHaveLength(2))
      // As an optimistic update does before it writes the entry
      await ctx.queryClient.cancelQueries({ queryKey: search.key() })
      await waitFor(() => expect(pending).toHaveLength(3))
      pending[2]!.resolve()

      expect(await b).toEqual({ params: { q: 'b' } })
      expect(await search.fetch(ctx.queryClient, { params: { q: 'b' } })).toEqual({
        params: { q: 'b' },
      })
      expect(pending).toHaveLength(3)
    })

    it('keeps the entries of two shared declarations of one endpoint apart', async () => {
      const byRole = searchByRole()
      const byRoleAndSort = ctx.client.query({ ...users, keyBy: { params: ['role', 'sort'] } })
      await byRole.fetch(ctx.queryClient, { params: { role: 'admin' } })
      await byRoleAndSort.fetch(ctx.queryClient, { params: { role: 'admin', sort: 'name' } })

      const other = byRoleAndSort.key({ params: { role: 'admin', sort: 'name' } })

      await ctx.queryClient.invalidateQueries({ queryKey: byRole.key(), refetchType: 'none' })
      await byRole.invalidate(
        ctx.queryClient,
        { params: { role: 'admin' } },
        { refetchType: 'none' },
      )
      expect(ctx.queryClient.getQueryState(other)?.isInvalidated).toBe(false)

      // Without arguments it is the whole endpoint, as for every declaration
      await byRole.invalidate(ctx.queryClient, undefined, { refetchType: 'none' })
      expect(ctx.queryClient.getQueryState(other)?.isInvalidated).toBe(true)
    })
  })

  describe('hooks', () => {
    it('makes the first request of a mount with the hook’s shared inputs', async () => {
      const search = searchUsers()

      const { result } = renderHook(() => search.use({ params: { q: 'a' } }), {
        wrapper: ctx.wrapper,
      })

      await waitFor(() => expect(result.current.data).toEqual({ params: { q: 'a' } }))
      expect(ctx.http.calls.map(sentParams)).toEqual([{ q: 'a' }])
    })

    it('refetches the entry for every component when a hook changes them', async () => {
      const search = searchUsers()

      const { result, rerender } = renderHook(
        ({ q }: { q: string }) => ({
          sender: search.use({ params: { q } }),
          reader: search.use(),
        }),
        { wrapper: ctx.wrapper, initialProps: { q: 'a' } },
      )
      await waitFor(() => expect(result.current.reader.data).toEqual({ params: { q: 'a' } }))

      rerender({ q: 'b' })

      await waitFor(() => expect(result.current.reader.data).toEqual({ params: { q: 'b' } }))
      expect(result.current.sender.data).toEqual({ params: { q: 'b' } })
      expect(ctx.http.calls.map(sentParams)).toEqual([{ q: 'a' }, { q: 'b' }])
    })

    it('a hook without shared inputs requests with the ones sent last', async () => {
      const search = searchUsers()
      await search.fetch(ctx.queryClient, { params: { q: 'a' } })

      const { result } = renderHook(() => search.use(), { wrapper: ctx.wrapper })

      await waitFor(() => expect(result.current.isFetching).toBe(false))
      expect(ctx.http.calls.map(sentParams)).toEqual([{ q: 'a' }, { q: 'a' }])
    })

    it('shows the result of shared inputs sent from elsewhere', async () => {
      const search = searchUsers()
      await search.fetch(ctx.queryClient, { params: { q: 'a' } })

      const { result } = renderHook(() => search.use(undefined, { staleTime: Infinity }), {
        wrapper: ctx.wrapper,
      })

      expect(result.current.data).toEqual({ params: { q: 'a' } })
      await act(() => search.fetch(ctx.queryClient, { params: { q: 'b' } }))
      await waitFor(() => expect(result.current.data).toEqual({ params: { q: 'b' } }))
    })

    it('does not send from a disabled hook', async () => {
      const search = searchUsers()
      await search.fetch(ctx.queryClient, { params: { q: 'a' } })

      renderHook(() => search.use({ params: { q: 'b' } }, { enabled: false }), {
        wrapper: ctx.wrapper,
      })
      renderHook(() => search.use({ params: { q: 'c' } }, { enabled: () => false }), {
        wrapper: ctx.wrapper,
      })
      await search.fetch(ctx.queryClient)

      expect(ctx.http.calls.map(sentParams)).toEqual([{ q: 'a' }, { q: 'a' }])
    })

    it('does not send from a hook given skipToken', async () => {
      const search = searchUsers()
      await search.fetch(ctx.queryClient, { params: { q: 'a' } })

      renderHook(() => search.use(skipToken), { wrapper: ctx.wrapper })
      await search.fetch(ctx.queryClient)

      expect(ctx.http.calls.map(sentParams)).toEqual([{ q: 'a' }, { q: 'a' }])
    })

    it('keeps two hooks with different shared inputs on the inputs sent last', async () => {
      const search = searchUsers()

      const { result } = renderHook(
        () => ({
          first: search.use({ params: { q: 'a' } }),
          second: search.use({ params: { q: 'b' } }),
        }),
        { wrapper: ctx.wrapper },
      )
      await waitFor(() => expect(result.current.first.data).toEqual({ params: { q: 'b' } }))

      await act(() => search.invalidate(ctx.queryClient))
      await waitFor(() => expect(result.current.first.isFetching).toBe(false))

      expect(ctx.http.calls.map(sentParams)).toEqual([{ q: 'b' }, { q: 'b' }])
    })

    it('trusts an entry filled elsewhere until its shared inputs change', async () => {
      const search = searchUsers()
      // As after `hydrate`: data in the cache, no request made by this client
      search.setData(ctx.queryClient, {}, { params: { q: 'a' } })

      const { result, rerender } = renderHook(
        ({ q }: { q: string }) => search.use({ params: { q } }, { staleTime: Infinity }),
        { wrapper: ctx.wrapper, initialProps: { q: 'a' } },
      )
      expect(result.current.data).toEqual({ params: { q: 'a' } })
      expect(ctx.http.calls).toHaveLength(0)

      rerender({ q: 'b' })

      await waitFor(() => expect(result.current.data).toEqual({ params: { q: 'b' } }))
      expect(ctx.http.calls.map(sentParams)).toEqual([{ q: 'b' }])
    })

    it('fetches again on remount after an unmount cancelled the request', async () => {
      const { client: http, pending } = controlledHttp()
      const client = declareClient({ api: builder({ client: http }) })
      const search = client.query({ ...users, keyBy: { params: false }, staleTime: 60_000 })
      const first = search.fetch(ctx.queryClient, { params: { q: 'a' } })
      await waitFor(() => expect(pending).toHaveLength(1))
      pending[0]!.resolve()
      await first

      const mounted = renderHook(() => search.use({ params: { q: 'b' } }), {
        wrapper: ctx.wrapper,
      })
      await waitFor(() => expect(pending).toHaveLength(2))
      // The last observer leaves: TanStack cancels the request and reverts the entry
      mounted.unmount()

      const { result } = renderHook(() => search.use({ params: { q: 'b' } }), {
        wrapper: ctx.wrapper,
      })
      await waitFor(() => expect(pending).toHaveLength(3))
      pending[2]!.resolve()

      await waitFor(() => expect(result.current.data).toEqual({ params: { q: 'b' } }))
    })

    it('fetches the new entry when keyed and shared inputs change at once', async () => {
      const search = ctx.client.query({
        ...users,
        keyBy: { params: ['role'] },
        staleTime: 60_000,
      })

      const { result, rerender } = renderHook(
        ({ role, q }: { role: string; q: string }) => search.use({ params: { role, q } }),
        { wrapper: ctx.wrapper, initialProps: { role: 'admin', q: 'x' } },
      )
      await waitFor(() =>
        expect(result.current.data).toEqual({ params: { role: 'admin', q: 'x' } }),
      )
      rerender({ role: 'guest', q: 'x' })
      await waitFor(() =>
        expect(result.current.data).toEqual({ params: { role: 'guest', q: 'x' } }),
      )
      rerender({ role: 'guest', q: 'y' })
      await waitFor(() =>
        expect(result.current.data).toEqual({ params: { role: 'guest', q: 'y' } }),
      )

      rerender({ role: 'admin', q: 'y' })

      await waitFor(() =>
        expect(result.current.data).toEqual({ params: { role: 'admin', q: 'y' } }),
      )
    })

    it('does not send again on every render with an inline enabled function', async () => {
      const search = searchUsers()

      const { result } = renderHook(
        () => search.use({ params: { q: 'a' } }, { enabled: () => true }),
        { wrapper: ctx.wrapper },
      )
      await waitFor(() => expect(result.current.data).toEqual({ params: { q: 'a' } }))
      await act(() => search.fetch(ctx.queryClient, { params: { q: 'z' } }))
      await waitFor(() => expect(result.current.data).toEqual({ params: { q: 'z' } }))
      await act(() => new Promise((resolve) => setTimeout(resolve, 20)))

      expect(result.current.data).toEqual({ params: { q: 'z' } })
      expect(ctx.http.calls.map(sentParams)).toEqual([{ q: 'a' }, { q: 'z' }])
    })

    it('useSuspense sends even when the declaration disables the query', async () => {
      const search = ctx.client.query({ ...users, keyBy: { params: false }, enabled: false })
      await search.fetch(ctx.queryClient, { params: { q: 'a' } })

      const { result } = renderHook(() => search.useSuspense({ params: { q: 'b' } }), {
        wrapper: ctx.wrapper,
      })

      await waitFor(() => expect(result.current.data).toEqual({ params: { q: 'b' } }))
    })

    it('useSuspense sends its shared inputs', async () => {
      const search = searchUsers()
      await search.fetch(ctx.queryClient, { params: { q: 'a' } })

      const { result } = renderHook(() => search.useSuspense({ params: { q: 'b' } }), {
        wrapper: ctx.wrapper,
      })

      await waitFor(() => expect(result.current.data).toEqual({ params: { q: 'b' } }))
    })

    it('the options a call returns use the shared inputs sent last', async () => {
      const search = searchUsers()
      await search.fetch(ctx.queryClient, { params: { q: 'a' } })

      await ctx.queryClient.query({ ...search(), staleTime: 0 })

      expect(ctx.http.calls.map(sentParams)).toEqual([{ q: 'a' }, { q: 'a' }])
    })
  })
})
