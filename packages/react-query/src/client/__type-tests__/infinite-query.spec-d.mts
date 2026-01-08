import type { ErrorSchemaRecord } from '@navios/builder'
import type {
  DataTag,
  InfiniteData,
  UseSuspenseInfiniteQueryOptions,
} from '@tanstack/react-query'
import type { z } from 'zod/v4'

import { assertType, describe, test } from 'vitest'
import { z as zod } from 'zod/v4'

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
const error500Schema = zod.object({ serverError: zod.string() })

const errorSchema = {
  400: error400Schema,
  404: error404Schema,
  500: error500Schema,
} satisfies ErrorSchemaRecord

type ResponseType = z.output<typeof responseSchema>
type QueryType = z.input<typeof querySchema>
type RequestType = z.input<typeof requestSchema>
type Error400 = z.output<typeof error400Schema>
type Error404 = z.output<typeof error404Schema>
type Error500 = z.output<typeof error500Schema>
type ErrorUnion = Error400 | Error404 | Error500
type ResponseWithErrors = ResponseType | ErrorUnion

// ============================================================================
// CLIENT INSTANCE DECLARATIONS
// ============================================================================

declare const client: ClientInstance<false>
declare const clientWithDiscriminator: ClientInstance<true>

// ============================================================================
// INFINITE QUERY METHOD - DEFAULT MODE (UseDiscriminator=false)
// ============================================================================

