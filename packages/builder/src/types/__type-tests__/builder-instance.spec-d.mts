import type { z, ZodObject, ZodType } from 'zod/v4'

import { assertType, describe, expectTypeOf, test } from 'vitest'
import { z as zod } from 'zod/v4'

import type {
  BaseEndpointConfig,
  BaseStreamConfig,
  BuilderInstance,
  EndpointFunctionArgs,
  ParsePathParams,
  UrlHasParams,
  UrlParams,
  Util_FlatObject,
} from '../index.mjs'

declare const api: BuilderInstance

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

const multipartRequestSchema = zod.object({
  name: zod.string(),
  email: zod.string(),
  file: zod.instanceof(File),
})

type ResponseType = z.output<typeof responseSchema>
type QueryType = z.input<typeof querySchema>
type RequestType = z.input<typeof requestSchema>

describe('BuilderInstance', () => {
  describe('declareEndpoint() method', () => {
    describe('GET endpoints', () => {
      test('simple GET endpoint without query params or URL params', () => {
        const endpoint = api.declareEndpoint({
          method: 'GET',
          url: '/users',
          responseSchema,
        })

        // Return type is a callable that returns Promise<ResponseType>
        assertType<(params: {}) => Promise<ResponseType>>(endpoint)

        // Has config property
        assertType<
          BaseEndpointConfig<'GET', '/users', undefined, typeof responseSchema>
        >(endpoint.config)
      })

      test('GET endpoint with URL params only', () => {
        const endpoint = api.declareEndpoint({
          method: 'GET',
          url: '/users/$userId',
          responseSchema,
        })

        // Requires urlParams in the call
        assertType<
          (params: {
            urlParams: { userId: string | number }
          }) => Promise<ResponseType>
        >(endpoint)

        // Has config property
        assertType<
          BaseEndpointConfig<
            'GET',
            '/users/$userId',
            undefined,
            typeof responseSchema
          >
        >(endpoint.config)
      })

      test('GET endpoint with query schema only', () => {
        const endpoint = api.declareEndpoint({
          method: 'GET',
          url: '/search',
          querySchema,
          responseSchema,
        })

        // Requires params in the call
        assertType<(params: { params: QueryType }) => Promise<ResponseType>>(
          endpoint,
        )

        // Has config property
        assertType<
          BaseEndpointConfig<
            'GET',
            '/search',
            typeof querySchema,
            typeof responseSchema
          >
        >(endpoint.config)
      })

      test('GET endpoint with both URL params and query schema', () => {
        const endpoint = api.declareEndpoint({
          method: 'GET',
          url: '/users/$userId/posts',
          querySchema,
          responseSchema,
        })

        // Requires both urlParams and params
        assertType<
          (params: {
            urlParams: { userId: string | number }
            params: QueryType
          }) => Promise<ResponseType>
        >(endpoint)

        // Has config property
        assertType<
          BaseEndpointConfig<
            'GET',
            '/users/$userId/posts',
            typeof querySchema,
            typeof responseSchema
          >
        >(endpoint.config)
      })

      test('GET endpoint with multiple URL params', () => {
        const endpoint = api.declareEndpoint({
          method: 'GET',
          url: '/users/$userId/posts/$postId/comments/$commentId',
          responseSchema,
        })

        // Requires all urlParams
        assertType<
          (params: {
            urlParams: {
              userId: string | number
              postId: string | number
              commentId: string | number
            }
          }) => Promise<ResponseType>
        >(endpoint)
      })
    })

    describe('DELETE endpoints', () => {
      test('DELETE endpoint with URL params', () => {
        const endpoint = api.declareEndpoint({
          method: 'DELETE',
          url: '/users/$userId',
          responseSchema,
        })

        // Requires urlParams
        assertType<
          (params: {
            urlParams: { userId: string | number }
          }) => Promise<ResponseType>
        >(endpoint)

        // Has config property
        assertType<
          BaseEndpointConfig<
            'DELETE',
            '/users/$userId',
            undefined,
            typeof responseSchema
          >
        >(endpoint.config)
      })

      test('DELETE endpoint with query schema', () => {
        const endpoint = api.declareEndpoint({
          method: 'DELETE',
          url: '/cache',
          querySchema,
          responseSchema,
        })

        // Requires params
        assertType<(params: { params: QueryType }) => Promise<ResponseType>>(
          endpoint,
        )
      })

      test('DELETE endpoint without params', () => {
        const endpoint = api.declareEndpoint({
          method: 'DELETE',
          url: '/cache',
          responseSchema,
        })

        // Takes empty object
        assertType<(params: {}) => Promise<ResponseType>>(endpoint)
      })
    })

    describe('HEAD and OPTIONS endpoints', () => {
      test('HEAD endpoint', () => {
        const endpoint = api.declareEndpoint({
          method: 'HEAD',
          url: '/ping',
          responseSchema,
        })

        assertType<(params: {}) => Promise<ResponseType>>(endpoint)
        assertType<
          BaseEndpointConfig<'HEAD', '/ping', undefined, typeof responseSchema>
        >(endpoint.config)
      })

      test('OPTIONS endpoint', () => {
        const endpoint = api.declareEndpoint({
          method: 'OPTIONS',
          url: '/cors',
          responseSchema,
        })

        assertType<(params: {}) => Promise<ResponseType>>(endpoint)
        assertType<
          BaseEndpointConfig<
            'OPTIONS',
            '/cors',
            undefined,
            typeof responseSchema
          >
        >(endpoint.config)
      })

      test('HEAD endpoint with query schema', () => {
        const endpoint = api.declareEndpoint({
          method: 'HEAD',
          url: '/status',
          querySchema,
          responseSchema,
        })

        assertType<(params: { params: QueryType }) => Promise<ResponseType>>(
          endpoint,
        )
      })
    })

    describe('POST endpoints', () => {
      test('POST endpoint with request schema only', () => {
        const endpoint = api.declareEndpoint({
          method: 'POST',
          url: '/users',
          requestSchema,
          responseSchema,
        })

        // Requires data in the call
        assertType<(params: { data: RequestType }) => Promise<ResponseType>>(
          endpoint,
        )

        // Has config property
        assertType<
          BaseEndpointConfig<
            'POST',
            '/users',
            undefined,
            typeof responseSchema,
            typeof requestSchema
          >
        >(endpoint.config)
      })

      test('POST with simple definition', () => {
        const endpoint = api.declareEndpoint({
          method: 'POST',
          url: '/users',
          responseSchema,
        })

        assertType<(params: {}) => Promise<ResponseType>>(endpoint)
        assertType<
          BaseEndpointConfig<'POST', '/users', undefined, typeof responseSchema>
        >(endpoint.config)
      })

      test('POST with query schema only', () => {
        const endpoint = api.declareEndpoint({
          method: 'POST',
          url: '/users',
          querySchema,
          responseSchema,
        })

        assertType<(params: { params: QueryType }) => Promise<ResponseType>>(
          endpoint,
        )
        assertType<
          BaseEndpointConfig<
            'POST',
            '/users',
            typeof querySchema,
            typeof responseSchema
          >
        >(endpoint.config)
      })

      test('POST endpoint with URL params and request schema', () => {
        const endpoint = api.declareEndpoint({
          method: 'POST',
          url: '/users/$userId/posts',
          requestSchema,
          responseSchema,
        })

        // Requires both urlParams and data
        assertType<
          (params: {
            urlParams: { userId: string | number }
            data: RequestType
          }) => Promise<ResponseType>
        >(endpoint)
      })

      test('POST endpoint with query schema and request schema', () => {
        const endpoint = api.declareEndpoint({
          method: 'POST',
          url: '/users',
          querySchema,
          requestSchema,
          responseSchema,
        })

        // Requires both params and data
        assertType<
          (params: {
            params: QueryType
            data: RequestType
          }) => Promise<ResponseType>
        >(endpoint)

        // Has config property
        assertType<
          BaseEndpointConfig<
            'POST',
            '/users',
            typeof querySchema,
            typeof responseSchema,
            typeof requestSchema
          >
        >(endpoint.config)
      })

      test('POST endpoint with URL params, query schema, and request schema', () => {
        const endpoint = api.declareEndpoint({
          method: 'POST',
          url: '/users/$userId/posts',
          querySchema,
          requestSchema,
          responseSchema,
        })

        // Requires urlParams, params, and data
        assertType<
          (params: {
            urlParams: { userId: string | number }
            params: QueryType
            data: RequestType
          }) => Promise<ResponseType>
        >(endpoint)
      })

      test('POST endpoint without request schema (response only)', () => {
        const endpoint = api.declareEndpoint({
          method: 'POST',
          url: '/trigger',
          responseSchema,
        })

        // Takes empty object (no data required)
        assertType<(params: {}) => Promise<ResponseType>>(endpoint)
      })
    })

    describe('PUT endpoints', () => {
      test('PUT endpoint with request schema', () => {
        const endpoint = api.declareEndpoint({
          method: 'PUT',
          url: '/users/$userId',
          requestSchema,
          responseSchema,
        })

        assertType<
          (params: {
            urlParams: { userId: string | number }
            data: RequestType
          }) => Promise<ResponseType>
        >(endpoint)

        assertType<
          BaseEndpointConfig<
            'PUT',
            '/users/$userId',
            undefined,
            typeof responseSchema,
            typeof requestSchema
          >
        >(endpoint.config)
      })

      test('PUT endpoint with query schema and request schema', () => {
        const endpoint = api.declareEndpoint({
          method: 'PUT',
          url: '/users/$userId',
          querySchema,
          requestSchema,
          responseSchema,
        })

        assertType<
          (params: {
            urlParams: { userId: string | number }
            params: QueryType
            data: RequestType
          }) => Promise<ResponseType>
        >(endpoint)
      })
    })

    describe('PATCH endpoints', () => {
      test('PATCH endpoint with request schema', () => {
        const endpoint = api.declareEndpoint({
          method: 'PATCH',
          url: '/users/$userId',
          requestSchema,
          responseSchema,
        })

        assertType<
          (params: {
            urlParams: { userId: string | number }
            data: RequestType
          }) => Promise<ResponseType>
        >(endpoint)

        assertType<
          BaseEndpointConfig<
            'PATCH',
            '/users/$userId',
            undefined,
            typeof responseSchema,
            typeof requestSchema
          >
        >(endpoint.config)
      })

      test('PATCH endpoint without URL params', () => {
        const endpoint = api.declareEndpoint({
          method: 'PATCH',
          url: '/settings',
          requestSchema,
          responseSchema,
        })

        assertType<(params: { data: RequestType }) => Promise<ResponseType>>(
          endpoint,
        )
      })
    })
  })

  describe('declareMultipart() method', () => {
    test('multipart POST endpoint with request schema', () => {
      const endpoint = api.declareMultipart({
        method: 'POST',
        url: '/upload',
        requestSchema: multipartRequestSchema,
        responseSchema,
      })

      // Requires data in the call
      assertType<
        (params: {
          data: z.input<typeof multipartRequestSchema>
        }) => Promise<ResponseType>
      >(endpoint)

      // Has config property
      assertType<
        BaseEndpointConfig<
          'POST',
          '/upload',
          undefined,
          typeof responseSchema,
          typeof multipartRequestSchema
        >
      >(endpoint.config)
    })

    test('multipart POST endpoint with URL params', () => {
      const endpoint = api.declareMultipart({
        method: 'POST',
        url: '/users/$userId/avatar',
        requestSchema: multipartRequestSchema,
        responseSchema,
      })

      // Requires urlParams and data
      assertType<
        (params: {
          urlParams: { userId: string | number }
          data: z.input<typeof multipartRequestSchema>
        }) => Promise<ResponseType>
      >(endpoint)
    })

    test('multipart POST endpoint with query schema', () => {
      const endpoint = api.declareMultipart({
        method: 'POST',
        url: '/upload',
        querySchema,
        requestSchema: multipartRequestSchema,
        responseSchema,
      })

      // Requires params and data
      assertType<
        (params: {
          params: QueryType
          data: z.input<typeof multipartRequestSchema>
        }) => Promise<ResponseType>
      >(endpoint)

      assertType<
        BaseEndpointConfig<
          'POST',
          '/upload',
          typeof querySchema,
          typeof responseSchema,
          typeof multipartRequestSchema
        >
      >(endpoint.config)
    })

    test('multipart PUT endpoint', () => {
      const endpoint = api.declareMultipart({
        method: 'PUT',
        url: '/users/$userId/profile',
        requestSchema: multipartRequestSchema,
        responseSchema,
      })

      assertType<
        (params: {
          urlParams: { userId: string | number }
          data: z.input<typeof multipartRequestSchema>
        }) => Promise<ResponseType>
      >(endpoint)

      assertType<
        BaseEndpointConfig<
          'PUT',
          '/users/$userId/profile',
          undefined,
          typeof responseSchema,
          typeof multipartRequestSchema
        >
      >(endpoint.config)
    })

    test('multipart PATCH endpoint', () => {
      const endpoint = api.declareMultipart({
        method: 'PATCH',
        url: '/users/$userId/avatar',
        requestSchema: multipartRequestSchema,
        responseSchema,
      })

      assertType<
        (params: {
          urlParams: { userId: string | number }
          data: z.input<typeof multipartRequestSchema>
        }) => Promise<ResponseType>
      >(endpoint)

      assertType<
        BaseEndpointConfig<
          'PATCH',
          '/users/$userId/avatar',
          undefined,
          typeof responseSchema,
          typeof multipartRequestSchema
        >
      >(endpoint.config)
    })

    test('multipart endpoint without request schema (response only)', () => {
      const endpoint = api.declareMultipart({
        method: 'POST',
        url: '/process',
        responseSchema,
      })

      assertType<(params: {}) => Promise<ResponseType>>(endpoint)
    })
  })

  describe('declareStream() method', () => {
    describe('GET streams', () => {
      test('simple GET stream', () => {
        const stream = api.declareStream({
          method: 'GET',
          url: '/download',
        })

        assertType<(params: {}) => Promise<Blob>>(stream)
        assertType<BaseStreamConfig<'GET', '/download'>>(stream.config)
      })

      test('GET stream with URL params', () => {
        const stream = api.declareStream({
          method: 'GET',
          url: '/files/$fileId',
        })

        assertType<
          (params: { urlParams: { fileId: string | number } }) => Promise<Blob>
        >(stream)
      })

      test('GET stream with query schema', () => {
        const stream = api.declareStream({
          method: 'GET',
          url: '/export',
          querySchema,
        })

        assertType<(params: { params: QueryType }) => Promise<Blob>>(stream)

        assertType<BaseStreamConfig<'GET', '/export', typeof querySchema>>(
          stream.config,
        )
      })

      test('GET stream with URL params and query schema', () => {
        const stream = api.declareStream({
          method: 'GET',
          url: '/users/$userId/export',
          querySchema,
        })

        assertType<
          (params: {
            urlParams: { userId: string | number }
            params: QueryType
          }) => Promise<Blob>
        >(stream)
      })
    })

    describe('POST streams', () => {
      test('POST stream with request schema', () => {
        const stream = api.declareStream({
          method: 'POST',
          url: '/generate',
          requestSchema,
        })

        assertType<(params: { data: RequestType }) => Promise<Blob>>(stream)

        assertType<
          BaseStreamConfig<'POST', '/generate', undefined, typeof requestSchema>
        >(stream.config)
      })

      test('POST stream with URL params and request schema', () => {
        const stream = api.declareStream({
          method: 'POST',
          url: '/users/$userId/generate',
          requestSchema,
        })

        assertType<
          (params: {
            urlParams: { userId: string | number }
            data: RequestType
          }) => Promise<Blob>
        >(stream)
      })

      test('POST stream with query schema and request schema', () => {
        const stream = api.declareStream({
          method: 'POST',
          url: '/generate',
          querySchema,
          requestSchema,
        })

        assertType<
          (params: { params: QueryType; data: RequestType }) => Promise<Blob>
        >(stream)

        assertType<
          BaseStreamConfig<
            'POST',
            '/generate',
            typeof querySchema,
            typeof requestSchema
          >
        >(stream.config)
      })

      test('POST stream without schemas', () => {
        const stream = api.declareStream({
          method: 'POST',
          url: '/trigger-download',
        })

        assertType<(params: {}) => Promise<Blob>>(stream)
        assertType<BaseStreamConfig<'POST', '/trigger-download'>>(stream.config)
      })
    })

    describe('PUT streams', () => {
      test('PUT stream with request schema', () => {
        const stream = api.declareStream({
          method: 'PUT',
          url: '/process',
          requestSchema,
        })

        assertType<(params: { data: RequestType }) => Promise<Blob>>(stream)
      })
    })

    describe('PATCH streams', () => {
      test('PATCH stream with request schema', () => {
        const stream = api.declareStream({
          method: 'PATCH',
          url: '/update-and-download',
          requestSchema,
        })

        assertType<(params: { data: RequestType }) => Promise<Blob>>(stream)
      })
    })

    describe('DELETE streams', () => {
      test('DELETE stream', () => {
        const stream = api.declareStream({
          method: 'DELETE',
          url: '/cleanup',
        })

        assertType<(params: {}) => Promise<Blob>>(stream)
      })

      test('DELETE stream with query schema', () => {
        const stream = api.declareStream({
          method: 'DELETE',
          url: '/cleanup',
          querySchema,
        })

        assertType<(params: { params: QueryType }) => Promise<Blob>>(stream)
      })
    })

    describe('HEAD and OPTIONS streams', () => {
      test('HEAD stream', () => {
        const stream = api.declareStream({
          method: 'HEAD',
          url: '/check',
        })

        assertType<(params: {}) => Promise<Blob>>(stream)
      })

      test('OPTIONS stream', () => {
        const stream = api.declareStream({
          method: 'OPTIONS',
          url: '/cors',
        })

        assertType<(params: {}) => Promise<Blob>>(stream)
      })
    })
  })
})

