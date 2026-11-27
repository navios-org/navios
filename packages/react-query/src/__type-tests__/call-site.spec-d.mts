import { builder } from '@navios/builder'
import { describe, expectTypeOf, test } from 'vitest'
import { z } from 'zod/v4'

import type { EndpointErrorType } from '@navios/builder'
import type { InfiniteData, MutationFunctionContext, QueryClient } from '@tanstack/react-query'

import { declareClient } from '../index.mjs'

import type { MutationHookOptions, PageParam } from '../index.mjs'

declare const queryClient: QueryClient

const api = builder()
const client = declareClient({ api })

const userSchema = z.object({ id: z.string(), name: z.string() })
type User = z.output<typeof userSchema>
const pageSchema = z.object({ items: z.array(userSchema), next: z.string().nullable() })
type Page = z.output<typeof pageSchema>

const feedEndpoint = api.declareEndpoint({
  method: 'GET',
  url: '/feed',
  querySchema: z.object({ role: z.string(), size: z.number(), cursor: z.string().optional() }),
  responseSchema: pageSchema,
})
type Query = { role: string; size: number; cursor?: string }

describe('page params of an infinite query', () => {
  test('getNextPageParam returns only what changes', () => {
    const feed = client.infiniteQuery(feedEndpoint, {
      getNextPageParam: (lastPage, _pages, lastParam, allParams) => {
        // The page param merged over the params of the call
        expectTypeOf(lastParam).toEqualTypeOf<Query>()
        expectTypeOf(allParams).toEqualTypeOf<Query[]>()
        return lastPage.next ? { cursor: lastPage.next } : undefined
      },
      getPreviousPageParam: () => ({ cursor: 'first' }),
      initialPageParam: { cursor: 'start' },
    })

    type Data = InfiniteData<Page, Partial<Query>>
    expectTypeOf(feed.use({ params: { role: 'admin', size: 10 } }).data).toEqualTypeOf<
      Data | undefined
    >()
    expectTypeOf(feed.getData(queryClient, { params: { role: 'admin', size: 10 } })).toEqualTypeOf<
      Data | undefined
    >()
    expectTypeOf<PageParam<typeof feedEndpoint.config>>().toEqualTypeOf<Query>()
  })

  test('the inline form takes the same, and still the whole query', () => {
    client.infiniteQuery({
      method: 'GET',
      url: '/feed',
      querySchema: z.object({ role: z.string(), page: z.number() }),
      responseSchema: pageSchema,
      getNextPageParam: (_lastPage, _pages, lastParam) => ({ page: lastParam.page + 1 }),
    })
    client.infiniteQuery(feedEndpoint, {
      getNextPageParam: (_lastPage, _pages, lastParam) => ({ ...lastParam, cursor: 'next' }),
    })
  })

  test('a page param is made of query params', () => {
    client.infiniteQuery(feedEndpoint, {
      // @ts-expect-error `page` is not a query param of the endpoint
      getNextPageParam: () => ({ page: 2 }),
    })
    client.infiniteQuery(feedEndpoint, {
      // @ts-expect-error `cursor` is a string
      getNextPageParam: () => ({ cursor: 2 }),
    })
  })
})

describe('invalidates', () => {
  const listUsers = client.query({ method: 'GET', url: '/users', responseSchema: z.any() })
  const feed = client.infiniteQuery(feedEndpoint, { getNextPageParam: () => undefined })

  test('takes one target or a list of them', () => {
    client.mutation({
      method: 'POST',
      url: '/users',
      responseSchema: userSchema,
      invalidates: feed,
    })
    client.mutation({
      method: 'POST',
      url: '/users',
      responseSchema: userSchema,
      invalidates: listUsers,
    })
    client.mutation({
      method: 'POST',
      url: '/users',
      responseSchema: userSchema,
      invalidates: (data) => {
        expectTypeOf(data).toEqualTypeOf<User>()
        return listUsers.key()
      },
    })
    client.mutation({
      method: 'POST',
      url: '/users',
      responseSchema: userSchema,
      invalidates: [listUsers, feed, () => undefined],
    })
  })

  test('refuses what is not a target', () => {
    // @ts-expect-error a key is not a target: return it from a function
    client.mutation({ method: 'POST', url: '/users', responseSchema: userSchema, invalidates: 1 })
  })
})

describe('options of a mutation hook', () => {
  const endpoint = api.declareEndpoint({
    method: 'PATCH',
    url: '/users/$userId',
    requestSchema: z.object({ name: z.string() }),
    responseSchema: userSchema,
    errorSchema: { 409: z.object({ reason: z.string() }) },
  })
  const updateUser = client.mutation(endpoint, { onMutate: () => ({ previous: 'name' }) })

  test('are optional', () => {
    expectTypeOf(updateUser).toBeCallableWith()
    expectTypeOf(updateUser({}).mutate).toEqualTypeOf(updateUser().mutate)
  })

  test('take callbacks typed from the endpoint', () => {
    updateUser({
      onSuccess: (data, variables, context) => {
        expectTypeOf(data).toEqualTypeOf<User>()
        expectTypeOf(variables.data).toEqualTypeOf<{ name: string }>()
        expectTypeOf(context).toExtend<MutationFunctionContext>()
        expectTypeOf(context.onMutateResult).toEqualTypeOf<{ previous: string } | undefined>()
      },
      onError: (error) => {
        expectTypeOf(error).toEqualTypeOf<EndpointErrorType<typeof endpoint>>()
      },
      onSettled: (data, error) => {
        expectTypeOf(data).toEqualTypeOf<User | undefined>()
        expectTypeOf(error).toEqualTypeOf<EndpointErrorType<typeof endpoint> | null>()
      },
      retry: (count, error) => error.kind === 'network' && count < 2,
      retryDelay: 100,
      networkMode: 'always',
      gcTime: 1000,
      meta: { source: 'form' },
      throwOnError: true,
    })
  })

  test('leave to the declaration what the mutation is', () => {
    // @ts-expect-error the mutation function is the endpoint
    updateUser({ mutationFn: async () => ({ id: '1', name: 'x' }) })
    // @ts-expect-error the key is the endpoint's
    updateUser({ mutationKey: ['x'] })
    // @ts-expect-error onMutate types the context of every callback
    updateUser({ onMutate: () => 1 })
    // @ts-expect-error declared once
    updateUser({ invalidates: [] })
  })

  test('are a named type', () => {
    type Options = MutationHookOptions<User, Error, { id: string }, undefined>
    expectTypeOf<Options['retry']>().toEqualTypeOf<
      boolean | number | ((failureCount: number, error: Error) => boolean) | undefined
    >()
  })
})