describe('ClientInstance<false> infiniteQuery() method', () => {
  describe('GET infinite queries', () => {
    test('basic GET infinite query', () => {
      const query = client.infiniteQuery({
        method: 'GET',
        url: '/users',
        querySchema,
        responseSchema,
        getNextPageParam: (_lastPage, _allPages, _lastPageParam, _allPageParams) =>
          undefined,
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

      // Should have QueryHelpers with isInfinite=true
      assertType<
        QueryHelpers<
          '/users',
          typeof querySchema,
          ResponseType,
          true
        >['queryKey']
      >(query.queryKey)
    })

    test('GET infinite query with URL params', () => {
      const query = client.infiniteQuery({
        method: 'GET',
        url: '/users/$userId/posts',
        querySchema,
        responseSchema,
        getNextPageParam: () => undefined,
      })

      assertType<
        (params: {
          urlParams: { userId: string | number }
          params: QueryType
        }) => UseSuspenseInfiniteQueryOptions<
          ResponseType,
          Error,
          InfiniteData<ResponseType>,
          DataTag<Split<'/users/$userId/posts', '/'>, ResponseType, Error>,
          z.output<typeof querySchema>
        >
      >(query)
    })

    test('GET infinite query with multiple URL params', () => {
      const query = client.infiniteQuery({
        method: 'GET',
        url: '/orgs/$orgId/users/$userId/posts',
        querySchema,
        responseSchema,
        getNextPageParam: () => undefined,
      })

      assertType<
        (params: {
          urlParams: { orgId: string | number; userId: string | number }
          params: QueryType
        }) => UseSuspenseInfiniteQueryOptions<
          ResponseType,
          Error,
          InfiniteData<ResponseType>,
          DataTag<
            Split<'/orgs/$orgId/users/$userId/posts', '/'>,
            ResponseType,
            Error
          >,
          z.output<typeof querySchema>
        >
      >(query)
    })

    test('GET infinite query with processResponse transformation', () => {
      const query = client.infiniteQuery({
        method: 'GET',
        url: '/users',
        querySchema,
        responseSchema,
        processResponse: (data) => ({ user: data, timestamp: Date.now() }),
        getNextPageParam: () => undefined,
      })

      type TransformedType = { user: ResponseType; timestamp: number }

      assertType<
        (params: {
          params: QueryType
        }) => UseSuspenseInfiniteQueryOptions<
          TransformedType,
          Error,
          InfiniteData<TransformedType>,
          DataTag<Split<'/users', '/'>, TransformedType, Error>,
          z.output<typeof querySchema>
        >
      >(query)
    })

    test('GET infinite query with errorSchema (errors thrown)', () => {
      const query = client.infiniteQuery({
        method: 'GET',
        url: '/users',
        querySchema,
        responseSchema,
        errorSchema,
        getNextPageParam: () => undefined,
      })

      // With UseDiscriminator=false, errors are thrown
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
  })

  describe('POST infinite queries', () => {
    test('POST infinite query with request schema', () => {
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

    test('POST infinite query with URL params and request schema', () => {
      const query = client.infiniteQuery({
        method: 'POST',
        url: '/users/$userId/search',
        querySchema,
        requestSchema,
        responseSchema,
        getNextPageParam: () => undefined,
      })

      assertType<
        (params: {
          urlParams: { userId: string | number }
          params: QueryType
          data: RequestType
        }) => UseSuspenseInfiniteQueryOptions<
          ResponseType,
          Error,
          InfiniteData<ResponseType>,
          DataTag<Split<'/users/$userId/search', '/'>, ResponseType, Error>,
          z.output<typeof querySchema>
        >
      >(query)
    })
  })

  describe('pagination callbacks', () => {
    test('getNextPageParam receives correct types', () => {
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

    test('getPreviousPageParam receives correct types', () => {
      client.infiniteQuery({
        method: 'GET',
        url: '/users',
        querySchema,
        responseSchema,
        getNextPageParam: () => undefined,
        getPreviousPageParam: (
          firstPage,
          allPages,
          lastPageParam,
          allPageParams,
        ) => {
          assertType<ResponseType>(firstPage)
          assertType<ResponseType[]>(allPages)
          assertType<z.infer<typeof querySchema> | undefined>(lastPageParam)
          assertType<z.infer<typeof querySchema>[] | undefined>(allPageParams)
          return { page: 0, limit: 10 }
        },
      })
    })

    test('pagination callbacks with transformed page result', () => {
      type TransformedPage = { items: ResponseType[]; hasMore: boolean }

      client.infiniteQuery({
        method: 'GET',
        url: '/users',
        querySchema,
        responseSchema,
        processResponse: (data): TransformedPage => ({
          items: [data],
          hasMore: true,
        }),
        getNextPageParam: (lastPage, allPages) => {
          assertType<TransformedPage>(lastPage)
          assertType<TransformedPage[]>(allPages)
          return lastPage.hasMore ? { page: 1, limit: 10 } : undefined
        },
      })
    })
  })

  describe('QueryHelpers', () => {
    test('infinite query has QueryHelpers with isInfinite=true', () => {
      const query = client.infiniteQuery({
        method: 'GET',
        url: '/users',
        querySchema,
        responseSchema,
        getNextPageParam: () => undefined,
      })

      assertType<
        QueryHelpers<
          '/users',
          typeof querySchema,
          ResponseType,
          true
        >['queryKey']
      >(query.queryKey)
      assertType<
        QueryHelpers<'/users', typeof querySchema, ResponseType, true>['use']
      >(query.use)
      assertType<
        QueryHelpers<
          '/users',
          typeof querySchema,
          ResponseType,
          true
        >['useSuspense']
      >(query.useSuspense)
      assertType<
        QueryHelpers<
          '/users',
          typeof querySchema,
          ResponseType,
          true
        >['invalidate']
      >(query.invalidate)
      assertType<
        QueryHelpers<
          '/users',
          typeof querySchema,
          ResponseType,
          true
        >['invalidateAll']
      >(query.invalidateAll)
    })
  })

  describe('EndpointHelper', () => {
    test('infinite query exposes endpoint property', () => {
      const query = client.infiniteQuery({
        method: 'GET',
        url: '/users',
        querySchema,
        responseSchema,
        getNextPageParam: () => undefined,
      })

      assertType<
        EndpointHelper<
          {
            method: 'GET'
            url: '/users'
            querySchema: typeof querySchema
            requestSchema: undefined
            responseSchema: typeof responseSchema
            errorSchema: undefined
            urlParamsSchema: undefined
          },
          false
        >['endpoint']
      >(query.endpoint)
    })
  })
})

// ============================================================================
// INFINITE QUERY METHOD - DISCRIMINATOR MODE (UseDiscriminator=true)
// ============================================================================

describe('ClientInstance<true> infiniteQuery() method (discriminator mode)', () => {
  describe('errorSchema includes error union in PageResult', () => {
    test('infinite query returns union PageResult', () => {
      const query = clientWithDiscriminator.infiniteQuery({
        method: 'GET',
        url: '/users',
        querySchema,
        responseSchema,
        errorSchema,
        getNextPageParam: (lastPage) => {
          assertType<ResponseWithErrors>(lastPage)
          return undefined
        },
      })

      assertType<
        (params: {
          params: QueryType
        }) => UseSuspenseInfiniteQueryOptions<
          ResponseWithErrors,
          Error,
          InfiniteData<ResponseWithErrors>,
          DataTag<Split<'/users', '/'>, ResponseWithErrors, Error>,
          z.output<typeof querySchema>
        >
      >(query)
    })

    test('processResponse receives union type', () => {
      clientWithDiscriminator.infiniteQuery({
        method: 'GET',
        url: '/users',
        querySchema,
        responseSchema,
        errorSchema,
        processResponse: (data) => {
          assertType<ResponseWithErrors>(data)
          return data
        },
        getNextPageParam: () => undefined,
      })
    })

    test('processResponse can transform union type', () => {
      type ExpectedResult =
        | { ok: false; error: ErrorUnion }
        | { ok: true; data: ResponseType }

      const query = clientWithDiscriminator.infiniteQuery({
        method: 'GET',
        url: '/users',
        querySchema,
        responseSchema,
        errorSchema,
        processResponse: (data): ExpectedResult => {
          // Use 'id' property to discriminate - only ResponseType has 'id'
          if ('id' in data) {
            return { ok: true, data }
          }
          return { ok: false, error: data }
        },
        getNextPageParam: (lastPage) => {
          if (!lastPage.ok) return undefined
          return { page: 1, limit: 10 }
        },
      })

      assertType<
        (params: {
          params: QueryType
        }) => UseSuspenseInfiniteQueryOptions<
          ExpectedResult,
          Error,
          InfiniteData<ExpectedResult>,
          DataTag<Split<'/users', '/'>, ExpectedResult, Error>,
          z.output<typeof querySchema>
        >
      >(query)
    })

    test('getNextPageParam receives union type', () => {
      clientWithDiscriminator.infiniteQuery({
        method: 'GET',
        url: '/users',
        querySchema,
        responseSchema,
        errorSchema,
        getNextPageParam: (lastPage, allPages) => {
          assertType<ResponseWithErrors>(lastPage)
          assertType<ResponseWithErrors[]>(allPages)
          return undefined
        },
      })
    })
  })

  describe('without errorSchema behaves same as default', () => {
    test('infinite query without errorSchema returns only success type', () => {
      const query = clientWithDiscriminator.infiniteQuery({
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
    })
  })
})

// ============================================================================
// ERROR CASES - Should fail type checking
// ============================================================================

describe('infiniteQuery() error cases', () => {
  describe('missing required parameters', () => {
    test('infinite query without params when querySchema is defined', () => {
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

    test('infinite query without urlParams when URL has params', () => {
      const query = client.infiniteQuery({
        method: 'GET',
        url: '/users/$userId/posts',
        querySchema,
        responseSchema,
        getNextPageParam: () => undefined,
      })

      // @ts-expect-error - missing urlParams
      query({ params: { page: 1, limit: 10 } })
    })

    test('POST infinite query without data when requestSchema is defined', () => {
      const query = client.infiniteQuery({
        method: 'POST',
        url: '/search',
        querySchema,
        requestSchema,
        responseSchema,
        getNextPageParam: () => undefined,
      })

      // @ts-expect-error - missing data
      query({ params: { page: 1, limit: 10 } })
    })
  })

  describe('wrong parameter types', () => {
    test('params with wrong shape', () => {
      const query = client.infiniteQuery({
        method: 'GET',
        url: '/users',
        querySchema,
        responseSchema,
        getNextPageParam: () => undefined,
      })

      // @ts-expect-error - wrong property names
      query({ params: { offset: 0, count: 10 } })
    })

    test('params with wrong value types', () => {
      const query = client.infiniteQuery({
        method: 'GET',
        url: '/users',
        querySchema,
        responseSchema,
        getNextPageParam: () => undefined,
      })

      // @ts-expect-error - page should be number, not string
      query({ params: { page: '1', limit: 10 } })
    })

    test('urlParams with wrong type', () => {
      const query = client.infiniteQuery({
        method: 'GET',
        url: '/users/$userId/posts',
        querySchema,
        responseSchema,
        getNextPageParam: () => undefined,
      })

      // @ts-expect-error - userId should be string | number, not boolean
      query({ urlParams: { userId: true }, params: { page: 1, limit: 10 } })
    })

    test('data with wrong shape', () => {
      const query = client.infiniteQuery({
        method: 'POST',
        url: '/search',
        querySchema,
        requestSchema,
        responseSchema,
        getNextPageParam: () => undefined,
      })

      query({
        params: { page: 1, limit: 10 },
        data: {
          // @ts-expect-error - wrong property names
          username: 'test',
          mail: 'test@test.com',
        },
      })
    })
  })

  describe('getNextPageParam return type', () => {
    test('getNextPageParam must return compatible type', () => {
      client.infiniteQuery({
        method: 'GET',
        url: '/users',
        querySchema,
        responseSchema,
        // @ts-expect-error - return type doesn't match querySchema input
        getNextPageParam: () => ({ wrongKey: 'value' }),
      })
    })
  })

  describe('processResponse type safety', () => {
    test('processResponse receives correct input type', () => {
      client.infiniteQuery({
        method: 'GET',
        url: '/users',
        querySchema,
        responseSchema,
        processResponse: (data) => {
          // @ts-expect-error - data doesn't have 'nonExistent' property
          return data.nonExistent
        },
        getNextPageParam: () => undefined,
      })
    })
  })
})
