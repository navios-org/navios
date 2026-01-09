import type {
  EndpointHandler,
  ErrorSchemaRecord,
  StreamHandler,
} from '@navios/builder'
import type { DataTag, UseSuspenseQueryOptions } from '@tanstack/react-query'
import type { z } from 'zod/v4'

import { assertType, describe, test } from 'vitest'
import { z as zod } from 'zod/v4'

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
const error500Schema = zod.object({ serverError: zod.string() })

const errorSchema = {
  400: error400Schema,
  404: error404Schema,
  500: error500Schema,
} satisfies ErrorSchemaRecord

type ResponseType = z.output<typeof responseSchema>
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
// MOCK ENDPOINTS FOR TESTING - Using EndpointHandler type from builder
// ============================================================================

// Regular endpoints using EndpointHandler
declare const getEndpoint: EndpointHandler<
  {
    method: 'GET'
    url: '/users'
    responseSchema: typeof responseSchema
  },
  false
>

declare const getEndpointWithUrlParams: EndpointHandler<
  {
    method: 'GET'
    url: '/users/$userId'
    responseSchema: typeof responseSchema
  },
  false
>

declare const getEndpointWithQuery: EndpointHandler<
  {
    method: 'GET'
    url: '/users'
    querySchema: typeof querySchema
    responseSchema: typeof responseSchema
  },
  false
>

declare const getEndpointWithUrlParamsAndQuery: EndpointHandler<
  {
    method: 'GET'
    url: '/users/$userId/posts'
    querySchema: typeof querySchema
    responseSchema: typeof responseSchema
  },
  false
>

declare const postEndpoint: EndpointHandler<
  {
    method: 'POST'
    url: '/users'
    requestSchema: typeof requestSchema
    responseSchema: typeof responseSchema
  },
  false
>

declare const postEndpointWithUrlParams: EndpointHandler<
  {
    method: 'POST'
    url: '/users/$userId/posts'
    requestSchema: typeof requestSchema
    responseSchema: typeof responseSchema
  },
  false
>

declare const endpointWithErrors: EndpointHandler<
  {
    method: 'GET'
    url: '/users'
    responseSchema: typeof responseSchema
    errorSchema: typeof errorSchema
  },
  false
>

// Stream endpoints for testing
declare const streamEndpoint: StreamHandler<
  {
    method: 'GET'
    url: '/files/$fileId/download'
  },
  false
>

declare const streamEndpointWithRequest: StreamHandler<
  {
    method: 'POST'
    url: '/files/generate'
    requestSchema: typeof requestSchema
  },
  false
>

// Discriminator mode endpoints
declare const endpointWithErrorsDiscriminator: EndpointHandler<
  {
    method: 'GET'
    url: '/users'
    responseSchema: typeof responseSchema
    errorSchema: typeof errorSchema
  },
  true
>

declare const infiniteEndpointWithErrors: EndpointHandler<
  {
    method: 'GET'
    url: '/users'
    querySchema: typeof querySchema
    responseSchema: typeof responseSchema
    errorSchema: typeof errorSchema
  },
  true
>

declare const mutationEndpointWithErrors: EndpointHandler<
  {
    method: 'POST'
    url: '/users'
    requestSchema: typeof requestSchema
    responseSchema: typeof responseSchema
    errorSchema: typeof errorSchema
  },
  true
>

// ============================================================================
// queryFromEndpoint - DEFAULT MODE (UseDiscriminator=false)
// ============================================================================

