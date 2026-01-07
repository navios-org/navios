import type { ErrorSchemaRecord } from '@navios/builder'
import type { UseMutationResult } from '@tanstack/react-query'
import type { z } from 'zod/v4'

import { assertType, describe, test } from 'vitest'
import { z as zod } from 'zod/v4'

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
// MUTATION METHOD - DEFAULT MODE (UseDiscriminator=false)
// ============================================================================

describe('ClientInstance<false> mutation() method', () => {
  describe('POST mutations', () => {
    test('POST mutation with request schema only', () => {
      const mutation = client.mutation({
        method: 'POST',
        url: '/users',
        requestSchema,
        responseSchema,
      })

      assertType<
        () => UseMutationResult<ResponseType, Error, { data: RequestType }>
      >(mutation)
    })

    test('POST mutation with processResponse', () => {
      const mutation = client.mutation({
        method: 'POST',
        url: '/users',
        requestSchema,
        responseSchema,
        processResponse: (data) => data,
      })

      assertType<
        () => UseMutationResult<ResponseType, Error, { data: RequestType }>
      >(mutation)
    })

    test('POST mutation with URL params', () => {
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

    test('POST mutation with multiple URL params', () => {
      const mutation = client.mutation({
        method: 'POST',
        url: '/orgs/$orgId/users/$userId/posts',
        requestSchema,
        responseSchema,
      })

      assertType<
        () => UseMutationResult<
          ResponseType,
          Error,
          {
            urlParams: { orgId: string | number; userId: string | number }
            data: RequestType
          }
        >
      >(mutation)
    })

    test('POST mutation with query schema', () => {
      const mutation = client.mutation({
        method: 'POST',
        url: '/users',
        requestSchema,
        querySchema,
        responseSchema,
      })

      assertType<
        () => UseMutationResult<
          ResponseType,
          Error,
          { data: RequestType; params: QueryType }
        >
      >(mutation)
    })

    test('POST mutation with all schemas', () => {
      const mutation = client.mutation({
        method: 'POST',
        url: '/users/$userId',
        requestSchema,
        querySchema,
        responseSchema,
      })

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

    test('POST mutation with custom result type', () => {
      const mutation = client.mutation({
        method: 'POST',
        url: '/users',
        requestSchema,
        responseSchema,
        processResponse: (data) => ({ processed: true, name: data.name }),
      })

      assertType<
        () => UseMutationResult<
          { processed: boolean; name: string },
          Error,
          { data: RequestType }
        >
      >(mutation)
    })
  })

  describe('PUT mutations', () => {
    test('PUT mutation with URL params', () => {
      const mutation = client.mutation({
        method: 'PUT',
        url: '/users/$userId',
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
  })

  describe('PATCH mutations', () => {
    test('PATCH mutation with URL params and query schema', () => {
      const mutation = client.mutation({
        method: 'PATCH',
        url: '/users/$userId',
        requestSchema,
        querySchema,
        responseSchema,
      })

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
  })

  describe('DELETE mutations', () => {
    test('DELETE mutation without request schema', () => {
      const mutation = client.mutation({
        method: 'DELETE',
        url: '/users/$userId',
        responseSchema,
      })

      assertType<
        () => UseMutationResult<
          ResponseType,
          Error,
          { urlParams: { userId: string | number } }
        >
      >(mutation)
    })

    test('DELETE mutation with query schema', () => {
      const mutation = client.mutation({
        method: 'DELETE',
        url: '/cache',
        querySchema,
        responseSchema,
      })

      assertType<
        () => UseMutationResult<ResponseType, Error, { params: QueryType }>
      >(mutation)
    })

    test('DELETE mutation with URL params and query schema', () => {
      const mutation = client.mutation({
        method: 'DELETE',
        url: '/users/$userId',
        querySchema,
        responseSchema,
      })

      assertType<
        () => UseMutationResult<
          ResponseType,
          Error,
          { urlParams: { userId: string | number }; params: QueryType }
        >
      >(mutation)
    })
  })

  describe('useKey option', () => {
    test('POST mutation with useKey requires urlParams in call', () => {
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

    test('mutation with useKey has MutationHelpers', () => {
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
      assertType<
        MutationHelpers<'/users/$userId', ResponseType>['useIsMutating']
      >(mutation.useIsMutating)
    })

    test('DELETE mutation with useKey and URL params', () => {
      const mutation = client.mutation({
        method: 'DELETE',
        url: '/users/$userId',
        useKey: true,
        responseSchema,
      })

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

    test('DELETE mutation with useKey and querySchema', () => {
      const mutation = client.mutation({
        method: 'DELETE',
        url: '/users/$userId',
        useKey: true,
        querySchema,
        responseSchema,
      })

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

    test('mutation with useKey without URL params', () => {
      const mutation = client.mutation({
        method: 'DELETE',
        url: '/cache',
        useKey: true,
        responseSchema,
      })

      assertType<(params: {}) => UseMutationResult<ResponseType, Error, {}>>(
        mutation,
      )
    })
  })

  describe('callback options', () => {
    test('onMutate receives variables and context', () => {
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

    test('onSuccess receives data, variables, and context', () => {
      client.mutation({
        method: 'POST',
        url: '/users',
        requestSchema,
        responseSchema,
        processResponse: (data) => data,
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
        processResponse: (data) => data,
        onSettled: (data, error, variables, context) => {
          assertType<ResponseType | undefined>(data)
          assertType<Error | null>(error)
          assertType<{ data: RequestType }>(variables)
          assertType<{ onMutateResult: unknown }>(context)
        },
      })
    })

    test('useContext provides custom context', () => {
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
    test('mutation with errorSchema returns only success type', () => {
      const mutation = client.mutation({
        method: 'POST',
        url: '/users',
        requestSchema,
        responseSchema,
        errorSchema,
      })

      assertType<
        () => UseMutationResult<
          ResponseType,
          Error,
          { data: RequestType },
          unknown
        >
      >(mutation)
    })

    test('processResponse receives only success type', () => {
      client.mutation({
        method: 'POST',
        url: '/users',
        requestSchema,
        responseSchema,
        errorSchema,
        processResponse: (data) => {
          assertType<ResponseType>(data)
          return data
        },
      })
    })
  })

  describe('EndpointHelper', () => {
    test('mutation exposes endpoint property', () => {
      const mutation = client.mutation({
        method: 'POST',
        url: '/users',
        requestSchema,
        responseSchema,
      })

      assertType<
        EndpointHelper<
          {
            method: 'POST'
            url: '/users'
            querySchema: undefined
            requestSchema: typeof requestSchema
            responseSchema: typeof responseSchema
            errorSchema: undefined
            urlParamsSchema: undefined
          },
          false
        >['endpoint']
      >(mutation.endpoint)
    })
  })
})

// ============================================================================
// MUTATION METHOD - DISCRIMINATOR MODE (UseDiscriminator=true)
// ============================================================================

describe('ClientInstance<true> mutation() method (discriminator mode)', () => {
  describe('errorSchema includes error union in TData', () => {
    test('POST mutation with errorSchema returns union result type', () => {
      const mutation = clientWithDiscriminator.mutation({
        method: 'POST',
        url: '/users',
        requestSchema,
        responseSchema,
        errorSchema,
      })

      assertType<
        () => UseMutationResult<
          ResponseWithErrors,
          Error,
          { data: RequestType },
          unknown
        >
      >(mutation)
    })

    test('processResponse receives union type', () => {
      clientWithDiscriminator.mutation({
        method: 'POST',
        url: '/users',
        requestSchema,
        responseSchema,
        errorSchema,
        processResponse: (data) => {
          assertType<ResponseWithErrors>(data)
          return data
        },
      })
    })

    test('processResponse can transform union type', () => {
      // Note: This test verifies processResponse receives the union type.
      // The exact return type assertion is complex due to readonly inference.
      clientWithDiscriminator.mutation({
        method: 'POST',
        url: '/users',
        requestSchema,
        responseSchema,
        errorSchema,
        processResponse: (data): { handled: boolean; original: typeof data } => {
          assertType<ResponseWithErrors>(data)
          return { handled: true, original: data }
        },
      })
    })

    test('onSuccess receives union type', () => {
      clientWithDiscriminator.mutation({
        method: 'POST',
        url: '/users',
        requestSchema,
        responseSchema,
        errorSchema,
        processResponse: (data) => data,
        onSuccess: (data) => {
          assertType<ResponseWithErrors>(data)
        },
      })
    })
  })

  describe('without errorSchema behaves same as default', () => {
    test('mutation without errorSchema returns only success type', () => {
      const mutation = clientWithDiscriminator.mutation({
        method: 'POST',
        url: '/users',
        requestSchema,
        responseSchema,
      })

      assertType<
        () => UseMutationResult<
          ResponseType,
          Error,
          { data: RequestType },
          unknown
        >
      >(mutation)
    })
  })
})

// ============================================================================
// ERROR CASES - Should fail type checking
// ============================================================================

describe('mutation() error cases', () => {
  describe('missing required parameters in variables', () => {
    test('mutation().mutate() without data when requestSchema is defined', () => {
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

    test('mutation().mutate() without urlParams when URL has params', () => {
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

    test('mutation().mutate() without params when querySchema is defined', () => {
      const mutation = client.mutation({
        method: 'POST',
        url: '/users',
        requestSchema,
        querySchema,
        responseSchema,
      })

      const { mutate } = mutation()

      // @ts-expect-error - missing params
      mutate({ data: { name: 'test', email: 'test@test.com' } })
    })
  })

  describe('missing useKey call params', () => {
    test('mutation with useKey called without urlParams', () => {
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
  })

  describe('wrong parameter types in variables', () => {
    test('data with wrong shape', () => {
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

    test('data with wrong value types', () => {
      const mutation = client.mutation({
        method: 'POST',
        url: '/users',
        requestSchema,
        responseSchema,
      })

      const { mutate } = mutation()

      // @ts-expect-error - name should be string, not number
      mutate({ data: { name: 123, email: 'test@test.com' } })
    })

    test('urlParams with wrong type', () => {
      const mutation = client.mutation({
        method: 'POST',
        url: '/users/$userId',
        requestSchema,
        responseSchema,
      })

      const { mutate } = mutation()

      mutate({
        // @ts-expect-error - userId should be string | number, not boolean
        urlParams: { userId: true },
        data: { name: 'test', email: 'test@test.com' },
      })
    })

    test('params with wrong shape', () => {
      const mutation = client.mutation({
        method: 'POST',
        url: '/users',
        requestSchema,
        querySchema,
        responseSchema,
      })

      const { mutate } = mutation()

      mutate({
        data: { name: 'test', email: 'test@test.com' },
        params: {
          // @ts-expect-error - wrong property names
          offset: 0,
          count: 10,
        },
      })
    })
  })

  describe('processResponse type safety', () => {
    test('processResponse receives correct input type', () => {
      client.mutation({
        method: 'POST',
        url: '/users',
        requestSchema,
        responseSchema,
        processResponse: (data) => {
          // @ts-expect-error - data doesn't have 'nonExistent' property
          return data.nonExistent
        },
      })
    })
  })

  describe('callback type safety', () => {
    test('onSuccess data type matches processResponse result', () => {
      client.mutation({
        method: 'POST',
        url: '/users',
        requestSchema,
        responseSchema,
        processResponse: (data) => ({ transformed: data.name }),
        onSuccess: (data) => {
          // @ts-expect-error - data is { transformed: string }, not ResponseType
          const _id: string = data.id
        },
      })
    })
  })
})
