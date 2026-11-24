import { describe, expectTypeOf, test } from 'vitest'
import { z } from 'zod/v4'

import { builder } from '../../builder.mjs'
import { isEndpointError, isHttpError } from '../../errors/index.mjs'

import type { EndpointError, EndpointErrorOf } from '../../errors/index.mjs'
import type {
  ClientRequestArgs,
  EndpointErrorType,
  EndpointParams,
  EndpointResult,
  ParsePathParams,
  ResponseMeta,
  SafeResult,
} from '../index.mjs'

const api = builder()
const userSchema = z.object({ id: z.string(), name: z.string() })

describe('ParsePathParams', () => {
  test('follows the runtime grammar', () => {
    expectTypeOf<ParsePathParams<'/users'>>().toEqualTypeOf<never>()
    expectTypeOf<ParsePathParams<'/users/$userId'>>().toEqualTypeOf<'userId'>()
    expectTypeOf<ParsePathParams<'/users/$userId/posts/$postId'>>().toEqualTypeOf<
      'userId' | 'postId'
    >()
    expectTypeOf<ParsePathParams<'/u/$user_id/x'>>().toEqualTypeOf<'user_id'>()
    expectTypeOf<ParsePathParams<'/f/$id.json'>>().toEqualTypeOf<'id'>()
    expectTypeOf<ParsePathParams<'/f/$a-$b'>>().toEqualTypeOf<'a' | 'b'>()
    expectTypeOf<ParsePathParams<'/price/$5/$id'>>().toEqualTypeOf<'id'>()
    expectTypeOf<ParsePathParams<'/trailing/$'>>().toEqualTypeOf<never>()
  })
})

describe('declareEndpoint', () => {
  test('args are derived from url and schemas', () => {
    const ep = api.declareEndpoint({
      method: 'POST',
      url: '/users/$userId',
      querySchema: z.object({ notify: z.boolean().optional() }),
      requestSchema: z.object({ name: z.string() }),
      responseSchema: userSchema,
    })
    expectTypeOf<EndpointParams<typeof ep>>().toEqualTypeOf<{
      signal?: AbortSignal | null
      headers?: Record<string, string>
      timeout?: number
      urlParams: { userId: string | number }
      // optional: the query schema has no required fields
      params?: { notify?: boolean | undefined }
      data: { name: string }
    }>()
    expectTypeOf(ep).parameter(0).toEqualTypeOf<EndpointParams<typeof ep>>()
    expectTypeOf(ep).returns.resolves.toEqualTypeOf<{ id: string; name: string }>()
  })

  test('urlParamsSchema types urlParams from z.input', () => {
    const ep = api.declareEndpoint({
      method: 'GET',
      url: '/users/$userId',
      urlParamsSchema: z.object({ userId: z.coerce.number() }),
      responseSchema: userSchema,
    })
    expectTypeOf<EndpointParams<typeof ep>['urlParams']>().toEqualTypeOf<{ userId: unknown }>()
  })

  test('args are optional when nothing is required', () => {
    const ep = api.declareEndpoint({ method: 'GET', url: '/users', responseSchema: userSchema })
    expectTypeOf(ep).toBeCallableWith()
    expectTypeOf(ep).toBeCallableWith({ signal: null, timeout: 10 })
    expectTypeOf(ep.safe).toBeCallableWith()

    const withParams = api.declareEndpoint({
      method: 'GET',
      url: '/users/$id',
      responseSchema: userSchema,
    })
    // @ts-expect-error urlParams is required
    void withParams()
    // @ts-expect-error unknown key
    void withParams({ urlParams: { id: 1 }, nope: true })
  })

  test('responseSchema is required for JSON responses only', () => {
    // @ts-expect-error responseSchema is missing
    api.declareEndpoint({ method: 'GET', url: '/users' })
    // @ts-expect-error responseSchema is missing for an explicit json response
    api.declareEndpoint({ method: 'GET', url: '/users', response: 'json' })

    const blob = api.declareEndpoint({ method: 'GET', url: '/f/$id', response: 'blob' })
    expectTypeOf(blob).returns.resolves.toEqualTypeOf<Blob>()
    const text = api.declareEndpoint({ method: 'GET', url: '/f', response: 'text' })
    expectTypeOf(text).returns.resolves.toEqualTypeOf<string>()
    const stream = api.declareEndpoint({ method: 'GET', url: '/f', response: 'stream' })
    expectTypeOf(stream).returns.resolves.toEqualTypeOf<ReadableStream<Uint8Array>>()
    const none = api.declareEndpoint({ method: 'DELETE', url: '/f/$id', response: 'void' })
    expectTypeOf(none).returns.resolves.toEqualTypeOf<undefined>()
    expectTypeOf<EndpointResult<typeof none>>().toEqualTypeOf<undefined>()
  })

  test('unknown option keys are rejected', () => {
    api.declareEndpoint({
      method: 'GET',
      url: '/users',
      responseSchema: userSchema,
      // @ts-expect-error typo: the option is requestSchema
      requstSchema: userSchema,
    })
    api.declareEndpoint({
      method: 'GET',
      url: '/users',
      responseSchema: userSchema,
      // @ts-expect-error removed option
      result: 'envelope',
    })
  })

  test('multipart body keeps the request schema input type', () => {
    const upload = api.declareEndpoint({
      method: 'POST',
      url: '/files',
      body: 'multipart',
      requestSchema: z.object({ file: z.instanceof(File), note: z.string().optional() }),
      responseSchema: z.object({ id: z.string() }),
    })
    expectTypeOf<EndpointParams<typeof upload>['data']>().toEqualTypeOf<{
      file: File
      note?: string | undefined
    }>()
  })

  test('config is the declared options', () => {
    const ep = api.declareEndpoint({ method: 'GET', url: '/users', responseSchema: userSchema })
    expectTypeOf(ep.config.method).toEqualTypeOf<'GET'>()
    expectTypeOf(ep.config.url).toEqualTypeOf<'/users'>()
  })

  test('ClientRequestArgs is the single args type', () => {
    const ep = api.declareEndpoint({
      method: 'GET',
      url: '/users/$id',
      responseSchema: userSchema,
    })
    expectTypeOf<EndpointParams<typeof ep>>().toEqualTypeOf<ClientRequestArgs<typeof ep.config>>()
  })
})

