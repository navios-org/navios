import { assertType, describe, test } from 'vitest'
import { z as zod } from 'zod/v4'

import type { EndpointHandler, ErrorSchemaRecord } from '@navios/builder'
import type { UseMutationResult } from '@tanstack/react-query'
import type { z } from 'zod/v4'

import type { MutationHelpers } from '../../mutation/types.mjs'
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
  file: zod.instanceof(File),
  description: zod.string(),
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
// MULTIPART MUTATION METHOD
// ============================================================================
//
// Note: URL-param extraction and the combination matrix are exercised at the
// builder layer. The tests below focus on multipart-mutation-specific bits:
// that `File` schemas flow through the variables shape, that the same useKey
// and callback surface as `mutation()` applies, and that errorSchema
// suppresses error union in the return type (data mode).

describe('client.multipart() method', () => {
  test('POST multipart mutation surfaces File-bearing RequestType in variables', () => {
    const mutation = client.multipart({
      method: 'POST',
      url: '/upload',
      requestSchema,
      responseSchema,
    })

    assertType<() => UseMutationResult<ResponseType, Error, { data: RequestType }>>(mutation)
  })

  test('POST multipart mutation with URL params adds urlParams to variables', () => {
    const mutation = client.multipart({
      method: 'POST',
      url: '/users/$userId/avatar',
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

  describe('useKey option', () => {
    test('useKey: true requires urlParams in the outer call', () => {
      const mutation = client.multipart({
        method: 'POST',
        url: '/users/$userId/avatar',
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
      const mutation = client.multipart({
        method: 'POST',
        url: '/users/$userId/avatar',
        useKey: true,
        requestSchema,
        responseSchema,
      })

      assertType<MutationHelpers<'/users/$userId/avatar', ResponseType>['mutationKey']>(
        mutation.mutationKey,
      )
      assertType<MutationHelpers<'/users/$userId/avatar', ResponseType>['useIsMutating']>(
        mutation.useIsMutating,
      )
    })

    test('useKey: true + querySchema still requires urlParams only in outer call', () => {
      const mutation = client.multipart({
        method: 'POST',
        url: '/users/$userId/files',
        useKey: true,
        requestSchema,
        querySchema,
        responseSchema,
      })

      assertType<
        (params: { urlParams: { userId: string | number } }) => UseMutationResult<
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

  describe('callback options', () => {
    test('onMutate receives variables and default context', () => {
      client.multipart({
        method: 'POST',
        url: '/upload',
        requestSchema,
        responseSchema,
        onMutate: (variables, context) => {
          assertType<{ data: RequestType }>(variables)
          assertType<{ meta: Record<string, unknown> | undefined }>(context)
          return { previousFiles: [] }
        },
      })
    })

    test('onSuccess receives data, variables, and onMutate context', () => {
      client.multipart({
        method: 'POST',
        url: '/upload',
        requestSchema,
        responseSchema,
        onSuccess: (data, variables, context) => {
          assertType<ResponseType>(data)
          assertType<{ data: RequestType }>(variables)
          assertType<{ onMutateResult: unknown }>(context)
        },
      })
    })

    test('useContext overrides the context type seen by callbacks', () => {
      client.multipart({
        method: 'POST',
        url: '/upload',
        requestSchema,
        responseSchema,
        useContext: () => ({ uploadProgress: 0 }),
        onMutate: (_variables, context) => {
          assertType<{ uploadProgress: number }>(context)
        },
      })
    })
  })

  describe('errorSchema (errors thrown, not in return type)', () => {
    test('multipart mutation with errorSchema returns only success type', () => {
      const mutation = client.multipart({
        method: 'POST',
        url: '/upload',
        requestSchema,
        responseSchema,
        errorSchema,
      })

      assertType<() => UseMutationResult<ResponseType, Error, { data: RequestType }>>(mutation)
    })

    test('onSuccess receives only the success type when errorSchema is set', () => {
      client.multipart({
        method: 'POST',
        url: '/upload',
        requestSchema,
        responseSchema,
        errorSchema,
        onSuccess: (data) => {
          assertType<ResponseType>(data)
        },
      })
    })
  })

  describe('endpoint property', () => {
    test('multipart mutation exposes endpoint property with declared config', () => {
      const mutation = client.multipart({
        method: 'POST',
        url: '/upload',
        requestSchema,
        responseSchema,
      })

      assertType<
        EndpointHandler<{
          method: 'POST'
          url: '/upload'
          requestSchema: typeof requestSchema
          responseSchema: typeof responseSchema
        }>
      >(mutation.endpoint)
    })
  })
})

// ============================================================================
// ERROR CASES - Surface-specific
// ============================================================================

describe('multipart() error cases', () => {
  test('mutate() without data when requestSchema is defined', () => {
    const mutation = client.multipart({
      method: 'POST',
      url: '/upload',
      requestSchema,
      responseSchema,
    })

    const { mutate } = mutation()

    // @ts-expect-error - missing data
    mutate({})
  })

  test('useKey: true outer call requires urlParams', () => {
    const mutation = client.multipart({
      method: 'POST',
      url: '/users/$userId/avatar',
      useKey: true,
      requestSchema,
      responseSchema,
    })

    // @ts-expect-error - missing urlParams in call
    mutation()
  })

  test('mutate() rejects a string in place of a File-valued field', () => {
    const mutation = client.multipart({
      method: 'POST',
      url: '/upload',
      requestSchema,
      responseSchema,
    })

    const { mutate } = mutation()

    // @ts-expect-error - file should be File, not string
    mutate({ data: { file: 'not-a-file', description: 'test' } })
  })
})
