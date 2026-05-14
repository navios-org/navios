import { assertType, describe, test } from 'vitest'
import { z as zod } from 'zod/v4'

import type { EnvelopeError, ErrorSchemaRecord, ResponseEnvelope } from '@navios/builder'
import type {
  DataTag,
  InfiniteData,
  UseMutationResult,
  UseSuspenseInfiniteQueryOptions,
  UseSuspenseQueryOptions,
} from '@tanstack/react-query'
import type { z } from 'zod/v4'

import type { Split } from '../../common/types.mjs'
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
})

const requestSchema = zod.object({
  name: zod.string(),
})

const error404Schema = zod.object({ msg: zod.string() })
const error500Schema = zod.object({ serverError: zod.string() })

const errorSchema = {
  404: error404Schema,
  500: error500Schema,
} satisfies ErrorSchemaRecord

type ResponseType = z.output<typeof responseSchema>
type EnvelopeType = ResponseEnvelope<ResponseType, EnvelopeError<typeof errorSchema>>
type EnvelopeTypeNoErrSchema = ResponseEnvelope<ResponseType, EnvelopeError<undefined>>

// ============================================================================
// CLIENT INSTANCE
// ============================================================================

declare const client: ClientInstance<false>

// ============================================================================
// QUERY: result: 'envelope' inference
// ============================================================================

describe('client.query with result: "envelope"', () => {
  test('result: "envelope" surfaces ResponseEnvelope at the type level', () => {
    const query = client.query({
      method: 'GET',
      url: '/u',
      responseSchema,
      errorSchema,
      result: 'envelope',
    })

    assertType<
      (params: {}) => UseSuspenseQueryOptions<
        EnvelopeType,
        Error,
        EnvelopeType,
        DataTag<Split<'/u', '/'>, EnvelopeType, Error>
      >
    >(query)
  })

  test('result: "envelope" without errorSchema still surfaces ResponseEnvelope', () => {
    const query = client.query({
      method: 'GET',
      url: '/u',
      responseSchema,
      result: 'envelope',
    })

    assertType<
      (params: {}) => UseSuspenseQueryOptions<
        EnvelopeTypeNoErrSchema,
        Error,
        EnvelopeTypeNoErrSchema,
        DataTag<Split<'/u', '/'>, EnvelopeTypeNoErrSchema, Error>
      >
    >(query)
  })

  test('result: "envelope" + unwrap: "throw-on-error" surfaces the unwrapped body', () => {
    const query = client.query({
      method: 'GET',
      url: '/u',
      responseSchema,
      errorSchema,
      result: 'envelope',
      unwrap: 'throw-on-error',
    })

    assertType<
      (params: {}) => UseSuspenseQueryOptions<
        ResponseType,
        Error,
        ResponseType,
        DataTag<Split<'/u', '/'>, ResponseType, Error>
      >
    >(query)
  })

  test('without result: legacy data-mode surface is unchanged', () => {
    const query = client.query({
      method: 'GET',
      url: '/u',
      responseSchema,
      errorSchema,
    })

    assertType<
      (params: {}) => UseSuspenseQueryOptions<
        ResponseType,
        Error,
        ResponseType,
        DataTag<Split<'/u', '/'>, ResponseType, Error>
      >
    >(query)
  })

  test('processResponse on result: "envelope" receives the envelope as input', () => {
    client.query({
      method: 'GET',
      url: '/u',
      responseSchema,
      errorSchema,
      result: 'envelope',
      processResponse: (data) => {
        assertType<EnvelopeType>(data)
        return data
      },
    })
  })
})

// ============================================================================
// INFINITE QUERY: result: 'envelope' inference
// ============================================================================

describe('client.infiniteQuery with result: "envelope"', () => {
  test('result: "envelope" surfaces ResponseEnvelope per page', () => {
    const query = client.infiniteQuery({
      method: 'GET',
      url: '/u',
      querySchema,
      responseSchema,
      errorSchema,
      result: 'envelope',
      getNextPageParam: () => undefined,
    })

    assertType<
      (params: {
        params: { page: number }
      }) => UseSuspenseInfiniteQueryOptions<
        EnvelopeType,
        Error,
        InfiniteData<EnvelopeType>,
        DataTag<Split<'/u', '/'>, EnvelopeType, Error>,
        z.output<typeof querySchema>
      >
    >(query)
  })

  test('result: "envelope" + unwrap: "pages" unwraps each page to body', () => {
    const query = client.infiniteQuery({
      method: 'GET',
      url: '/u',
      querySchema,
      responseSchema,
      errorSchema,
      result: 'envelope',
      unwrap: 'pages',
      getNextPageParam: () => undefined,
    })

    assertType<
      (params: {
        params: { page: number }
      }) => UseSuspenseInfiniteQueryOptions<
        ResponseType,
        Error,
        InfiniteData<ResponseType>,
        DataTag<Split<'/u', '/'>, ResponseType, Error>,
        z.output<typeof querySchema>
      >
    >(query)
  })

  test('result: "envelope" + unwrap: "throw-on-error" unwraps each page', () => {
    const query = client.infiniteQuery({
      method: 'GET',
      url: '/u',
      querySchema,
      responseSchema,
      errorSchema,
      result: 'envelope',
      unwrap: 'throw-on-error',
      getNextPageParam: () => undefined,
    })

    assertType<
      (params: {
        params: { page: number }
      }) => UseSuspenseInfiniteQueryOptions<
        ResponseType,
        Error,
        InfiniteData<ResponseType>,
        DataTag<Split<'/u', '/'>, ResponseType, Error>,
        z.output<typeof querySchema>
      >
    >(query)
  })
})

// ============================================================================
// MUTATION: result: 'envelope' inference
// ============================================================================

describe('client.mutation with result: "envelope"', () => {
  test('result: "envelope" surfaces ResponseEnvelope as mutation data', () => {
    const mutation = client.mutation({
      method: 'POST',
      url: '/u',
      requestSchema,
      responseSchema,
      errorSchema,
      result: 'envelope',
    })

    assertType<
      () => UseMutationResult<EnvelopeType, Error, { data: z.input<typeof requestSchema> }>
    >(mutation)
  })

  test('result: "envelope" + unwrap: "throw-on-error" unwraps mutation data', () => {
    const mutation = client.mutation({
      method: 'POST',
      url: '/u',
      requestSchema,
      responseSchema,
      errorSchema,
      result: 'envelope',
      unwrap: 'throw-on-error',
    })

    assertType<
      () => UseMutationResult<ResponseType, Error, { data: z.input<typeof requestSchema> }>
    >(mutation)
  })
})
