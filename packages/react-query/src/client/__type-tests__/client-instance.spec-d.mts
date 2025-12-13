import type {
  DataTag,
  InfiniteData,
  UseMutationResult,
  UseSuspenseInfiniteQueryOptions,
  UseSuspenseQueryOptions,
} from '@tanstack/react-query'
import type { z } from 'zod/v4'

import { assertType, describe, test } from 'vitest'
import { z as zod } from 'zod/v4'

import type { ClientInstance, StreamHelper } from '../types.mjs'
import type { QueryHelpers } from '../../query/types.mjs'
import type { MutationHelpers } from '../../mutation/types.mjs'
import type { EndpointHelper } from '../types.mjs'
import type { Split } from '../../common/types.mjs'
import type { BaseStreamConfig } from '@navios/builder'

declare const client: ClientInstance

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

type ResponseType = z.output<typeof responseSchema>
type QueryType = z.input<typeof querySchema>
type RequestType = z.input<typeof requestSchema>

describe('ClientInstance', () => {
  describe('query() method', () => {
    describe('GET endpoints', () => {
      test('simple GET query without params', () => {
        const query = client.query({
          method: 'GET',
          url: '/users',
          responseSchema,
        })

        // Return type should be callable returning UseSuspenseQueryOptions
        assertType<
          (params: {}) => UseSuspenseQueryOptions<
            ResponseType,
            Error,
            ResponseType,
            DataTag<Split<'/users', '/'>, ResponseType, Error>
          >
        >(query)

        // Should have QueryHelpers
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

        // Should have EndpointHelper
        assertType<
          EndpointHelper<
            'GET',
            '/users',
            undefined,
            typeof responseSchema
          >['endpoint']
        >(query.endpoint)
      })

      test('GET query with URL params', () => {
        const query = client.query({
          method: 'GET',
          url: '/users/$userId',
          responseSchema,
        })

        // Should require urlParams
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

      test('GET query with query schema', () => {
        const query = client.query({
          method: 'GET',
          url: '/users',
          querySchema,
          responseSchema,
        })

        // Should require params
        assertType<
          (params: { params: QueryType }) => UseSuspenseQueryOptions<
            ResponseType,
            Error,
            ResponseType,
            DataTag<Split<'/users', '/'>, ResponseType, Error>
          >
        >(query)

        // Should have QueryHelpers with query schema
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

        // Should require both urlParams and params
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

        // Result type should be string (transformed)
        assertType<
          (params: {}) => UseSuspenseQueryOptions<
            string,
            Error,
            string,
            DataTag<Split<'/users', '/'>, string, Error>
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

        // Should require data
        assertType<
          (params: { data: RequestType }) => UseSuspenseQueryOptions<
            ResponseType,
            Error,
            ResponseType,
            DataTag<Split<'/search', '/'>, ResponseType, Error>
          >
        >(query)

        // Should have EndpointHelper with request schema
        assertType<
          EndpointHelper<
            'POST',
            '/search',
            typeof requestSchema,
            typeof responseSchema
          >['endpoint']
        >(query.endpoint)
      })

      test('POST query with URL params and request schema', () => {
        const query = client.query({
          method: 'POST',
          url: '/users/$userId/search',
          requestSchema,
          responseSchema,
        })

        // Should require urlParams and data
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

        // Should require params and data
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
    })
  })

  describe('infiniteQuery() method', () => {
    test('GET infinite query', () => {
      const query = client.infiniteQuery({
        method: 'GET',
        url: '/users',
        querySchema,
        responseSchema,
        getNextPageParam: (lastPage, allPages, lastPageParam, allPageParams) =>
          undefined,
      })

      // Should return UseSuspenseInfiniteQueryOptions
      assertType<
        (params: { params: QueryType }) => UseSuspenseInfiniteQueryOptions<
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

      // Should require urlParams and params
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

    test('POST infinite query', () => {
      const query = client.infiniteQuery({
        method: 'POST',
        url: '/search',
        querySchema,
        requestSchema,
        responseSchema,
        getNextPageParam: () => undefined,
      })

      // Should require params and data
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
  })

  describe('mutation() method', () => {
    describe('POST/PUT/PATCH mutations', () => {
      test('POST mutation with request schema only', () => {
        const mutation = client.mutation({
          method: 'POST',
          url: '/users',
          requestSchema,
          responseSchema,
          processResponse: (data) => data,
        })

        // Should return a function that returns UseMutationResult
        assertType<
          () => UseMutationResult<
            ResponseType,
            Error,
            { data: RequestType }
          >
        >(mutation)

        // Should have MutationHelpers
        assertType<MutationHelpers<'/users', ResponseType>['mutationKey']>(
          mutation.mutationKey,
        )
        assertType<MutationHelpers<'/users', ResponseType>['useIsMutating']>(
          mutation.useIsMutating,
        )

        // Should have EndpointHelper
        assertType<
          EndpointHelper<
            'POST',
            '/users',
            typeof requestSchema,
            typeof responseSchema
          >['endpoint']
        >(mutation.endpoint)
      })

      test('POST mutation with useKey', () => {
        const mutation = client.mutation({
          method: 'POST',
          url: '/users/$userId',
          useKey: true,
          requestSchema,
          responseSchema,
          processResponse: (data) => data,
        })

        // With useKey, should require urlParams in the call
        assertType<
          (params: {
            urlParams: { userId: string | number }
          }) => UseMutationResult<
            ResponseType,
            Error,
            { urlParams: { userId: string | number }; data: RequestType }
          >
        >(mutation)
      })

      test('PUT mutation with URL params', () => {
        const mutation = client.mutation({
          method: 'PUT',
          url: '/users/$userId',
          requestSchema,
          responseSchema,
          processResponse: (data) => data,
        })

        // Without useKey, should return hook directly
        assertType<
          () => UseMutationResult<
            ResponseType,
            Error,
            { urlParams: { userId: string | number }; data: RequestType }
          >
        >(mutation)
      })

      test('PATCH mutation with query schema', () => {
        const mutation = client.mutation({
          method: 'PATCH',
          url: '/users/$userId',
          requestSchema,
          querySchema,
          responseSchema,
          processResponse: (data) => data,
        })

        // Should include params in variables
        assertType<
          () => UseMutationResult<
            ResponseType,
            Error,
            {
              urlParams: { userId: string | number }
              data: RequestType
              params: QueryType
            }
          >
        >(mutation)
      })

      test('mutation with custom result type', () => {
        const mutation = client.mutation({
          method: 'POST',
          url: '/users',
          requestSchema,
          responseSchema,
          processResponse: (data) => ({ processed: true, name: data.name }),
        })

        // Result type should be the transformed type
        assertType<
          () => UseMutationResult<
            { processed: boolean; name: string },
            Error,
            { data: RequestType }
          >
        >(mutation)
      })
    })

    describe('DELETE mutations', () => {
      test('DELETE mutation without schemas', () => {
        const mutation = client.mutation({
          method: 'DELETE',
          url: '/users/$userId',
          responseSchema,
          processResponse: (data) => data,
        })

        assertType<
          () => UseMutationResult<
            ResponseType,
            Error,
            { urlParams: { userId: string | number } }
          >
        >(mutation)
      })

      test('DELETE mutation with useKey and URL params and querySchema', () => {
        const mutation = client.mutation({
          method: 'DELETE',
          url: '/users/$userId',
          useKey: true,
          querySchema,
          responseSchema,
          processResponse: (data) => data,
        })

        // With useKey and URL params, should require urlParams in the call
        assertType<
          (params: {
            urlParams: { userId: string | number }
          }) => UseMutationResult<
            ResponseType,
            Error,
            { urlParams: { userId: string | number }; params: QueryType }
          >
        >(mutation)
      })

      test('DELETE mutation with useKey and URL params (no querySchema)', () => {
        const mutation = client.mutation({
          method: 'DELETE',
          url: '/users/$userId',
          useKey: true,
          responseSchema,
          processResponse: (data) => data,
        })

        // With useKey and URL params, should require urlParams in the call
        assertType<
          (params: {
            urlParams: { userId: string | number }
          }) => UseMutationResult<
            ResponseType,
            Error,
            { urlParams: { userId: string | number } }
          >
        >(mutation)
      })

      test('DELETE mutation with useKey without URL params', () => {
        const mutation = client.mutation({
          method: 'DELETE',
          url: '/cache',
          useKey: true,
          responseSchema,
          processResponse: (data) => data,
        })

        // With useKey but no URL params, should require empty params
        assertType<
          (params: {}) => UseMutationResult<ResponseType, Error, {}>
        >(mutation)
      })

      test('DELETE mutation with query schema', () => {
        const mutation = client.mutation({
          method: 'DELETE',
          url: '/cache',
          querySchema,
          responseSchema,
          processResponse: (data) => data,
        })

        assertType<
          () => UseMutationResult<
            ResponseType,
            Error,
            { params: QueryType }
          >
        >(mutation)
      })
    })
  })

  describe('multipartMutation() method', () => {
    test('multipart mutation with request schema', () => {
      const mutation = client.multipartMutation({
        method: 'POST',
        url: '/upload',
        requestSchema,
        responseSchema,
        processResponse: (data) => data,
      })

      assertType<
        () => UseMutationResult<ResponseType, Error, { data: RequestType }>
      >(mutation)
    })

    test('multipart mutation with useKey', () => {
      const mutation = client.multipartMutation({
        method: 'POST',
        url: '/users/$userId/avatar',
        useKey: true,
        requestSchema,
        responseSchema,
        processResponse: (data) => data,
      })

      assertType<
        (params: {
          urlParams: { userId: string | number }
        }) => UseMutationResult<
          ResponseType,
          Error,
          { urlParams: { userId: string | number }; data: RequestType }
        >
      >(mutation)
    })

    test('multipart mutation with query schema', () => {
      const mutation = client.multipartMutation({
        method: 'POST',
        url: '/upload',
        requestSchema,
        querySchema,
        responseSchema,
        processResponse: (data) => data,
      })

      assertType<
        () => UseMutationResult<
          ResponseType,
          Error,
          { data: RequestType; params: QueryType }
        >
      >(mutation)
    })
  })
})

// Stream endpoint type declarations for testing
declare const streamEndpointGet: {
  config: BaseStreamConfig<'GET', '/files/$fileId/download', undefined, undefined>
} & ((params: { urlParams: { fileId: string | number } }) => Promise<Blob>)

declare const streamEndpointGetWithQuery: {
  config: BaseStreamConfig<
    'GET',
    '/files/$fileId/download',
    typeof querySchema,
    undefined
  >
} & ((params: {
  urlParams: { fileId: string | number }
  params: z.input<typeof querySchema>
}) => Promise<Blob>)

declare const streamEndpointPost: {
  config: BaseStreamConfig<
    'POST',
    '/files/$fileId/export',
    undefined,
    typeof requestSchema
  >
} & ((params: {
  urlParams: { fileId: string | number }
  data: z.input<typeof requestSchema>
}) => Promise<Blob>)

describe('mutationFromEndpoint() with stream endpoints', () => {
  test('GET stream mutation without options (returns Blob)', () => {
    const mutation = client.mutationFromEndpoint(streamEndpointGet)

    // Should return a function that returns UseMutationResult with Blob
    assertType<
      () => UseMutationResult<Blob, Error, { urlParams: { fileId: string | number } }>
    >(mutation)

    // Should have StreamHelper
    assertType<
      StreamHelper<'GET', '/files/$fileId/download', undefined, undefined>['endpoint']
    >(mutation.endpoint)
  })

  test('GET stream mutation with processResponse transformation', () => {
    const mutation = client.mutationFromEndpoint(streamEndpointGet, {
      processResponse: (blob) => URL.createObjectURL(blob),
    })

    // Result type should be string (transformed)
    assertType<
      () => UseMutationResult<
        string,
        Error,
        { urlParams: { fileId: string | number } }
      >
    >(mutation)
  })

  test('GET stream mutation with useKey', () => {
    const mutation = client.mutationFromEndpoint(streamEndpointGet, {
      useKey: true,
    })

    // With useKey, should require urlParams in the call
    assertType<
      (params: {
        urlParams: { fileId: string | number }
      }) => UseMutationResult<
        Blob,
        Error,
        { urlParams: { fileId: string | number } }
      >
    >(mutation)

    // Should have MutationHelpers
    assertType<
      MutationHelpers<'/files/$fileId/download', Blob>['mutationKey']
    >(mutation.mutationKey)
  })

  test('GET stream mutation with querySchema', () => {
    const mutation = client.mutationFromEndpoint(streamEndpointGetWithQuery)

    assertType<
      () => UseMutationResult<
        Blob,
        Error,
        {
          urlParams: { fileId: string | number }
          params: z.input<typeof querySchema>
        }
      >
    >(mutation)
  })

  test('POST stream mutation with requestSchema', () => {
    const mutation = client.mutationFromEndpoint(streamEndpointPost)

    assertType<
      () => UseMutationResult<
        Blob,
        Error,
        {
          urlParams: { fileId: string | number }
          data: z.input<typeof requestSchema>
        }
      >
    >(mutation)
  })

  test('stream mutation with onSuccess callback', () => {
    const mutation = client.mutationFromEndpoint(streamEndpointGet, {
      onSuccess: (data, variables) => {
        // data should be Blob
        assertType<Blob>(data)
        // variables should have urlParams
        assertType<{ urlParams: { fileId: string | number } }>(variables)
      },
    })

    assertType<
      () => UseMutationResult<
        Blob,
        Error,
        { urlParams: { fileId: string | number } }
      >
    >(mutation)
  })

  test('stream mutation with custom processResponse and onSuccess', () => {
    const mutation = client.mutationFromEndpoint(streamEndpointGet, {
      processResponse: (blob) => ({ url: URL.createObjectURL(blob), size: blob.size }),
      onSuccess: (data) => {
        // data should be the transformed type
        assertType<{ url: string; size: number }>(data)
      },
    })

    assertType<
      () => UseMutationResult<
        { url: string; size: number },
        Error,
        { urlParams: { fileId: string | number } }
      >
    >(mutation)
  })
})

describe('Error cases - should fail type checking', () => {
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

  test('mutation without processResponse', () => {
    client.mutation({
      // @ts-expect-error - missing processResponse causes method to not match any overload
      method: 'POST',
      url: '/users',
      requestSchema,
      responseSchema,
    })
  })

  test('infiniteQuery without getNextPageParam', () => {
    // @ts-expect-error - missing getNextPageParam
    client.infiniteQuery({
      method: 'GET',
      url: '/users',
      querySchema,
      responseSchema,
    })
  })
})