describe('ClientInstance<false> queryFromEndpoint() method', () => {
  describe('basic usage', () => {
    test('simple GET endpoint - result is callable with optional signal/headers only', () => {
      const query = client.queryFromEndpoint(getEndpoint)
      // Should NOT require params or data for simple GET endpoints
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

    test('endpoint type structure is correct', () => {
      // Verify the endpoint has the expected config structure
      assertType<typeof responseSchema>(getEndpoint.config.responseSchema)
      assertType<'GET'>(getEndpoint.config.method)
      assertType<'/users'>(getEndpoint.config.url)
    })

    test('GET endpoint with URL params requires urlParams', () => {
      const query = client.queryFromEndpoint(getEndpointWithUrlParams)
      // Should require urlParams
      query({ urlParams: { userId: '123' } })
    })

    test('GET endpoint with query schema requires params', () => {
      const query = client.queryFromEndpoint(getEndpointWithQuery)
      // Should require params
      query({ params: { page: 1, limit: 10 } })
    })

    test('GET endpoint with URL params and query requires both', () => {
      const query = client.queryFromEndpoint(getEndpointWithUrlParamsAndQuery)
      // Should require both urlParams and params
      query({
        urlParams: { userId: '123' },
        params: { page: 1, limit: 10 },
      })
    })
  })

  describe('QueryHelpers', () => {
    test('queryFromEndpoint has QueryHelpers attached', () => {
      const query = client.queryFromEndpoint(getEndpoint)

      // QueryHelpers are attached regardless of the params issue
      assertType<QueryHelpers<'/users', undefined, ResponseType>['queryKey']>(
        query.queryKey,
      )
      assertType<QueryHelpers<'/users', undefined, ResponseType>['use']>(
        query.use,
      )
      assertType<
        QueryHelpers<'/users', undefined, ResponseType>['useSuspense']
      >(query.useSuspense)
    })

    test('queryFromEndpoint with query schema has typed QueryHelpers', () => {
      const query = client.queryFromEndpoint(getEndpointWithQuery)

      assertType<
        QueryHelpers<'/users', typeof querySchema, ResponseType>['queryKey']
      >(query.queryKey)
    })
  })

  describe('processResponse option', () => {
    test('processResponse receives correct input type', () => {
      client.queryFromEndpoint(getEndpoint, {
        processResponse: (data) => {
          // data should be ResponseType
          assertType<ResponseType>(data)
          return data.name.toUpperCase()
        },
      })
    })
  })
})

// ============================================================================
// infiniteQueryFromEndpoint - DEFAULT MODE (UseDiscriminator=false)
// ============================================================================

describe('ClientInstance<false> infiniteQueryFromEndpoint() method', () => {
  describe('QueryHelpers for infinite', () => {
    test('infiniteQueryFromEndpoint has QueryHelpers with isInfinite=true', () => {
      const query = client.infiniteQueryFromEndpoint(getEndpointWithQuery, {
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
    })
  })

  describe('pagination callbacks', () => {
    test('getNextPageParam receives correct types', () => {
      client.infiniteQueryFromEndpoint(getEndpointWithQuery, {
        getNextPageParam: (
          lastPage,
          allPages,
          lastPageParam,
          allPageParams,
        ) => {
          assertType<ResponseType>(lastPage)
          assertType<ResponseType[]>(allPages)
          assertType<z.infer<typeof querySchema> | undefined>(lastPageParam)
          assertType<z.infer<typeof querySchema>[] | undefined>(allPageParams)
          return { page: 1, limit: 10 }
        },
      })
    })

    test('getPreviousPageParam receives correct types', () => {
      client.infiniteQueryFromEndpoint(getEndpointWithQuery, {
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
  })

  describe('processResponse option', () => {
    test('processResponse receives correct type', () => {
      client.infiniteQueryFromEndpoint(getEndpointWithQuery, {
        processResponse: (data) => {
          assertType<ResponseType>(data)
          return { items: [data], hasMore: true }
        },
        getNextPageParam: (lastPage) => {
          // lastPage should be the transformed type
          assertType<{ items: ResponseType[]; hasMore: boolean }>(lastPage)
          return lastPage.hasMore ? { page: 1, limit: 10 } : undefined
        },
      })
    })
  })
})

// ============================================================================
// mutationFromEndpoint - DEFAULT MODE (UseDiscriminator=false)
// ============================================================================

describe('ClientInstance<false> mutationFromEndpoint() method', () => {
  describe('regular endpoints', () => {
    test('POST endpoint returns mutation with correct mutate signature', () => {
      const mutation = client.mutationFromEndpoint(postEndpoint)

      const { mutate } = mutation()
      // Can call mutate with data
      mutate({ data: { name: 'test', email: 'test@test.com' } })
    })

    test('POST endpoint with URL params', () => {
      const mutation = client.mutationFromEndpoint(postEndpointWithUrlParams)

      const { mutate } = mutation()
      mutate({
        urlParams: { userId: '123' },
        data: { name: 'test', email: 'test@test.com' },
      })
    })

    test('mutationFromEndpoint with processResponse', () => {
      client.mutationFromEndpoint(postEndpoint, {
        processResponse: (data) => {
          assertType<ResponseType>(data)
          return { created: true, user: data }
        },
      })
    })
  })

  describe('stream endpoints', () => {
    test('stream endpoint returns Blob', () => {
      const mutation = client.mutationFromEndpoint(streamEndpoint)
      const { mutate, data } = mutation()

      // Should require urlParams for stream endpoint
      mutate({ urlParams: { fileId: '123' } })

      // Data should be Blob, not never
      assertType<Blob | undefined>(data)
    })

    test('stream endpoint with request schema', () => {
      const mutation = client.mutationFromEndpoint(streamEndpointWithRequest)
      const { mutate, data } = mutation()

      // Should require data for stream endpoint with requestSchema
      mutate({ data: { name: 'test', email: 'test@test.com' } })

      // Data should be Blob
      assertType<Blob | undefined>(data)
    })

    test('stream endpoint with processResponse', () => {
      client.mutationFromEndpoint(streamEndpoint, {
        processResponse: (data) => {
          // data should be Blob
          assertType<Blob>(data)
          return { url: URL.createObjectURL(data) }
        },
      })
    })
  })

  describe('callback options', () => {
    test('onMutate receives variables and context', () => {
      client.mutationFromEndpoint(postEndpoint, {
        onMutate: (variables, context) => {
          assertType<{ data: RequestType }>(variables)
          assertType<{ meta: Record<string, unknown> | undefined }>(context)
          return { previousData: [] }
        },
      })
    })

    test('onSuccess receives data, variables, and context', () => {
      client.mutationFromEndpoint(postEndpoint, {
        processResponse: (data) => data,
        onSuccess: (data, variables, context) => {
          assertType<ResponseType>(data)
          assertType<{ data: RequestType }>(variables)
          assertType<{ onMutateResult: unknown }>(context)
        },
      })
    })

    test('onError receives error, variables, and context', () => {
      client.mutationFromEndpoint(postEndpoint, {
        onError: (error, variables, context) => {
          assertType<Error>(error)
          assertType<{ data: RequestType }>(variables)
          assertType<{ onMutateResult: unknown }>(context)
        },
      })
    })

    test('onSettled receives data, error, variables, and context', () => {
      client.mutationFromEndpoint(postEndpoint, {
        processResponse: (data) => data,
        onSettled: (data, error, variables, context) => {
          assertType<ResponseType | undefined>(data)
          assertType<Error | null>(error)
          assertType<{ data: RequestType }>(variables)
          assertType<{ onMutateResult: unknown }>(context)
        },
      })
    })
  })

  describe('errorSchema (errors thrown)', () => {
    test('processResponse receives only success type when UseDiscriminator=false', () => {
      client.mutationFromEndpoint(endpointWithErrors, {
        processResponse: (data) => {
          // With UseDiscriminator=false, data should only be ResponseType
          assertType<ResponseType>(data)
          return data
        },
      })
    })
  })
})

// ============================================================================
// DISCRIMINATOR MODE (UseDiscriminator=true)
// ============================================================================

describe('ClientInstance<true> fromEndpoint methods (discriminator mode)', () => {
  describe('queryFromEndpoint with errorSchema includes union', () => {
    test('processResponse receives union type', () => {
      clientWithDiscriminator.queryFromEndpoint(
        endpointWithErrorsDiscriminator,
        {
          processResponse: (data) => {
            assertType<ResponseWithErrors>(data)
            return data
          },
        },
      )
    })
  })

  describe('infiniteQueryFromEndpoint with errorSchema', () => {
    test('getNextPageParam receives union type', () => {
      clientWithDiscriminator.infiniteQueryFromEndpoint(
        infiniteEndpointWithErrors,
        {
          getNextPageParam: (lastPage) => {
            assertType<ResponseWithErrors>(lastPage)
            return undefined
          },
        },
      )
    })
  })

  describe('mutationFromEndpoint with errorSchema', () => {
    test('processResponse receives union type', () => {
      clientWithDiscriminator.mutationFromEndpoint(mutationEndpointWithErrors, {
        processResponse: (data) => {
          assertType<ResponseWithErrors>(data)
          return data
        },
      })
    })
  })
})

// ============================================================================
// ERROR CASES - Should fail type checking
// ============================================================================

describe('fromEndpoint() error cases', () => {
  describe('queryFromEndpoint errors', () => {
    test('queryFromEndpoint with URL params - missing urlParams', () => {
      const query = client.queryFromEndpoint(getEndpointWithUrlParams)

      // @ts-expect-error - missing urlParams
      query({})
    })

    test('queryFromEndpoint with query schema - missing params', () => {
      const query = client.queryFromEndpoint(getEndpointWithQuery)

      // @ts-expect-error - missing params
      query({})
    })

    test('queryFromEndpoint with URL params and query - missing urlParams', () => {
      const query = client.queryFromEndpoint(getEndpointWithUrlParamsAndQuery)

      // @ts-expect-error - missing urlParams
      query({ params: { page: 1, limit: 10 } })
    })

    test('queryFromEndpoint with URL params and query - missing params', () => {
      const query = client.queryFromEndpoint(getEndpointWithUrlParamsAndQuery)

      // @ts-expect-error - missing params
      query({ urlParams: { userId: '123' } })
    })
  })

  describe('mutationFromEndpoint errors', () => {
    test('mutationFromEndpoint().mutate() missing data', () => {
      const mutation = client.mutationFromEndpoint(postEndpoint)
      const { mutate } = mutation()

      // @ts-expect-error - missing data
      mutate({})
    })

    test('mutationFromEndpoint().mutate() missing urlParams', () => {
      const mutation = client.mutationFromEndpoint(postEndpointWithUrlParams)
      const { mutate } = mutation()

      // @ts-expect-error - missing urlParams
      mutate({ data: { name: 'test', email: 'test@test.com' } })
    })

    test('mutationFromEndpoint().mutate() wrong data shape', () => {
      const mutation = client.mutationFromEndpoint(postEndpoint)
      const { mutate } = mutation()

      // @ts-expect-error - wrong property names
      mutate({ data: { username: 'test', mail: 'test@test.com' } })
    })
  })

  describe('processResponse type safety', () => {
    test('queryFromEndpoint processResponse receives correct type', () => {
      client.queryFromEndpoint(getEndpoint, {
        processResponse: (data) => {
          // @ts-expect-error - data doesn't have 'nonExistent' property
          return data.nonExistent
        },
      })
    })

    test('mutationFromEndpoint processResponse receives correct type', () => {
      client.mutationFromEndpoint(postEndpoint, {
        processResponse: (data) => {
          // @ts-expect-error - data doesn't have 'nonExistent' property
          return data.nonExistent
        },
      })
    })
  })
})
