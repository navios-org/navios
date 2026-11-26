import { builder } from '@navios/builder'
import { skipToken, useQueries } from '@tanstack/react-query'
import { describe, expectTypeOf, test } from 'vitest'
import { z } from 'zod/v4'

import type { QueryClient } from '@tanstack/react-query'

import { declareClient, makeQuery } from '../index.mjs'

import type { KeyBy } from '../index.mjs'

declare const queryClient: QueryClient

const api = builder()
const client = declareClient({ api })

const usersSchema = z.array(z.object({ id: z.string() }))

const searchEndpoint = api.declareEndpoint({
  method: 'GET',
  url: '/orgs/$orgId/users',
  querySchema: z.object({ q: z.string(), role: z.string(), sort: z.string().optional() }),
  responseSchema: usersSchema,
})

describe('keyBy', () => {
  test('names only the parts and fields of the endpoint', () => {
    client.query(searchEndpoint, { keyBy: { params: false } })
    client.query(searchEndpoint, { keyBy: { params: ['role', 'sort'] } })
    client.query(searchEndpoint, { keyBy: { urlParams: ['orgId'], params: true } })
    client.query(searchEndpoint, { keyBy: false })

    // @ts-expect-error - not a query param
    client.query(searchEndpoint, { keyBy: { params: ['nope'] } })
    // @ts-expect-error - the endpoint has no body
    client.query(searchEndpoint, { keyBy: { data: false } })

    client.query({
      method: 'POST',
      url: '/search',
      requestSchema: z.object({ q: z.string(), page: z.number() }),
      responseSchema: usersSchema,
      keyBy: { data: ['page'] },
    })
    // With two overloads TypeScript reports an inline mismatch on the first property.
    client.query({
      // @ts-expect-error - `page` is not a body field
      method: 'POST',
      url: '/search',
      requestSchema: z.object({ q: z.string() }),
      responseSchema: usersSchema,
      keyBy: { data: ['page'] },
    })

    expectTypeOf<KeyBy<typeof searchEndpoint.config>>().toExtend<
      false | { urlParams?: unknown; params?: unknown }
    >()
  })

  test('hooks and fetch take the shared inputs optionally', () => {
    const search = client.query(searchEndpoint, { keyBy: { params: false } })

    search.use({ urlParams: { orgId: 1 } })
    search.use({ urlParams: { orgId: 1 }, params: { q: 'ada', role: 'admin' } })
    search.use(skipToken)
    search.useSuspense({ urlParams: { orgId: 1 } })
    void search.fetch(queryClient, { urlParams: { orgId: 1 } })
    void search.prefetch(queryClient, { urlParams: { orgId: 1 }, params: { q: '', role: '' } })
    void search.ensure(queryClient, { urlParams: { orgId: 1 } })

    // @ts-expect-error - urlParams still identify the entry
    search.use()
    // @ts-expect-error - a param sent is checked against the schema
    search.use({ urlParams: { orgId: 1 }, params: { q: 1, role: 'admin' } })
  })

  test('a field list keeps the listed fields required and the others optional', () => {
    const search = client.query(searchEndpoint, { keyBy: { params: ['role'] } })

    search.use({ urlParams: { orgId: 1 }, params: { role: 'admin' } })
    search.use({ urlParams: { orgId: 1 }, params: { role: 'admin', q: 'ada' } })
    // @ts-expect-error - role identifies the entry
    search.use({ urlParams: { orgId: 1 }, params: { q: 'ada' } })

    expectTypeOf(search.key)
      .parameter(0)
      .toEqualTypeOf<
        { urlParams?: { orgId?: string | number }; params?: { role?: string } } | undefined
      >()
  })

  test('the options, key and cache helpers take only the inputs of the entry', () => {
    const search = client.query(searchEndpoint, { keyBy: { params: false } })

    search({ urlParams: { orgId: 1 } })
    search.key({ urlParams: { orgId: 1 } })
    search.getData(queryClient, { urlParams: { orgId: 1 } })
    search.setData(queryClient, { urlParams: { orgId: 1 } }, (current) => current)
    void search.invalidate(queryClient, { urlParams: { orgId: 1 } })
    useQueries({ queries: [search({ urlParams: { orgId: 1 } })] })

    // @ts-expect-error - options cannot send shared inputs
    search({ urlParams: { orgId: 1 }, params: { q: 'ada', role: 'admin' } })
    // @ts-expect-error - shared inputs do not address an entry
    search.key({ params: { q: 'ada' } })
    // @ts-expect-error - shared inputs do not address an entry
    search.getData(queryClient, { urlParams: { orgId: 1 }, params: { q: 'ada', role: '' } })
  })

  test('mutations invalidate and update a shared entry by its own inputs', () => {
    const search = client.query(searchEndpoint, { keyBy: { params: false } })

    client.mutation(
      api.declareEndpoint({
        method: 'POST',
        url: '/orgs/$orgId/users',
        requestSchema: z.object({ id: z.string() }),
        responseSchema: z.object({ id: z.string() }),
      }),
      {
        invalidates: [search],
        optimistic: (update) =>
          update(search, {
            args: (variables) => ({ urlParams: variables.urlParams }),
            update: (current, variables) => current && [...current, variables.data],
          }),
      },
    )
  })

  test('keyBy: false leaves every input out', () => {
    const search = client.query(searchEndpoint, { keyBy: false })

    search.use()
    search()
    expectTypeOf(search.key).parameter(0).toEqualTypeOf<{} | undefined>()
  })

  test('data and errors are the same as without keyBy', () => {
    const plain = client.query(searchEndpoint)
    const shared = client.query(searchEndpoint, { keyBy: { params: false } })

    const args = { urlParams: { orgId: 1 }, params: { q: '', role: '' } }
    const sharedResult = shared.use(args)
    const plainResult = plain.use(args)

    expectTypeOf(sharedResult.data).toEqualTypeOf(plainResult.data)
    expectTypeOf(sharedResult.error).toEqualTypeOf(plainResult.error)
    expectTypeOf(shared.useSuspense(args).data).toEqualTypeOf<{ id: string }[]>()
  })

  test('works with makeQuery', () => {
    const search = makeQuery(searchEndpoint, { keyBy: { params: false } })
    search.use({ urlParams: { orgId: 1 } })
    // @ts-expect-error - options cannot send shared inputs
    search({ urlParams: { orgId: 1 }, params: { q: 'ada', role: 'admin' } })
  })

  test('is not an option of infinite queries or mutations', () => {
    client.infiniteQuery(searchEndpoint, {
      getNextPageParam: () => undefined,
      // @ts-expect-error - infinite queries keep their params in the key
      keyBy: { params: false },
    })
    client.mutation(searchEndpoint, {
      // @ts-expect-error - a mutation key has no inputs
      keyBy: false,
    })
  })
})