describe('URL Params type utilities', () => {
  describe('ParsePathParams', () => {
    test('extracts single URL param', () => {
      type Params = ParsePathParams<'/users/$userId'>
      assertType<'userId'>({} as Params)
    })

    test('extracts multiple URL params', () => {
      type Params = ParsePathParams<'/users/$userId/posts/$postId'>
      assertType<'userId' | 'postId'>({} as Params)
    })

    test('returns never for URL without params', () => {
      type Params = ParsePathParams<'/users'>
      expectTypeOf<Params>().toEqualTypeOf<never>()
    })

    test('extracts three URL params', () => {
      type Params =
        ParsePathParams<'/users/$userId/posts/$postId/comments/$commentId'>
      assertType<'userId' | 'postId' | 'commentId'>({} as Params)
    })

    test('handles trailing param', () => {
      type Params = ParsePathParams<'/files/$fileId'>
      assertType<'fileId'>({} as Params)
    })
  })

  describe('UrlParams', () => {
    test('single URL param accepts string or number', () => {
      type Params = UrlParams<'/users/$userId'>
      const paramsStr: Params = { userId: '123' }
      const paramsNum: Params = { userId: 123 }
      assertType<Params>(paramsStr)
      assertType<Params>(paramsNum)
    })

    test('multiple URL params', () => {
      type Params =
        UrlParams<'/users/$userId/posts/$postId/comments/$commentId'>
      const params: Params = { userId: '123', postId: '456', commentId: '789' }
      assertType<Params>(params)
    })

    test('URL without params returns empty object type', () => {
      type Params = UrlParams<'/users'>
      // When ParsePathParams returns never, UrlParams becomes {}
      const params: Params = {} as Params
      assertType<Params>(params)
    })
  })

  describe('UrlHasParams', () => {
    test('returns true for URL with params', () => {
      type HasParams = UrlHasParams<'/users/$userId'>
      assertType<true>({} as HasParams)
    })

    test('returns false for URL without params', () => {
      type HasParams = UrlHasParams<'/users'>
      assertType<false>({} as HasParams)
    })

    test('returns true for multiple params', () => {
      type HasParams = UrlHasParams<'/users/$userId/posts/$postId'>
      assertType<true>({} as HasParams)
    })
  })
})

