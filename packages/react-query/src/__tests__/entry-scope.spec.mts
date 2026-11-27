import { builder } from '@navios/builder'
import { MutationObserver, QueryClient, QueryObserver } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import type { AbstractRequestConfig, Client } from '@navios/builder'

import { declareClient } from '../client/declare-client.mjs'

vi.mock('@tanstack/react-query', async (importReal) => ({
  ...(await importReal<typeof import('@tanstack/react-query')>()),
  // The options, so a test can run them through a real MutationObserver
  useMutation: (options: unknown) => options,
}))

interface Pending {
  config: AbstractRequestConfig
  resolve: (data: unknown) => void
}

/** A client whose requests wait until the test answers them, or their signal aborts. */
function setup() {
  const pending: Pending[] = []
  const http: Client = {
    request: (config) =>
      new Promise((resolve, reject) => {
        config.signal?.addEventListener('abort', () => reject(config.signal?.reason))
        pending.push({
          config,
          resolve: (data) => resolve({ status: 200, statusText: 'OK', headers: {}, data } as never),
        })
      }),
  }
  const api = builder({ client: http })
  const client = declareClient({ api })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return { pending, api, client, queryClient }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('entries of one endpoint', () => {
  let ctx: ReturnType<typeof setup>
  const userSchema = z.object({ id: z.string(), name: z.string() })
  const usersSchema = z.array(userSchema)
  const querySchema = z.object({ role: z.string().optional(), page: z.number().optional() })

  beforeEach(() => {
    ctx = setup()
  })

  afterEach(() => {
    ctx.queryClient.clear()
  })

  function run(mutation: () => unknown, variables: unknown) {
    const observer = new MutationObserver(ctx.queryClient, mutation() as never)
    return observer.mutate(variables as never)
  }

  describe('an optimistic update', () => {
    function declare(invalidateOnSettled: boolean) {
      const users = ctx.client.query({
        method: 'GET',
        url: '/users',
        querySchema,
        responseSchema: usersSchema,
      })
      const createUser = ctx.client.mutation({
        method: 'POST',
        url: '/users',
        requestSchema: z.object({ name: z.string() }),
        responseSchema: userSchema,
        optimistic: (update) =>
          update(users, {
            update: (current, variables) => [
              ...(current ?? []),
              { id: 'new', name: variables.data.name },
            ],
            invalidateOnSettled,
          }),
      })
      return { users, createUser }
    }

    it('should leave a fetch of another entry of the endpoint running', async () => {
      const { users, createUser } = declare(false)
      const admins = new QueryObserver(ctx.queryClient, users({ params: { role: 'admin' } }))
      const unsubscribe = admins.subscribe(() => {})
      await flush()
      expect(ctx.pending).toHaveLength(1)

      const created = run(createUser, { data: { name: 'Ada' } })
      await flush()
      ctx.pending.find(({ config }) => config.method === 'POST')!.resolve({ id: '2', name: 'Ada' })
      await created

      expect(ctx.pending[0]!.config.signal?.aborted).toBe(false)
      expect(admins.getCurrentResult()).toMatchObject({
        status: 'pending',
        fetchStatus: 'fetching',
      })
      ctx.pending[0]!.resolve([{ id: '1', name: 'Root' }])
      await flush()
      expect(admins.getCurrentResult()).toMatchObject({
        status: 'success',
        data: [{ id: '1', name: 'Root' }],
      })
      unsubscribe()
    })

    it('should invalidate only the entry it updated when it settles', async () => {
      const { users, createUser } = declare(true)
      users.setData(ctx.queryClient, {}, [])
      users.setData(ctx.queryClient, { params: { role: 'admin' } }, [])

      const created = run(createUser, { data: { name: 'Ada' } })
      await flush()
      ctx.pending[0]!.resolve({ id: '2', name: 'Ada' })
      await created

      expect(ctx.queryClient.getQueryState(users.key())?.isInvalidated).toBe(true)
      expect(
        ctx.queryClient.getQueryState(users.key({ params: { role: 'admin' } }))?.isInvalidated,
      ).toBe(false)
    })
  })

  describe('the key of a query', () => {
    function declare() {
      const endpoint = ctx.api.declareEndpoint({
        method: 'GET',
        url: '/users',
        querySchema,
        responseSchema: usersSchema,
      })
      const users = ctx.client.query(endpoint)
      const withResponse = ctx.client.query(endpoint, { withResponse: true })
      const suffixed = ctx.client.query(endpoint, { keySuffix: ['v2'] })
      const infinite = ctx.client.infiniteQuery(endpoint, { getNextPageParam: () => undefined })
      const infiniteWithResponse = ctx.client.infiniteQuery(endpoint, {
        withResponse: true,
        getNextPageParam: () => undefined,
      })
      const response = { status: 200, statusText: 'OK', headers: {} }
      users.setData(ctx.queryClient, {}, [{ id: '1', name: 'Plain' }])
      users.setData(ctx.queryClient, { params: { role: 'admin' } }, [{ id: '2', name: 'Admin' }])
      withResponse.setData(ctx.queryClient, {}, { data: [], response })
      suffixed.setData(ctx.queryClient, {}, [{ id: '3', name: 'Suffixed' }])
      infinite.setData(ctx.queryClient, {}, { pages: [[]], pageParams: [{}] })
      infiniteWithResponse.setData(
        ctx.queryClient,
        {},
        { pages: [{ data: [], response }], pageParams: [{}] },
      )
      return { users, withResponse, suffixed, infinite, infiniteWithResponse }
    }

    it('should mark every form, so that no key is a prefix of another form', () => {
      const { users, withResponse, infinite, infiniteWithResponse } = declare()

      expect(users.key()).toEqual(['GET', '/users', 'query'])
      expect(users.key({ params: { role: 'admin' } })).toEqual([
        'GET',
        '/users',
        'query',
        { params: { role: 'admin' } },
      ])
      expect(withResponse.key()).toEqual(['GET', '/users', 'with-response', 'query'])
      expect(infinite.key()).toEqual(['GET', '/users', 'infinite'])
      expect(infiniteWithResponse.key()).toEqual(['GET', '/users', 'with-response', 'infinite'])
    })

    it('should match only entries that hold its data', () => {
      const queries = declare()

      for (const query of Object.values(queries)) {
        const matched = ctx.queryClient.getQueriesData({ queryKey: query.key() })
        const own = query.getData(ctx.queryClient)
        expect(own).toBeDefined()
        expect(matched.map(([, data]) => data)).toContainEqual(own)
        expect(matched).toHaveLength(query === queries.users ? 2 : 1)
      }
    })

    it('should let setQueriesData update a list next to an infinite query of the endpoint', () => {
      const { users, infinite } = declare()

      type Users = z.output<typeof usersSchema>
      ctx.queryClient.setQueriesData<Users>({ queryKey: users.key() }, (cached) =>
        cached?.map((user) => ({ ...user, name: user.name.toUpperCase() })),
      )

      expect(users.getData(ctx.queryClient)).toEqual([{ id: '1', name: 'PLAIN' }])
      expect(users.getData(ctx.queryClient, { params: { role: 'admin' } })).toEqual([
        { id: '2', name: 'ADMIN' },
      ])
      expect(infinite.getData(ctx.queryClient)).toEqual({ pages: [[]], pageParams: [{}] })
    })

    it('should keep the endpoint key as the handle of every form', async () => {
      const queries = declare()

      expect(queries.users.endpointKey).toEqual(['GET', '/users'])
      expect(queries.infinite.endpointKey).toEqual(['GET', '/users'])
      expect(queries.suffixed.endpointKey).toEqual(['GET', '/users', 'v2'])
      expect(ctx.queryClient.getQueriesData({ queryKey: queries.users.endpointKey })).toHaveLength(
        6,
      )

      await queries.infinite.invalidate(ctx.queryClient, undefined, { refetchType: 'none' })

      const invalidated = ctx.queryClient
        .getQueryCache()
        .getAll()
        .filter((query) => query.state.isInvalidated)
      expect(invalidated).toHaveLength(6)
    })

    it('should invalidate only its own form when scoped by arguments', async () => {
      const { users, infinite } = declare()
      infinite.setData(
        ctx.queryClient,
        { params: { role: 'admin' } },
        { pages: [[]], pageParams: [{}] },
      )

      await users.invalidate(
        ctx.queryClient,
        { params: { role: 'admin' } },
        { refetchType: 'none' },
      )

      const admin = { params: { role: 'admin' } }
      expect(ctx.queryClient.getQueryState(users.key(admin))?.isInvalidated).toBe(true)
      expect(ctx.queryClient.getQueryState(infinite.key(admin))?.isInvalidated).toBe(false)
      expect(ctx.queryClient.getQueryState(users.key())?.isInvalidated).toBe(false)
    })

    it('should invalidate every form of the endpoint from `invalidates`', async () => {
      const { users } = declare()
      const createUser = ctx.client.mutation({
        method: 'POST',
        url: '/users',
        responseSchema: userSchema,
        invalidates: users,
      })

      const created = run(createUser, undefined)
      await flush()
      ctx.pending[0]!.resolve({ id: '2', name: 'Ada' })
      await created

      const cached = ctx.queryClient.getQueryCache().getAll()
      expect(cached.filter((query) => query.state.isInvalidated)).toHaveLength(6)
    })
  })

  describe('a Date among the inputs', () => {
    it('should be keyed by its value', () => {
      const events = ctx.client.query({
        method: 'GET',
        url: '/events',
        querySchema: z.object({ from: z.date(), page: z.number().optional() }),
        responseSchema: z.array(z.string()),
      })
      const first = new Date('2026-01-01T00:00:00.000Z')
      const second = new Date('2026-02-01T00:00:00.000Z')
      events.setData(ctx.queryClient, { params: { from: first, page: 1 } }, ['first'])
      events.setData(ctx.queryClient, { params: { from: second, page: 1 } }, ['second'])

      expect(events.key({ params: { from: first } })).toEqual([
        'GET',
        '/events',
        'query',
        { params: { from: '2026-01-01T00:00:00.000Z' } },
      ])
      expect(
        ctx.queryClient
          .getQueriesData({ queryKey: events.key({ params: { from: first } }) })
          .map(([, data]) => data),
      ).toEqual([['first']])
      expect(
        events.getData(ctx.queryClient, { params: { from: new Date(first), page: 1 } }),
      ).toEqual(['first'])
    })
  })

  describe('a signal in the args', () => {
    function declare() {
      const users = ctx.client.query({
        method: 'GET',
        url: '/users',
        querySchema,
        responseSchema: usersSchema,
      })
      const pages = ctx.client.infiniteQuery({
        method: 'GET',
        url: '/users',
        querySchema,
        responseSchema: usersSchema,
        getNextPageParam: () => undefined,
      })
      const shared = ctx.client.query({
        method: 'GET',
        url: '/users',
        querySchema,
        responseSchema: usersSchema,
        keyBy: { params: false },
      })
      return { users, pages, shared }
    }

    it.each(['users', 'pages', 'shared'] as const)(
      'should still abort the request of %s when the query is cancelled',
      async (name) => {
        const query = declare()[name]
        const own = new AbortController()

        const fetched = query.fetch(ctx.queryClient, { signal: own.signal }).catch(() => 'failed')
        await flush()
        await ctx.queryClient.cancelQueries({ queryKey: query.key() })

        expect(ctx.pending[0]!.config.signal?.aborted).toBe(true)
        expect(own.signal.aborted).toBe(false)
        await fetched
      },
    )

    it.each(['users', 'pages', 'shared'] as const)(
      'should abort the request of %s through the signal of the caller',
      async (name) => {
        const query = declare()[name]
        const own = new AbortController()

        const fetched = query.fetch(ctx.queryClient, { signal: own.signal }).catch(() => 'failed')
        await flush()
        own.abort()

        expect(ctx.pending[0]!.config.signal?.aborted).toBe(true)
        await expect(fetched).resolves.toBe('failed')
      },
    )
  })
})
