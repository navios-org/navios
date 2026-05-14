import { assertType, describe, test } from 'vitest'
import { z as zod } from 'zod/v4'

import type { EndpointHandler, ErrorSchemaRecord, StreamHandler } from '@navios/builder'
import type { DataTag, UseSuspenseQueryOptions } from '@tanstack/react-query'
import type { z } from 'zod/v4'

import type { Split } from '../../index.mjs'
import type { QueryHelpers } from '../../query/types.mjs'
import type { ClientInstance } from '../types.mjs'

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
type RequestType = z.input<typeof requestSchema>

// ============================================================================
// CLIENT INSTANCE DECLARATIONS
// ============================================================================

declare const client: ClientInstance

// ============================================================================
// MOCK ENDPOINTS FOR TESTING - Using EndpointHandler / StreamHandler types
// ============================================================================

declare const getEndpoint: EndpointHandler<{
  method: 'GET'
  url: '/users'
  responseSchema: typeof responseSchema
}>

declare const getEndpointWithUrlParams: EndpointHandler<{
  method: 'GET'
  url: '/users/$userId'
  responseSchema: typeof responseSchema
}>

declare const getEndpointWithQuery: EndpointHandler<{
  method: 'GET'
  url: '/users'
  querySchema: typeof querySchema
  responseSchema: typeof responseSchema
}>

declare const postEndpoint: EndpointHandler<{
  method: 'POST'
  url: '/users'
  requestSchema: typeof requestSchema
  responseSchema: typeof responseSchema
}>

declare const postEndpointWithUrlParams: EndpointHandler<{
  method: 'POST'
  url: '/users/$userId/posts'
  requestSchema: typeof requestSchema
  responseSchema: typeof responseSchema
}>

declare const endpointWithErrors: EndpointHandler<{
  method: 'GET'
  url: '/users'
  responseSchema: typeof responseSchema
  errorSchema: typeof errorSchema
}>

declare const streamEndpoint: StreamHandler<{
  method: 'GET'
  url: '/files/$fileId/download'
}>

declare const streamEndpointWithRequest: StreamHandler<{
  method: 'POST'
  url: '/files/generate'
  requestSchema: typeof requestSchema
}>

// ============================================================================
// client.query() with an existing endpoint
// ============================================================================
//
// Note: URL-param extraction and the (urlParams × params × data × error)
// combination matrix are exercised at the builder layer. The tests below
// focus on the from-endpoint code path of each unified surface: that an
// `EndpointHandler` / `StreamHandler` can flow in and that the resulting
// return shape, QueryHelpers attachment, and stream Blob handling are
// preserved.

describe('client.query() with an existing endpoint', () => {
  test('returns a callable producing UseSuspenseQueryOptions', () => {
    const query = client.query(getEndpoint)
    const options = query({})
    assertType<
      UseSuspenseQueryOptions<
        ResponseType,
        Error,
        ResponseType,
        DataTag<Split<'/users', '/'>, ResponseType, Error>
      >
    >(options)
  })

  test('preserves endpoint config metadata', () => {
    assertType<typeof responseSchema>(getEndpoint.config.responseSchema)
    assertType<'GET'>(getEndpoint.config.method)
    assertType<'/users'>(getEndpoint.config.url)
  })

  test('attaches QueryHelpers, typed by querySchema when present', () => {
    const query = client.query(getEndpoint)
    assertType<QueryHelpers<'/users', undefined, ResponseType>['queryKey']>(query.queryKey)
    assertType<QueryHelpers<'/users', undefined, ResponseType>['use']>(query.use)
    assertType<QueryHelpers<'/users', undefined, ResponseType>['useSuspense']>(query.useSuspense)

    const queryWithQ = client.query(getEndpointWithQuery)
    assertType<QueryHelpers<'/users', typeof querySchema, ResponseType>['queryKey']>(
      queryWithQ.queryKey,
    )
  })
})

// ============================================================================
// client.infiniteQuery() with an existing endpoint
// ============================================================================