describe('EndpointFunctionArgs type', () => {
  test('with URL params only', () => {
    type Args = EndpointFunctionArgs<'/users/$userId'>

    assertType<Args>({
      urlParams: { userId: '123' },
    })
  })

  test('with query schema only', () => {
    type Args = EndpointFunctionArgs<'/users', typeof querySchema>

    assertType<Args>({
      params: { page: 1, limit: 10 },
    })
  })

  test('with request schema only', () => {
    type Args = EndpointFunctionArgs<'/users', undefined, typeof requestSchema>

    assertType<Args>({
      data: { name: 'John', email: 'john@example.com' },
    })
  })

  test('with URL params and query schema', () => {
    type Args = EndpointFunctionArgs<'/users/$userId', typeof querySchema>

    assertType<Args>({
      urlParams: { userId: '123' },
      params: { page: 1, limit: 10 },
    })
  })

  test('with URL params and request schema', () => {
    type Args = EndpointFunctionArgs<
      '/users/$userId',
      undefined,
      typeof requestSchema
    >

    assertType<Args>({
      urlParams: { userId: '123' },
      data: { name: 'John', email: 'john@example.com' },
    })
  })

  test('with all schemas', () => {
    type Args = EndpointFunctionArgs<
      '/users/$userId',
      typeof querySchema,
      typeof requestSchema
    >

    assertType<Args>({
      urlParams: { userId: '123' },
      params: { page: 1, limit: 10 },
      data: { name: 'John', email: 'john@example.com' },
    })
  })

  test('without any schemas', () => {
    type Args = EndpointFunctionArgs<'/users'>

    // Should be an empty-ish object (only NaviosZodRequestBase properties)
    const args: Args = {}
    assertType<Args>(args)
  })
})

