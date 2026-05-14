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
// queryFromEndpoint
// ============================================================================
//
// Note: URL-param extraction and the (urlParams × params × data × error)
// combination matrix are exercised at the builder layer. The tests below
// focus on `*FromEndpoint`-specific bits: that an `EndpointHandler` /
// `StreamHandler` can flow into a surface and that the resulting return
// shape, QueryHelpers attachment, and stream Blob handling are preserved.

describe('client.queryFromEndpoint() method', () => {
  test('queryFromEndpoint returns a callable producing UseSuspenseQueryOptions', () => {
    const query = client.queryFromEndpoint(getEndpoint)
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

  test('queryFromEndpoint preserves endpoint config metadata', () => {
    assertType<typeof responseSchema>(getEndpoint.config.responseSchema)
    assertType<'GET'>(getEndpoint.config.method)
    assertType<'/users'>(getEndpoint.config.url)
  })

  test('queryFromEndpoint attaches QueryHelpers, typed by querySchema when present', () => {
    const query = client.queryFromEndpoint(getEndpoint)
    assertType<QueryHelpers<'/users', undefined, ResponseType>['queryKey']>(query.queryKey)
    assertType<QueryHelpers<'/users', undefined, ResponseType>['use']>(query.use)
    assertType<QueryHelpers<'/users', undefined, ResponseType>['useSuspense']>(query.useSuspense)

    const queryWithQ = client.queryFromEndpoint(getEndpointWithQuery)
    assertType<QueryHelpers<'/users', typeof querySchema, ResponseType>['queryKey']>(
      queryWithQ.queryKey,
    )
  })

  test('processResponse receives the endpoint response type', () => {
    client.queryFromEndpoint(getEndpoint, {
      processResponse: (data) => {
        assertType<ResponseType>(data)
        return data.name.toUpperCase()
      },
    })
  })
})

// ============================================================================
// infiniteQueryFromEndpoint
// ============================================================================

describe('client.infiniteQueryFromEndpoint() method', () => {
  test('attaches QueryHelpers with isInfinite=true', () => {
    const query = client.infiniteQueryFromEndpoint(getEndpointWithQuery, {
      getNextPageParam: () => undefined,
    })

    assertType<QueryHelpers<'/users', typeof querySchema, ResponseType, true>['queryKey']>(
      query.queryKey,
    )
  })

  test('pagination callbacks receive page params typed by the endpoint querySchema', () => {
    client.infiniteQueryFromEndpoint(getEndpointWithQuery, {
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

  test('processResponse threads transformed page type through getNextPageParam', () => {
    client.infiniteQueryFromEndpoint(getEndpointWithQuery, {
      processResponse: (data) => {
        assertType<ResponseType>(data)
        return { items: [data], hasMore: true }
      },
      getNextPageParam: (lastPage) => {
        assertType<{ items: ResponseType[]; hasMore: boolean }>(lastPage)
        return lastPage.hasMore ? { page: 1, limit: 10 } : undefined
      },
    })
  })
})

// ============================================================================
// mutationFromEndpoint
// ============================================================================

describe('client.mutationFromEndpoint() method', () => {
  test('POST endpoint flows into mutate signature', () => {
    const mutation = client.mutationFromEndpoint(postEndpoint)
    const { mutate } = mutation()
    mutate({ data: { name: 'test', email: 'test@test.com' } })
  })

  test('POST endpoint with URL params requires urlParams on mutate', () => {
    const mutation = client.mutationFromEndpoint(postEndpointWithUrlParams)
    const { mutate } = mutation()
    mutate({
      urlParams: { userId: '123' },
      data: { name: 'test', email: 'test@test.com' },
    })
  })

  describe('stream endpoints', () => {
    test('StreamHandler flows into a mutation that resolves Blob', () => {
      const mutation = client.mutationFromEndpoint(streamEndpoint)
      const { mutate, data } = mutation()

      mutate({ urlParams: { fileId: '123' } })

      assertType<Blob | undefined>(data)
    })

    test('StreamHandler with requestSchema requires data on mutate', () => {
      const mutation = client.mutationFromEndpoint(streamEndpointWithRequest)
      const { mutate, data } = mutation()

      mutate({ data: { name: 'test', email: 'test@test.com' } })

      assertType<Blob | undefined>(data)
    })

    test('stream endpoint processResponse receives Blob', () => {
      client.mutationFromEndpoint(streamEndpoint, {
        processResponse: (data) => {
          assertType<Blob>(data)
          return { url: URL.createObjectURL(data) }
        },
      })
    })
  })

  test('callbacks receive endpoint-typed args (onMutate / onSuccess / onError / onSettled)', () => {
    client.mutationFromEndpoint(postEndpoint, {
      processResponse: (data) => data,
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

  test('processResponse receives only the success type when the endpoint has errorSchema', () => {
    client.mutationFromEndpoint(endpointWithErrors, {
      processResponse: (data) => {
        assertType<ResponseType>(data)
        return data
      },
    })
  })
})

// ============================================================================
// ERROR CASES - Surface-specific. Verifies that the `*FromEndpoint` wrapping
// preserves the same param-validation that the schema-driven surfaces enforce.
// ============================================================================

describe('fromEndpoint() error cases', () => {
  test('queryFromEndpoint with URL params - missing urlParams', () => {
    const query = client.queryFromEndpoint(getEndpointWithUrlParams)

    // @ts-expect-error - missing urlParams
    query({})
  })

  test('mutationFromEndpoint().mutate() without data is rejected', () => {
    const mutation = client.mutationFromEndpoint(postEndpoint)
    const { mutate } = mutation()

    // @ts-expect-error - missing data
    mutate({})
  })

  test('mutationFromEndpoint().mutate() wrong data shape is rejected', () => {
    const mutation = client.mutationFromEndpoint(postEndpoint)
    const { mutate } = mutation()

    // @ts-expect-error - wrong property names
    mutate({ data: { username: 'test', mail: 'test@test.com' } })
  })

  test('queryFromEndpoint processResponse rejects access to missing fields', () => {
    client.queryFromEndpoint(getEndpoint, {
      processResponse: (data) => {
        // @ts-expect-error - data doesn't have 'nonExistent' property
        return data.nonExistent
      },
    })
  })

  test('mutationFromEndpoint processResponse rejects access to missing fields', () => {
    client.mutationFromEndpoint(postEndpoint, {
      processResponse: (data) => {
        // @ts-expect-error - data doesn't have 'nonExistent' property
        return data.nonExistent
      },
    })
  })
})
