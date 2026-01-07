import type { ErrorSchemaRecord } from '@navios/builder'
import type {
  DataTag,
  UseSuspenseQueryOptions,
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
// QUERY METHOD - DEFAULT MODE (UseDiscriminator=false)
// ============================================================================

describe('ClientInstance<false> query() method', () => {
  describe('GET endpoints', () => {
    test('simple GET query without params', () => {
      const query = client.query({
        method: 'GET',
        url: '/users',
        responseSchema,
      })

      assertType<
        (params: {}) => UseSuspenseQueryOptions<
          ResponseType,
          Error,
          ResponseType,
          DataTag<Split<'/users', '/'>, ResponseType, Error>
        >
      >(query)

      assertType<QueryHelpers<'/users', undefined, ResponseType>['queryKey']>(
        query.queryKey,
      )
      assertType<QueryHelpers<'/users', undefined, ResponseType>['use']>(
        query.use,
      )
      assertType<
        QueryHelpers<'/users', undefined, ResponseType>['useSuspense']
      >(query.useSuspense)
      assertType<
        QueryHelpers<'/users', undefined, ResponseType>['invalidate']
      >(query.invalidate)
      assertType<
        QueryHelpers<'/users', undefined, ResponseType>['invalidateAll']
      >(query.invalidateAll)
    })

    test('GET query with single URL param', () => {
      const query = client.query({
        method: 'GET',
        url: '/users/$userId',
        responseSchema,
      })

      assertType<
        (params: {
          urlParams: { userId: string | number }
        }) => UseSuspenseQueryOptions<
          ResponseType,
          Error,
          ResponseType,
          DataTag<Split<'/users/$userId', '/'>, ResponseType, Error>
        >
      >(query)
    })

    test('GET query with multiple URL params', () => {
      const query = client.query({
        method: 'GET',
        url: '/orgs/$orgId/users/$userId',
        responseSchema,
      })

      assertType<
        (params: {
          urlParams: { orgId: string | number; userId: string | number }
        }) => UseSuspenseQueryOptions<
          ResponseType,
          Error,
          ResponseType,
          DataTag<Split<'/orgs/$orgId/users/$userId', '/'>, ResponseType, Error>
        >
      >(query)
    })

    test('GET query with query schema', () => {
      const query = client.query({
        method: 'GET',
        url: '/users',
        querySchema,
        responseSchema,
      })

      assertType<
        (params: {
          params: QueryType
        }) => UseSuspenseQueryOptions<
          ResponseType,
          Error,
          ResponseType,
          DataTag<Split<'/users', '/'>, ResponseType, Error>
        >
      >(query)

      assertType<
        QueryHelpers<'/users', typeof querySchema, ResponseType>['queryKey']
      >(query.queryKey)
    })

    test('GET query with URL params and query schema', () => {
      const query = client.query({
        method: 'GET',
        url: '/users/$userId/posts',
        querySchema,
        responseSchema,
      })

      assertType<
        (params: {
          urlParams: { userId: string | number }
          params: QueryType
        }) => UseSuspenseQueryOptions<
          ResponseType,
          Error,
          ResponseType,
          DataTag<Split<'/users/$userId/posts', '/'>, ResponseType, Error>
        >
      >(query)
    })

    test('GET query with processResponse transformation', () => {
      const query = client.query({
        method: 'GET',
        url: '/users',
        responseSchema,
        processResponse: (data) => data.name.toUpperCase(),
      })

      assertType<
        (params: {}) => UseSuspenseQueryOptions<
          string,
          Error,
          string,
          DataTag<Split<'/users', '/'>, string, Error>
        >
      >(query)
    })

    test('GET query with processResponse returning object', () => {
      // Note: processResponse infers const types, so we check the shape
      const query = client.query({
        method: 'GET',
        url: '/users',
        responseSchema,
        processResponse: (data): { processed: boolean; user: ResponseType } => ({
          processed: true,
          user: data,
        }),
      })

      assertType<
        (params: {}) => UseSuspenseQueryOptions<
          { processed: boolean; user: ResponseType },
          Error,
          { processed: boolean; user: ResponseType },
          DataTag<
            Split<'/users', '/'>,
            { processed: boolean; user: ResponseType },
            Error
          >
        >
      >(query)
    })

    test('GET query with errorSchema (errors thrown, not in return type)', () => {
      const query = client.query({
        method: 'GET',
        url: '/users',
        responseSchema,
        errorSchema,
      })

      // With UseDiscriminator=false, errors are thrown, not returned
      assertType<
        (params: {}) => UseSuspenseQueryOptions<
          ResponseType,
          Error,
          ResponseType,
          DataTag<Split<'/users', '/'>, ResponseType, Error>
        >
      >(query)
    })
  })

  describe('HEAD and OPTIONS endpoints', () => {
    test('HEAD query', () => {
      const query = client.query({
        method: 'HEAD',
        url: '/ping',
        responseSchema,
      })

      assertType<
        (params: {}) => UseSuspenseQueryOptions<
          ResponseType,
          Error,
          ResponseType,
          DataTag<Split<'/ping', '/'>, ResponseType, Error>
        >
      >(query)
    })

    test('OPTIONS query', () => {
      const query = client.query({
        method: 'OPTIONS',
        url: '/cors',
        responseSchema,
      })

      assertType<
        (params: {}) => UseSuspenseQueryOptions<
          ResponseType,
          Error,
          ResponseType,
          DataTag<Split<'/cors', '/'>, ResponseType, Error>
        >
      >(query)
    })
  })

  describe('POST query endpoints (for search)', () => {
    test('POST query with request schema', () => {
      const query = client.query({
        method: 'POST',
        url: '/search',
        requestSchema,
        responseSchema,
      })

      assertType<
        (params: {
          data: RequestType
        }) => UseSuspenseQueryOptions<
          ResponseType,
          Error,
          ResponseType,
          DataTag<Split<'/search', '/'>, ResponseType, Error>
        >
      >(query)
    })

    test('POST query with URL params and request schema', () => {
      const query = client.query({
        method: 'POST',
        url: '/users/$userId/search',
        requestSchema,
        responseSchema,
      })

      assertType<
        (params: {
          urlParams: { userId: string | number }
          data: RequestType
        }) => UseSuspenseQueryOptions<
          ResponseType,
          Error,
          ResponseType,
          DataTag<Split<'/users/$userId/search', '/'>, ResponseType, Error>
        >
      >(query)
    })

    test('POST query with all schemas', () => {
      const query = client.query({
        method: 'POST',
        url: '/search',
        querySchema,
        requestSchema,
        responseSchema,
      })

      assertType<
        (params: {
          params: QueryType
          data: RequestType
        }) => UseSuspenseQueryOptions<
          ResponseType,
          Error,
          ResponseType,
          DataTag<Split<'/search', '/'>, ResponseType, Error>
        >
      >(query)
    })

    test('POST query with URL params, query schema, and request schema', () => {
      const query = client.query({
        method: 'POST',
        url: '/orgs/$orgId/search',
        querySchema,
        requestSchema,
        responseSchema,
      })

      assertType<
        (params: {
          urlParams: { orgId: string | number }
          params: QueryType
          data: RequestType
        }) => UseSuspenseQueryOptions<
          ResponseType,
          Error,
          ResponseType,
          DataTag<Split<'/orgs/$orgId/search', '/'>, ResponseType, Error>
        >
      >(query)
    })
  })

  describe('EndpointHelper', () => {
    test('query exposes endpoint property', () => {
      const query = client.query({
        method: 'GET',
        url: '/users',
        responseSchema,
      })

      // EndpointHelper only includes properties that were actually provided
      // (no explicit undefined for missing optional properties)
      assertType<
        EndpointHelper<
          {
            method: 'GET'
            url: '/users'
            responseSchema: typeof responseSchema
          },
          false
        >['endpoint']
      >(query.endpoint)
    })

    test('query with all schemas exposes endpoint', () => {
      const query = client.query({
        method: 'POST',
        url: '/search',
        querySchema,
        requestSchema,
        responseSchema,
        errorSchema,
      })

      // EndpointHelper only includes properties that were actually provided
      assertType<
        EndpointHelper<
          {
            method: 'POST'
            url: '/search'
            querySchema: typeof querySchema
            requestSchema: typeof requestSchema
            responseSchema: typeof responseSchema
            errorSchema: typeof errorSchema
          },
          false
        >['endpoint']
      >(query.endpoint)
    })
  })
})

// ============================================================================
// QUERY METHOD - DISCRIMINATOR MODE (UseDiscriminator=true)
// ============================================================================

describe('ClientInstance<true> query() method (discriminator mode)', () => {
  describe('errorSchema includes error union in TData', () => {
    test('GET query with errorSchema returns union result type', () => {
      const query = clientWithDiscriminator.query({
        method: 'GET',
        url: '/users',
        responseSchema,
        errorSchema,
      })

      assertType<
        (params: {}) => UseSuspenseQueryOptions<
          ResponseWithErrors,
          Error,
          ResponseWithErrors,
          DataTag<Split<'/users', '/'>, ResponseWithErrors, Error>
        >
      >(query)
    })

    test('GET query with errorSchema and URL params returns union', () => {
      const query = clientWithDiscriminator.query({
        method: 'GET',
        url: '/users/$userId',
        responseSchema,
        errorSchema,
      })

      assertType<
        (params: {
          urlParams: { userId: string | number }
        }) => UseSuspenseQueryOptions<
          ResponseWithErrors,
          Error,
          ResponseWithErrors,
          DataTag<Split<'/users/$userId', '/'>, ResponseWithErrors, Error>
        >
      >(query)
    })

    test('GET query with errorSchema and query schema returns union', () => {
      const query = clientWithDiscriminator.query({
        method: 'GET',
        url: '/users',
        querySchema,
        responseSchema,
        errorSchema,
      })

      assertType<
        (params: {
          params: QueryType
        }) => UseSuspenseQueryOptions<
          ResponseWithErrors,
          Error,
          ResponseWithErrors,
          DataTag<Split<'/users', '/'>, ResponseWithErrors, Error>
        >
      >(query)
    })

    test('processResponse receives union type', () => {
      clientWithDiscriminator.query({
        method: 'GET',
        url: '/users',
        responseSchema,
        errorSchema,
        processResponse: (data) => {
          assertType<ResponseWithErrors>(data)
          return data
        },
      })
    })

    test('processResponse can transform union type', () => {
      // Note: This test verifies processResponse receives the union type
      // and can return a transformed type. The exact type assertion is
      // complex due to readonly inference, so we just verify the callback types.
      clientWithDiscriminator.query({
        method: 'GET',
        url: '/users',
        responseSchema,
        errorSchema,
        processResponse: (data): { handled: boolean; original: typeof data } => {
          assertType<ResponseWithErrors>(data)
          return { handled: true, original: data }
        },
      })
    })
  })

  describe('without errorSchema behaves same as default', () => {
    test('GET query without errorSchema returns only success type', () => {
      const query = clientWithDiscriminator.query({
        method: 'GET',
        url: '/users',
        responseSchema,
      })

      assertType<
        (params: {}) => UseSuspenseQueryOptions<
          ResponseType,
          Error,
          ResponseType,
          DataTag<Split<'/users', '/'>, ResponseType, Error>
        >
      >(query)
    })
  })
})

// ============================================================================
// ERROR CASES - Should fail type checking
// ============================================================================

describe('query() error cases', () => {
  describe('missing required parameters', () => {
    test('GET query without urlParams when URL has params', () => {
      const query = client.query({
        method: 'GET',
        url: '/users/$userId',
        responseSchema,
      })

      // @ts-expect-error - missing urlParams
      query({})
    })

    test('GET query without params when querySchema is defined', () => {
      const query = client.query({
        method: 'GET',
        url: '/users',
        querySchema,
        responseSchema,
      })

      // @ts-expect-error - missing params
      query({})
    })

    test('POST query without data when requestSchema is defined', () => {
      const query = client.query({
        method: 'POST',
        url: '/search',
        requestSchema,
        responseSchema,
      })

      // @ts-expect-error - missing data
      query({})
    })

    test('GET query with URL params - missing one param', () => {
      const query = client.query({
        method: 'GET',
        url: '/orgs/$orgId/users/$userId',
        responseSchema,
      })

      // @ts-expect-error - missing userId
      query({ urlParams: { orgId: '123' } })
    })

    test('POST query with all schemas - missing data', () => {
      const query = client.query({
        method: 'POST',
        url: '/search',
        querySchema,
        requestSchema,
        responseSchema,
      })

      // @ts-expect-error - missing data
      query({ params: { page: 1, limit: 10 } })
    })

    test('POST query with all schemas - missing params', () => {
      const query = client.query({
        method: 'POST',
        url: '/search',
        querySchema,
        requestSchema,
        responseSchema,
      })

      // @ts-expect-error - missing params
      query({ data: { name: 'test', email: 'test@test.com' } })
    })
  })

  describe('wrong parameter types', () => {
    test('urlParams with wrong type', () => {
      const query = client.query({
        method: 'GET',
        url: '/users/$userId',
        responseSchema,
      })

      // @ts-expect-error - userId should be string | number, not boolean
      query({ urlParams: { userId: true } })
    })

    test('params with wrong shape', () => {
      const query = client.query({
        method: 'GET',
        url: '/users',
        querySchema,
        responseSchema,
      })

      // @ts-expect-error - wrong property names
      query({ params: { offset: 0, count: 10 } })
    })

    test('params with wrong value types', () => {
      const query = client.query({
        method: 'GET',
        url: '/users',
        querySchema,
        responseSchema,
      })

      // @ts-expect-error - page should be number, not string
      query({ params: { page: '1', limit: 10 } })
    })

    test('data with wrong shape', () => {
      const query = client.query({
        method: 'POST',
        url: '/search',
        requestSchema,
        responseSchema,
      })

      // @ts-expect-error - wrong property names
      query({ data: { username: 'test', mail: 'test@test.com' } })
    })

    test('data with missing required fields', () => {
      const query = client.query({
        method: 'POST',
        url: '/search',
        requestSchema,
        responseSchema,
      })

      // @ts-expect-error - missing email
      query({ data: { name: 'test' } })
    })
  })

  describe('extra/unknown parameters', () => {
    test('extra urlParams should fail', () => {
      const query = client.query({
        method: 'GET',
        url: '/users/$userId',
        responseSchema,
      })

      // @ts-expect-error - extraParam not in URL
      query({ urlParams: { userId: '123', extraParam: 'invalid' } })
    })
  })

  describe('processResponse type safety', () => {
    test('processResponse receives correct input type', () => {
      client.query({
        method: 'GET',
        url: '/users',
        responseSchema,
        processResponse: (data) => {
          // @ts-expect-error - data doesn't have 'nonExistent' property
          return data.nonExistent
        },
      })
    })
  })
})