describe('client.infiniteQuery() with an existing endpoint', () => {
  test('attaches QueryHelpers with isInfinite=true', () => {
    const query = client.infiniteQuery(getEndpointWithQuery, {
      getNextPageParam: () => undefined,
    })

    assertType<QueryHelpers<'/users', typeof querySchema, ResponseType, true>['queryKey']>(
      query.queryKey,
    )
  })

  test('pagination callbacks receive page params typed by the endpoint querySchema', () => {
    client.infiniteQuery(getEndpointWithQuery, {
      getNextPageParam: (lastPage, allPages, lastPageParam, allPageParams) => {
        assertType<ResponseType>(lastPage)
        assertType<ResponseType[]>(allPages)
        assertType<z.infer<typeof querySchema> | undefined>(lastPageParam)
        assertType<z.infer<typeof querySchema>[] | undefined>(allPageParams)
        return { page: 1, limit: 10 }
      },
      getPreviousPageParam: (firstPage) => {
        assertType<ResponseType>(firstPage)
        return { page: 0, limit: 10 }
      },
    })
  })
})

// ============================================================================
// client.mutation() with an existing endpoint
// ============================================================================

describe('client.mutation() with an existing endpoint', () => {
  test('POST endpoint flows into mutate signature', () => {
    const mutation = client.mutation(postEndpoint)
    const { mutate } = mutation()
    mutate({ data: { name: 'test', email: 'test@test.com' } })
  })

  test('POST endpoint with URL params requires urlParams on mutate', () => {
    const mutation = client.mutation(postEndpointWithUrlParams)
    const { mutate } = mutation()
    mutate({
      urlParams: { userId: '123' },
      data: { name: 'test', email: 'test@test.com' },
    })
  })

  describe('stream endpoints', () => {
    test('StreamHandler flows into a mutation that resolves Blob', () => {
      const mutation = client.mutation(streamEndpoint)
      const { mutate, data } = mutation()

      mutate({ urlParams: { fileId: '123' } })

      assertType<Blob | undefined>(data)
    })

    test('StreamHandler with requestSchema requires data on mutate', () => {
      const mutation = client.mutation(streamEndpointWithRequest)
      const { mutate, data } = mutation()

      mutate({ data: { name: 'test', email: 'test@test.com' } })

      assertType<Blob | undefined>(data)
    })

    test('stream endpoint onSuccess receives Blob', () => {
      client.mutation(streamEndpoint, {
        onSuccess: (data) => {
          assertType<Blob>(data)
        },
      })
    })
  })

  test('callbacks receive endpoint-typed args (onMutate / onSuccess / onError / onSettled)', () => {
    client.mutation(postEndpoint, {
      onMutate: (variables, context) => {
        assertType<{ data: RequestType }>(variables)
        assertType<{ meta: Record<string, unknown> | undefined }>(context)
        return { previousData: [] }
      },
      onSuccess: (data, variables, context) => {
        assertType<ResponseType>(data)
        assertType<{ data: RequestType }>(variables)
        assertType<{ onMutateResult: unknown }>(context)
      },
      onError: (error, variables, context) => {
        assertType<Error>(error)
        assertType<{ data: RequestType }>(variables)
        assertType<{ onMutateResult: unknown }>(context)
      },
      onSettled: (data, error, variables, context) => {
        assertType<ResponseType | undefined>(data)
        assertType<Error | null>(error)
        assertType<{ data: RequestType }>(variables)
        assertType<{ onMutateResult: unknown }>(context)
      },
    })
  })

  test('onSuccess receives only the success type when the endpoint has errorSchema', () => {
    client.mutation(endpointWithErrors, {
      onSuccess: (data) => {
        assertType<ResponseType>(data)
      },
    })
  })
})

// ============================================================================
// ERROR CASES - Surface-specific. Verifies that the from-endpoint code path of
// each unified surface preserves the same param-validation that the inline
// config path enforces.
// ============================================================================

describe('from-endpoint code path: error cases', () => {
  test('query(endpoint) with URL params - missing urlParams', () => {
    const query = client.query(getEndpointWithUrlParams)

    // @ts-expect-error - missing urlParams
    query({})
  })

  test('mutation(endpoint)().mutate() without data is rejected', () => {
    const mutation = client.mutation(postEndpoint)
    const { mutate } = mutation()

    // @ts-expect-error - missing data
    mutate({})
  })

  test('mutation(endpoint)().mutate() wrong data shape is rejected', () => {
    const mutation = client.mutation(postEndpoint)
    const { mutate } = mutation()

    // @ts-expect-error - wrong property names
    mutate({ data: { username: 'test', mail: 'test@test.com' } })
  })
})
