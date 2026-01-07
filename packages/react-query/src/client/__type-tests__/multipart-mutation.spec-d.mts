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
  file: zod.instanceof(File),
  description: zod.string(),
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
// MULTIPART MUTATION METHOD - DEFAULT MODE (UseDiscriminator=false)
// ============================================================================

describe('ClientInstance<false> multipartMutation() method', () => {
  describe('POST multipart mutations', () => {
    test('POST multipart mutation with request schema', () => {
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

    test('POST multipart mutation with URL params', () => {
      const mutation = client.multipartMutation({
        method: 'POST',
        url: '/users/$userId/avatar',
        requestSchema,
        responseSchema,
        processResponse: (data) => data,
      })

      assertType<
        () => UseMutationResult<
          ResponseType,
          Error,
          { urlParams: { userId: string | number }; data: RequestType }
        >
      >(mutation)
    })

    test('POST multipart mutation with multiple URL params', () => {
      const mutation = client.multipartMutation({
        method: 'POST',
        url: '/orgs/$orgId/users/$userId/avatar',
        requestSchema,
        responseSchema,
        processResponse: (data) => data,
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

    test('POST multipart mutation with query schema', () => {
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

    test('POST multipart mutation with all schemas', () => {
      const mutation = client.multipartMutation({
        method: 'POST',
        url: '/users/$userId/files',
        requestSchema,
        querySchema,
        responseSchema,
        processResponse: (data) => data,
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

    test('POST multipart mutation with custom result type', () => {
      const mutation = client.multipartMutation({
        method: 'POST',
        url: '/upload',
        requestSchema,
        responseSchema,
        processResponse: (data) => ({
          uploaded: true,
          fileId: data.id,
        }),
      })

      assertType<
        () => UseMutationResult<
          { uploaded: boolean; fileId: string },
          Error,
          { data: RequestType }
        >
      >(mutation)
    })
  })

  describe('PUT multipart mutations', () => {
    test('PUT multipart mutation', () => {
      const mutation = client.multipartMutation({
        method: 'PUT',
        url: '/files/$fileId',
        requestSchema,
        responseSchema,
        processResponse: (data) => data,
      })

      assertType<
        () => UseMutationResult<
          ResponseType,
          Error,
          { urlParams: { fileId: string | number }; data: RequestType }
        >
      >(mutation)
    })
  })

  describe('PATCH multipart mutations', () => {
    test('PATCH multipart mutation', () => {
      const mutation = client.multipartMutation({
        method: 'PATCH',
        url: '/files/$fileId',
        requestSchema,
        responseSchema,
        processResponse: (data) => data,
      })

      assertType<
        () => UseMutationResult<
          ResponseType,
          Error,
          { urlParams: { fileId: string | number }; data: RequestType }
        >
      >(mutation)
    })
  })

  describe('useKey option', () => {
    test('multipart mutation with useKey requires urlParams in call', () => {
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

    test('multipart mutation with useKey has MutationHelpers', () => {
      const mutation = client.multipartMutation({
        method: 'POST',
        url: '/users/$userId/avatar',
        useKey: true,
        requestSchema,
        responseSchema,
        processResponse: (data) => data,
      })

      assertType<
        MutationHelpers<'/users/$userId/avatar', ResponseType>['mutationKey']
      >(mutation.mutationKey)
      assertType<
        MutationHelpers<'/users/$userId/avatar', ResponseType>['useIsMutating']
      >(mutation.useIsMutating)
    })

    test('multipart mutation with useKey and querySchema', () => {
      const mutation = client.multipartMutation({
        method: 'POST',
        url: '/users/$userId/files',
        useKey: true,
        requestSchema,
        querySchema,
        responseSchema,
        processResponse: (data) => data,
      })

      assertType<
        (params: {
          urlParams: { userId: string | number }
        }) => UseMutationResult<
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

    test('multipart mutation with useKey without URL params', () => {
      const mutation = client.multipartMutation({
        method: 'POST',
        url: '/upload',
        useKey: true,
        requestSchema,
        responseSchema,
        processResponse: (data) => data,
      })

      assertType<
        (params: {}) => UseMutationResult<
          ResponseType,
          Error,
          { data: RequestType }
        >
      >(mutation)
    })
  })

  describe('callback options', () => {
    test('onMutate receives variables and context', () => {
      client.multipartMutation({
        method: 'POST',
        url: '/upload',
        requestSchema,
        responseSchema,
        processResponse: (data) => data,
        onMutate: (variables, context) => {
          assertType<{ data: RequestType }>(variables)
          assertType<{ meta: Record<string, unknown> | undefined }>(context)
          return { previousFiles: [] }
        },
      })
    })

    test('onSuccess receives data, variables, and context', () => {
      client.multipartMutation({
        method: 'POST',
        url: '/upload',
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
      client.multipartMutation({
        method: 'POST',
        url: '/upload',
        requestSchema,
        responseSchema,
        processResponse: (data) => data,
        onError: (error, variables, context) => {
          assertType<Error>(error)
          assertType<{ data: RequestType }>(variables)
          assertType<{ onMutateResult: unknown }>(context)
        },
      })
    })

    test('onSettled receives data, error, variables, and context', () => {
      client.multipartMutation({
        method: 'POST',
        url: '/upload',
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
      client.multipartMutation({
        method: 'POST',
        url: '/upload',
        requestSchema,
        responseSchema,
        processResponse: (data) => data,
        useContext: () => ({ uploadProgress: 0 }),
        onMutate: (_variables, context) => {
          assertType<{ uploadProgress: number }>(context)
        },
      })
    })
  })

  describe('errorSchema (errors thrown, not in return type)', () => {
    test('multipart mutation with errorSchema returns only success type', () => {
      const mutation = client.multipartMutation({
        method: 'POST',
        url: '/upload',
        requestSchema,
        responseSchema,
        errorSchema,
        processResponse: (data) => data,
      })

      assertType<
        () => UseMutationResult<ResponseType, Error, { data: RequestType }>
      >(mutation)
    })

    test('processResponse receives only success type', () => {
      client.multipartMutation({
        method: 'POST',
        url: '/upload',
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
    test('multipart mutation exposes endpoint property', () => {
      const mutation = client.multipartMutation({
        method: 'POST',
        url: '/upload',
        requestSchema,
        responseSchema,
        processResponse: (data) => data,
      })

      assertType<
        EndpointHelper<
          'POST',
          '/upload',
          typeof requestSchema,
          typeof responseSchema
        >['endpoint']
      >(mutation.endpoint)
    })

    test('multipart mutation with querySchema exposes endpoint', () => {
      const mutation = client.multipartMutation({
        method: 'POST',
        url: '/upload',
        requestSchema,
        querySchema,
        responseSchema,
        processResponse: (data) => data,
      })

      assertType<
        EndpointHelper<
          'POST',
          '/upload',
          typeof requestSchema,
          typeof responseSchema,
          typeof querySchema
        >['endpoint']
      >(mutation.endpoint)
    })
  })
})

// ============================================================================
// MULTIPART MUTATION METHOD - DISCRIMINATOR MODE (UseDiscriminator=true)
// ============================================================================

describe('ClientInstance<true> multipartMutation() method (discriminator mode)', () => {
  describe('errorSchema includes error union in TData', () => {
    test('multipart mutation with errorSchema returns union result type', () => {
      const mutation = clientWithDiscriminator.multipartMutation({
        method: 'POST',
        url: '/upload',
        requestSchema,
        responseSchema,
        errorSchema,
        processResponse: (data) => data,
      })

      assertType<
        () => UseMutationResult<
          ResponseWithErrors,
          Error,
          { data: RequestType }
        >
      >(mutation)
    })

    test('processResponse receives union type', () => {
      clientWithDiscriminator.multipartMutation({
        method: 'POST',
        url: '/upload',
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
      type ExpectedResult =
        | { ok: false; error: ErrorUnion }
        | { ok: true; data: ResponseType }

      const mutation = clientWithDiscriminator.multipartMutation({
        method: 'POST',
        url: '/upload',
        requestSchema,
        responseSchema,
        errorSchema,
        processResponse: (data): ExpectedResult => {
          // Use 'id' property to discriminate - only ResponseType has 'id'
          if ('id' in data) {
            return { ok: true, data }
          }
          return { ok: false, error: data }
        },
      })

      assertType<
        () => UseMutationResult<ExpectedResult, Error, { data: RequestType }>
      >(mutation)
    })

    test('onSuccess receives union type', () => {
      clientWithDiscriminator.multipartMutation({
        method: 'POST',
        url: '/upload',
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
    test('multipart mutation without errorSchema returns only success type', () => {
      const mutation = clientWithDiscriminator.multipartMutation({
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
  })
})

// ============================================================================
// ERROR CASES - Should fail type checking
// ============================================================================

describe('multipartMutation() error cases', () => {
  describe('missing required parameters in variables', () => {
    test('multipartMutation().mutate() without data', () => {
      const mutation = client.multipartMutation({
        method: 'POST',
        url: '/upload',
        requestSchema,
        responseSchema,
        processResponse: (data) => data,
      })

      const { mutate } = mutation()

      // @ts-expect-error - missing data
      mutate({})
    })

    test('multipartMutation().mutate() without urlParams when URL has params', () => {
      const mutation = client.multipartMutation({
        method: 'POST',
        url: '/users/$userId/avatar',
        requestSchema,
        responseSchema,
        processResponse: (data) => data,
      })

      const { mutate } = mutation()

      // @ts-expect-error - missing urlParams
      mutate({ data: { file: new File([], 'test.txt'), description: 'test' } })
    })

    test('multipartMutation().mutate() without params when querySchema is defined', () => {
      const mutation = client.multipartMutation({
        method: 'POST',
        url: '/upload',
        requestSchema,
        querySchema,
        responseSchema,
        processResponse: (data) => data,
      })

      const { mutate } = mutation()

      // @ts-expect-error - missing params
      mutate({ data: { file: new File([], 'test.txt'), description: 'test' } })
    })
  })

  describe('missing useKey call params', () => {
    test('multipart mutation with useKey called without urlParams', () => {
      const mutation = client.multipartMutation({
        method: 'POST',
        url: '/users/$userId/avatar',
        useKey: true,
        requestSchema,
        responseSchema,
        processResponse: (data) => data,
      })

      // @ts-expect-error - missing urlParams in call
      mutation()
    })
  })

  describe('wrong parameter types in variables', () => {
    test('data with wrong shape', () => {
      const mutation = client.multipartMutation({
        method: 'POST',
        url: '/upload',
        requestSchema,
        responseSchema,
        processResponse: (data) => data,
      })

      const { mutate } = mutation()

      // @ts-expect-error - wrong property names
      mutate({ data: { document: new File([], 'test.txt'), desc: 'test' } })
    })

    test('data with wrong value types', () => {
      const mutation = client.multipartMutation({
        method: 'POST',
        url: '/upload',
        requestSchema,
        responseSchema,
        processResponse: (data) => data,
      })

      const { mutate } = mutation()

      // @ts-expect-error - file should be File, not string
      mutate({ data: { file: 'not-a-file', description: 'test' } })
    })

    test('urlParams with wrong type', () => {
      const mutation = client.multipartMutation({
        method: 'POST',
        url: '/users/$userId/avatar',
        requestSchema,
        responseSchema,
        processResponse: (data) => data,
      })

      const { mutate } = mutation()

      mutate({
        urlParams: {
          // @ts-expect-error - userId should be string | number, not boolean
          userId: true,
        },
        data: { file: new File([], 'test.txt'), description: 'test' },
      })
    })

    test('params with wrong shape', () => {
      const mutation = client.multipartMutation({
        method: 'POST',
        url: '/upload',
        requestSchema,
        querySchema,
        responseSchema,
        processResponse: (data) => data,
      })

      const { mutate } = mutation()

      mutate({
        data: { file: new File([], 'test.txt'), description: 'test' },
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
      client.multipartMutation({
        method: 'POST',
        url: '/upload',
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
      client.multipartMutation({
        method: 'POST',
        url: '/upload',
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