describe('safe()', () => {
  const ep = api.declareEndpoint({
    method: 'GET',
    url: '/users/$userId',
    responseSchema: userSchema,
    errorSchema: {
      404: z.object({ message: z.string() }),
      409: z.object({ status: z.string(), conflictWith: z.string() }),
    },
  })

  test('returns a discriminated SafeResult', async () => {
    const res = await ep.safe({ urlParams: { userId: 1 } })
    expectTypeOf(res).toEqualTypeOf<
      SafeResult<{ id: string; name: string }, EndpointErrorType<typeof ep>>
    >()
    if (res.ok) {
      expectTypeOf(res.data).toEqualTypeOf<{ id: string; name: string }>()
      expectTypeOf(res.error).toEqualTypeOf<null>()
      expectTypeOf(res.response).toEqualTypeOf<ResponseMeta>()
    } else {
      expectTypeOf(res.data).toEqualTypeOf<null>()
      expectTypeOf(res.error).toExtend<EndpointError>()
    }
  })

  test('narrowing on kind and status narrows body, untouched', async () => {
    const res = await ep.safe({ urlParams: { userId: 1 } })
    if (res.ok) return
    const { error } = res
    if (error.kind === 'http') {
      expectTypeOf(error.status).toEqualTypeOf<404 | 409>()
      if (error.status === 404) {
        expectTypeOf(error.body).toEqualTypeOf<{ message: string }>()
      }
      if (error.status === 409) {
        // The body's own `status` field survives with its declared type.
        expectTypeOf(error.body).toEqualTypeOf<{ status: string; conflictWith: string }>()
      }
    }
    if (error.kind === 'http-unknown') {
      expectTypeOf(error.status).toEqualTypeOf<number>()
      expectTypeOf(error.body).toEqualTypeOf<unknown>()
    }
    if (error.kind === 'request-validation' || error.kind === 'response-validation') {
      expectTypeOf(error.issues).toExtend<readonly unknown[]>()
    }
    if (error.kind === 'aborted') {
      expectTypeOf(error.response).toEqualTypeOf<null>()
    }
  })

  test('guards work on unknown', () => {
    const caught: unknown = null
    if (isEndpointError(caught)) {
      expectTypeOf(caught).toEqualTypeOf<EndpointError>()
    }
    if (isHttpError<NonNullable<typeof ep.config.errorSchema>, 404>(caught, 404)) {
      expectTypeOf(caught.body).toEqualTypeOf<{ message: string }>()
    }
  })

  test('without errorSchema there is no http variant', () => {
    type E = EndpointErrorOf
    expectTypeOf<Extract<E, { kind: 'http' }>>().toEqualTypeOf<never>()
  })
})

describe('builder', () => {
  test('accepts a client and hands EndpointError to onError', () => {
    builder({
      client: {
        request: async () => ({ data: null, status: 200, statusText: '', headers: {} }) as never,
      },
      onError: (error) => {
        expectTypeOf(error).toEqualTypeOf<EndpointError>()
      },
    })
    expectTypeOf(api.withClient).returns.toEqualTypeOf<typeof api>()
  })
})
