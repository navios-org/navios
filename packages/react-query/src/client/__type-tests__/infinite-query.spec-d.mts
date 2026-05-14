import { assertType, describe, test } from 'vitest'
import { z as zod } from 'zod/v4'

import type { ErrorSchemaRecord } from '@navios/builder'
import type { DataTag, InfiniteData, UseSuspenseInfiniteQueryOptions } from '@tanstack/react-query'
import type { z } from 'zod/v4'

import type { Split } from '../../common/types.mjs'
import type { QueryHelpers } from '../../query/types.mjs'
import type { ClientInstance, EndpointHelper } from '../types.mjs'

// ============================================================================
// TEST SCHEMAS
// ============================================================================

const responseSchema = zod.object({
  id: zod.string(),
  name: zod.string(),
})

const querySchema = zod.object({
  page: zod.number(),
  limit: zod.number(),
})

const requestSchema = zod.object({
  name: zod.string(),
  email: zod.string(),
})

const error400Schema = zod.object({ error: zod.string(), code: zod.number() })
const error404Schema = zod.object({ notFound: zod.literal(true) })

const errorSchema = {
  400: error400Schema,
  404: error404Schema,
} satisfies ErrorSchemaRecord

type ResponseType = z.output<typeof responseSchema>
type QueryType = z.input<typeof querySchema>
type RequestType = z.input<typeof requestSchema>

// ============================================================================
// CLIENT INSTANCE DECLARATIONS
// ============================================================================

declare const client: ClientInstance

// ============================================================================
// INFINITE QUERY METHOD
// ============================================================================
//
// Note: URL-param extraction, querySchema/requestSchema input typing, and the
// (urlParams × params × data × error) combination matrix are exercised at the
// builder layer. The tests below focus on infinite-query-specific bits: the
// `UseSuspenseInfiniteQueryOptions` shape including `InfiniteData`, the
// page-param typing on `getNextPageParam` / `getPreviousPageParam`, and that
// `QueryHelpers` is keyed with `isInfinite: true`.

describe('client.infiniteQuery() method', () => {
  test('basic GET infinite query wires InfiniteData + DataTag', () => {
    const query = client.infiniteQuery({
      method: 'GET',
      url: '/users',
      querySchema,
      responseSchema,
      getNextPageParam: () => undefined,
    })

    assertType<
      (params: {
        params: QueryType
      }) => UseSuspenseInfiniteQueryOptions<
        ResponseType,
        Error,
        InfiniteData<ResponseType>,
        DataTag<Split<'/users', '/'>, ResponseType, Error>,
        z.output<typeof querySchema>
      >
    >(query)

    assertType<QueryHelpers<'/users', typeof querySchema, ResponseType, true>['queryKey']>(
      query.queryKey,
    )
    assertType<QueryHelpers<'/users', typeof querySchema, ResponseType, true>['use']>(query.use)
    assertType<QueryHelpers<'/users', typeof querySchema, ResponseType, true>['useSuspense']>(
      query.useSuspense,
    )
    assertType<QueryHelpers<'/users', typeof querySchema, ResponseType, true>['invalidate']>(
      query.invalidate,
    )
    assertType<QueryHelpers<'/users', typeof querySchema, ResponseType, true>['invalidateAll']>(
      query.invalidateAll,
    )
  })

  test('errorSchema does not appear in the return type (errors thrown in data mode)', () => {
    const query = client.infiniteQuery({
      method: 'GET',
      url: '/users',
      querySchema,
      responseSchema,
      errorSchema,
      getNextPageParam: () => undefined,
    })

    assertType<
      (params: {
        params: QueryType
      }) => UseSuspenseInfiniteQueryOptions<
        ResponseType,
        Error,
        InfiniteData<ResponseType>,
        DataTag<Split<'/users', '/'>, ResponseType, Error>,
        z.output<typeof querySchema>
      >
    >(query)
  })

  test('POST infinite query (search) requires data', () => {
    const query = client.infiniteQuery({
      method: 'POST',
      url: '/search',
      querySchema,
      requestSchema,
      responseSchema,
      getNextPageParam: () => undefined,
    })

    assertType<
      (params: {
        params: QueryType
        data: RequestType
      }) => UseSuspenseInfiniteQueryOptions<
        ResponseType,
        Error,
        InfiniteData<ResponseType>,
        DataTag<Split<'/search', '/'>, ResponseType, Error>,
        z.output<typeof querySchema>
      >
    >(query)
  })

  describe('pagination callbacks', () => {
    test('getNextPageParam receives typed page, allPages, page params', () => {
      client.infiniteQuery({
        method: 'GET',
        url: '/users',
        querySchema,
        responseSchema,
        getNextPageParam: (lastPage, allPages, lastPageParam, allPageParams) => {
          assertType<ResponseType>(lastPage)
          assertType<ResponseType[]>(allPages)
          assertType<z.infer<typeof querySchema> | undefined>(lastPageParam)
          assertType<z.infer<typeof querySchema>[] | undefined>(allPageParams)
          return { page: 1, limit: 10 }
        },
      })
    })

    test('getPreviousPageParam receives typed page, allPages, page params', () => {
      client.infiniteQuery({
        method: 'GET',
        url: '/users',
        querySchema,
        responseSchema,
        getNextPageParam: () => undefined,
        getPreviousPageParam: (firstPage, allPages, lastPageParam, allPageParams) => {
          assertType<ResponseType>(firstPage)
          assertType<ResponseType[]>(allPages)
          assertType<z.infer<typeof querySchema> | undefined>(lastPageParam)
          assertType<z.infer<typeof querySchema>[] | undefined>(allPageParams)
          return { page: 0, limit: 10 }
        },
      })
    })
  })

  describe('EndpointHelper', () => {
    test('infinite query exposes endpoint property with declared config', () => {
      const query = client.infiniteQuery({
        method: 'GET',
        url: '/users',
        querySchema,
        responseSchema,
        getNextPageParam: () => undefined,
      })

      assertType<
        EndpointHelper<{
          method: 'GET'
          url: '/users'
          querySchema: typeof querySchema
          responseSchema: typeof responseSchema
        }>['endpoint']
      >(query.endpoint)
    })
  })
})

// ============================================================================
// ERROR CASES - Surface-specific
// ============================================================================

describe('infiniteQuery() error cases', () => {
  test('getNextPageParam must return a value compatible with the query schema', () => {
    client.infiniteQuery({
      method: 'GET',
      url: '/users',
      querySchema,
      responseSchema,
      // @ts-expect-error - return type doesn't match querySchema input
      getNextPageParam: () => ({ wrongKey: 'value' }),
    })
  })

  test('infinite query without params is rejected when querySchema is defined', () => {
    const query = client.infiniteQuery({
      method: 'GET',
      url: '/users',
      querySchema,
      responseSchema,
      getNextPageParam: () => undefined,
    })

    // @ts-expect-error - missing params
    query({})
  })
})