describe('Util_FlatObject type', () => {
  test('flattens simple object', () => {
    type Input = { a: string; b: number }
    type Flattened = Util_FlatObject<Input>

    assertType<Flattened>({ a: 'test', b: 123 })
  })

  test('flattens object with urlParams', () => {
    type Input = { urlParams: { userId: string }; data: { name: string } }
    type Flattened = Util_FlatObject<Input>

    assertType<Flattened>({
      urlParams: { userId: '123' },
      data: { name: 'John' },
    })
  })

  test('preserves nested structure in urlParams', () => {
    type Input = { urlParams: { userId: string; postId: string } }
    type Flattened = Util_FlatObject<Input>

    const flattened: Flattened = { urlParams: { userId: '1', postId: '2' } }
    assertType<Flattened>(flattened)
  })
})

describe('BaseEndpointConfig type', () => {
  test('full config with all type parameters', () => {
    type Config = BaseEndpointConfig<
      'POST',
      '/users/$userId',
      typeof querySchema,
      typeof responseSchema,
      typeof requestSchema
    >

    const config: Config = {
      method: 'POST',
      url: '/users/$userId',
      querySchema,
      responseSchema,
      requestSchema,
    }
    assertType<Config>(config)
  })

  test('config without request schema', () => {
    type Config = BaseEndpointConfig<
      'GET',
      '/users',
      typeof querySchema,
      typeof responseSchema
    >

    const config: Config = {
      method: 'GET',
      url: '/users',
      querySchema,
      responseSchema,
      requestSchema: undefined,
    }
    assertType<Config>(config)
  })

  test('config without query schema', () => {
    type Config = BaseEndpointConfig<
      'POST',
      '/users',
      undefined,
      typeof responseSchema,
      typeof requestSchema
    >

    const config: Config = {
      method: 'POST',
      url: '/users',
      querySchema: undefined,
      responseSchema,
      requestSchema,
    }
    assertType<Config>(config)
  })
})

