import { assertType, describe, test } from 'vitest'
import { z as zod } from 'zod/v4'

import type { ErrorSchemaRecord } from '@navios/builder'
import type { UseMutationResult } from '@tanstack/react-query'
import type { z } from 'zod/v4'

import type { MutationHelpers } from '../../mutation/types.mjs'
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
// MUTATION METHOD
// ============================================================================
//
// Note: URL-param extraction, querySchema/requestSchema input typing, and the
// (urlParams × params × data × error) combination matrix are exercised at the
// builder layer. The tests below focus on surface-specific bits: the
// `{ data, urlParams, params }` variables shape inside `UseMutationResult`,
// the `useKey: true` outer-call signature, callback types, and
// `useContext`-driven context overrides.

describe('client.mutation() method', () => {
  test('POST mutation surfaces RequestType in variables shape', () => {
    const mutation = client.mutation({
      method: 'POST',
      url: '/users',
      requestSchema,
      responseSchema,
    })

    assertType<() => UseMutationResult<ResponseType, Error, { data: RequestType }>>(mutation)
  })

  test('POST mutation with URL params adds urlParams to variables shape', () => {
    const mutation = client.mutation({
      method: 'POST',
      url: '/users/$userId/posts',
      requestSchema,
      responseSchema,
    })

    assertType<
      () => UseMutationResult<
        ResponseType,
        Error,
        { urlParams: { userId: string | number }; data: RequestType }
      >
    >(mutation)
  })

  test('POST mutation with query schema adds params to variables shape', () => {
    const mutation = client.mutation({
      method: 'POST',
      url: '/users',
      requestSchema,
      querySchema,
      responseSchema,
    })

    assertType<
      () => UseMutationResult<ResponseType, Error, { data: RequestType; params: QueryType }>
    >(mutation)
  })

  test('DELETE mutation without request schema omits data from variables', () => {
    const mutation = client.mutation({
      method: 'DELETE',
      url: '/users/$userId',
      responseSchema,
    })

    assertType<
      () => UseMutationResult<ResponseType, Error, { urlParams: { userId: string | number } }>
    >(mutation)
  })

  describe('useKey option', () => {
    test('useKey: true requires urlParams in the outer call', () => {
      const mutation = client.mutation({
        method: 'POST',
        url: '/users/$userId',
        useKey: true,
        requestSchema,
        responseSchema,
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

    test('useKey: true attaches MutationHelpers', () => {
      const mutation = client.mutation({
        method: 'POST',
        url: '/users/$userId',
        useKey: true,
        requestSchema,
        responseSchema,
      })

      assertType<MutationHelpers<'/users/$userId', ResponseType>['mutationKey']>(
        mutation.mutationKey,
      )
      assertType<MutationHelpers<'/users/$userId', ResponseType>['useIsMutating']>(
        mutation.useIsMutating,
      )
    })

    test('useKey: true without URL params still takes a () call', () => {
      const mutation = client.mutation({
        method: 'DELETE',
        url: '/cache',
        useKey: true,
        responseSchema,
      })

      assertType<(params: {}) => UseMutationResult<ResponseType, Error, {}>>(mutation)
    })
  })

  describe('callback options', () => {
    test('onMutate receives variables and default context', () => {
      client.mutation({
        method: 'POST',
        url: '/users',
        requestSchema,
        responseSchema,
        onMutate: (variables, context) => {
          assertType<{ data: RequestType }>(variables)
          assertType<{ meta: Record<string, unknown> | undefined }>(context)
          return { previousData: [] }
        },
      })
    })

    test('onSuccess receives data, variables, and onMutate context', () => {
      client.mutation({
        method: 'POST',
        url: '/users',
        requestSchema,
        responseSchema,
        onSuccess: (data, variables, context) => {
          assertType<ResponseType>(data)
          assertType<{ data: RequestType }>(variables)
          assertType<{ onMutateResult: unknown }>(context)
        },
      })
    })

    test('onError receives error, variables, and context', () => {
      client.mutation({
        method: 'POST',
        url: '/users',
        requestSchema,
        responseSchema,
        onError: (error, variables, context) => {
          assertType<Error>(error)
          assertType<{ data: RequestType }>(variables)
          assertType<{ onMutateResult: unknown }>(context)
        },
      })
    })

    test('onSettled receives data, error, variables, and context', () => {
      client.mutation({
        method: 'POST',
        url: '/users',
        requestSchema,
        responseSchema,
        onSettled: (data, error, variables, context) => {
          assertType<ResponseType | undefined>(data)
          assertType<Error | null>(error)
          assertType<{ data: RequestType }>(variables)
          assertType<{ onMutateResult: unknown }>(context)
        },
      })
    })

    test('useContext overrides the context type seen by callbacks', () => {
      client.mutation({
        method: 'POST',
        url: '/users',
        requestSchema,
        responseSchema,
        useContext: () => ({ queryClient: {} as unknown }),
        onMutate: (_variables, context) => {
          assertType<{ queryClient: unknown }>(context)
        },
      })
    })
  })

  describe('errorSchema (errors thrown, not in return type)', () => {
    test('mutation with errorSchema still returns only success type', () => {
      const mutation = client.mutation({
        method: 'POST',
        url: '/users',
        requestSchema,
        responseSchema,
        errorSchema,
      })

      assertType<() => UseMutationResult<ResponseType, Error, { data: RequestType }, unknown>>(
        mutation,
      )
    })

    test('onSuccess receives only the success type when errorSchema is set', () => {
      client.mutation({
        method: 'POST',
        url: '/users',
        requestSchema,
        responseSchema,
        errorSchema,
        onSuccess: (data) => {
          assertType<ResponseType>(data)
        },
      })
    })
  })

  describe('EndpointHelper', () => {
    test('mutation exposes endpoint property with declared config', () => {
      const mutation = client.mutation({
        method: 'POST',
        url: '/users',
        requestSchema,
        responseSchema,
      })

      assertType<
        EndpointHelper<{
          method: 'POST'
          url: '/users'
          requestSchema: typeof requestSchema
          responseSchema: typeof responseSchema
        }>['endpoint']
      >(mutation.endpoint)
    })
  })
})

// ============================================================================
// ERROR CASES - Surface-specific. We assert the surface preserves errors on
// the `mutate()` call (the inner function returned by `mutation()`), since
// the builder-instance suite doesn't model the mutate signature.
// ============================================================================

describe('mutation() error cases', () => {
  test('mutate() without data when requestSchema is defined', () => {
    const mutation = client.mutation({
      method: 'POST',
      url: '/users',
      requestSchema,
      responseSchema,
    })

    const { mutate } = mutation()

    // @ts-expect-error - missing data
    mutate({})
  })

  test('mutate() without urlParams when URL has params', () => {
    const mutation = client.mutation({
      method: 'POST',
      url: '/users/$userId',
      requestSchema,
      responseSchema,
    })

    const { mutate } = mutation()

    // @ts-expect-error - missing urlParams
    mutate({ data: { name: 'test', email: 'test@test.com' } })
  })

  test('useKey: true outer call requires urlParams', () => {
    const mutation = client.mutation({
      method: 'POST',
      url: '/users/$userId',
      useKey: true,
      requestSchema,
      responseSchema,
    })

    // @ts-expect-error - missing urlParams in call
    mutation()
  })

  test('mutate() with wrong data shape is rejected', () => {
    const mutation = client.mutation({
      method: 'POST',
      url: '/users',
      requestSchema,
      responseSchema,
    })

    const { mutate } = mutation()

    // @ts-expect-error - wrong property names
    mutate({ data: { username: 'test', mail: 'test@test.com' } })
  })
})
