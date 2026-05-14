import { assertType, describe, test } from 'vitest'
import { z as zod } from 'zod/v4'

import type { ErrorSchemaRecord } from '@navios/builder'
import type { DataTag, UseSuspenseQueryOptions } from '@tanstack/react-query'
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
// QUERY METHOD
// ============================================================================
//
// Note: URL-param extraction, querySchema/requestSchema input typing, and the
// (urlParams × params × data × error) combination matrix are exercised at the
// builder layer in `packages/builder/src/types/__type-tests__/builder-instance.spec-d.mts`.
// The tests below focus on surface-specific bits: query cache-key shape,
// QueryHelpers attachment, processResponse-driven return-type transformation,
// and that errors are thrown (not surfaced in the return type) in data mode.

describe('client.query() method', () => {
  test('simple GET query wires DataTag + QueryHelpers', () => {
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

    assertType<QueryHelpers<'/users', undefined, ResponseType>['queryKey']>(query.queryKey)
    assertType<QueryHelpers<'/users', undefined, ResponseType>['use']>(query.use)
    assertType<QueryHelpers<'/users', undefined, ResponseType>['useSuspense']>(query.useSuspense)
    assertType<QueryHelpers<'/users', undefined, ResponseType>['invalidate']>(query.invalidate)
    assertType<QueryHelpers<'/users', undefined, ResponseType>['invalidateAll']>(
      query.invalidateAll,
    )
  })

  test('GET query with query schema attaches typed QueryHelpers', () => {
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

    assertType<QueryHelpers<'/users', typeof querySchema, ResponseType>['queryKey']>(query.queryKey)
  })

  test('GET query with URL params propagates Split into DataTag', () => {
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

  test('processResponse transforms the returned data type', () => {
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

  test('errorSchema does not appear in the query return type (errors thrown in data mode)', () => {
    const query = client.query({
      method: 'GET',
      url: '/users',
      responseSchema,
      errorSchema,
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

  test('POST-as-query (search) accepts data', () => {
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

  describe('EndpointHelper', () => {
    test('query exposes endpoint property with declared config', () => {
      const query = client.query({
        method: 'GET',
        url: '/users',
        responseSchema,
      })

      assertType<
        EndpointHelper<{
          method: 'GET'
          url: '/users'
          responseSchema: typeof responseSchema
        }>['endpoint']
      >(query.endpoint)
    })
  })
})

// ============================================================================
// ERROR CASES - Surface-specific. The general missing/wrong-param matrix is in
// builder-instance.spec-d.mts; here we only assert that the query surface
// preserves those errors.
// ============================================================================

describe('query() error cases', () => {
  test('GET query without urlParams when URL has params', () => {
    const query = client.query({
      method: 'GET',
      url: '/users/$userId',
      responseSchema,
    })

    // @ts-expect-error - missing urlParams
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