describe('BaseStreamConfig type', () => {
  test('full config with all type parameters', () => {
    type Config = BaseStreamConfig<
      'POST',
      '/generate',
      typeof querySchema,
      typeof requestSchema
    >

    const config: Config = {
      method: 'POST',
      url: '/generate',
      querySchema,
      requestSchema,
    }
    assertType<Config>(config)
  })

  test('config without request schema', () => {
    type Config = BaseStreamConfig<'GET', '/download', typeof querySchema>

    const config: Config = {
      method: 'GET',
      url: '/download',
      querySchema,
      requestSchema: undefined,
    }
    assertType<Config>(config)
  })

  test('minimal config', () => {
    type Config = BaseStreamConfig<'GET', '/download'>

    const config: Config = {
      method: 'GET',
      url: '/download',
      querySchema: undefined,
      requestSchema: undefined,
    }
    assertType<Config>(config)
  })
})

describe('Error cases - should fail type checking', () => {
  test('GET endpoint without urlParams when URL has params', () => {
    const endpoint = api.declareEndpoint({
      method: 'GET',
      url: '/users/$userId',
      responseSchema,
    })

    // @ts-expect-error - missing urlParams
    endpoint({})
  })

  test('GET endpoint without params when querySchema is defined', () => {
    const endpoint = api.declareEndpoint({
      method: 'GET',
      url: '/users',
      querySchema,
      responseSchema,
    })

    // @ts-expect-error - missing params
    endpoint({})
  })

  test('POST endpoint without data when requestSchema is defined', () => {
    const endpoint = api.declareEndpoint({
      method: 'POST',
      url: '/users',
      requestSchema,
      responseSchema,
    })

    // @ts-expect-error - missing data
    endpoint({})
  })

  test('POST endpoint with wrong data shape', () => {
    const endpoint = api.declareEndpoint({
      method: 'POST',
      url: '/users',
      requestSchema,
      responseSchema,
    })

    // @ts-expect-error - wrong data shape
    endpoint({ data: { wrongField: 'value' } })
  })

  test('stream without urlParams when URL has params', () => {
    const stream = api.declareStream({
      method: 'GET',
      url: '/files/$fileId',
    })

    // @ts-expect-error - missing urlParams
    stream({})
  })

  test('stream without params when querySchema is defined', () => {
    const stream = api.declareStream({
      method: 'GET',
      url: '/export',
      querySchema,
    })

    // @ts-expect-error - missing params
    stream({})
  })

  test('multipart endpoint without data when requestSchema is defined', () => {
    const endpoint = api.declareMultipart({
      method: 'POST',
      url: '/upload',
      requestSchema: multipartRequestSchema,
      responseSchema,
    })

    // @ts-expect-error - missing data
    endpoint({})
  })
})
