import type { ErrorSchemaRecord } from '@navios/builder'

import { builder } from '@navios/builder'
import { create } from '@navios/http'
import { makeNaviosFakeAdapter } from '@navios/http/testing'

import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import { makeMutation } from '../mutation/make-hook.mjs'
import { makeQueryOptions } from '../query/make-options.mjs'

vi.mock('@tanstack/react-query', async (importReal) => {
  const actual = await importReal<typeof import('@tanstack/react-query')>()
  const mockMutationContext = { mutationId: 1, meta: undefined }
  return {
    ...actual,
    useQuery: vi.fn(),
    useSuspenseQuery: vi.fn(),
    useQueryClient: () => ({
      getQueryData: vi.fn(),
      setQueryData: vi.fn(),
      invalidateQueries: vi.fn(),
      removeQueries: vi.fn(),
    }),
    useMutation: vi.fn((req) => ({
      ...req,
      mutateAsync: async (data: unknown) => {
        try {
          const onMutateResult = await req.onMutate?.(data, mockMutationContext)
          const res = await req.mutationFn(data)
          await req.onSuccess?.(res, data, onMutateResult, mockMutationContext)
          await req.onSettled?.(
            res,
            null,
            data,
            onMutateResult,
            mockMutationContext,
          )
          return res
        } catch (err) {
          const onMutateResult = undefined
          await req.onError?.(err, data, onMutateResult, mockMutationContext)
          await req.onSettled?.(
            undefined,
            err,
            data,
            onMutateResult,
            mockMutationContext,
          )
          throw err
        }
      },
      mutate: req.mutationFn,
    })),
  }
})

describe('errorSchema support', () => {
  const adapter = makeNaviosFakeAdapter()
  const api = builder({ useDiscriminatorResponse: true })
  api.provideClient(create({ adapter: adapter.fetch }))

  // Define schemas
  const responseSchema = z.object({ id: z.string(), name: z.string() })
  const requestSchema = z.object({ name: z.string() })

  const errorSchema = {
    400: z.object({ error: z.string(), code: z.number() }),
    404: z.object({ notFound: z.literal(true) }),
    500: z.object({ serverError: z.string() }),
  } satisfies ErrorSchemaRecord

  describe('makeQueryOptions with errorSchema', () => {
    const endpoint = api.declareEndpoint({
      method: 'GET',
      url: '/users/$userId' as const,
      responseSchema,
      errorSchema,
    })

    it('should pass success response through processResponse', async () => {
      adapter.mock('/users/1', 'GET', () => {
        return new Response(JSON.stringify({ id: '1', name: 'Test User' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      })

      // Use type assertion to work around vitest typecheck strict mode
      const options = makeQueryOptions(endpoint, {
        processResponse: (data: any) => {
          if ('error' in data) {
            return { type: 'error' as const, message: data.error }
          }
          if ('notFound' in data) {
            return { type: 'notFound' as const }
          }
          if ('serverError' in data) {
            return { type: 'serverError' as const, message: data.serverError }
          }
          return { type: 'success' as const, user: data }
        },
      })

      const queryOptions = options({ urlParams: { userId: '1' } })
      const result = await (queryOptions as any).queryFn?.({
        queryKey: ['', 'users', '$userId'],
        signal: new AbortController().signal,
        meta: undefined,
      })

      expect(result).toEqual({
        type: 'success',
        user: { id: '1', name: 'Test User' },
      })
    })

    it('should pass error response (400) through processResponse', async () => {
      adapter.mock('/users/2', 'GET', () => {
        return new Response(
          JSON.stringify({ error: 'Invalid user ID', code: 400 }),
          {
            status: 400,
            headers: { 'content-type': 'application/json' },
          },
        )
      })

      const options = makeQueryOptions(endpoint, {
        processResponse: (data: any) => {
          if ('error' in data) {
            return {
              type: 'error' as const,
              message: data.error,
              code: data.code,
            }
          }
          if ('notFound' in data) {
            return { type: 'notFound' as const }
          }
          if ('serverError' in data) {
            return { type: 'serverError' as const, message: data.serverError }
          }
          return { type: 'success' as const, user: data }
        },
      })

      const queryOptions = options({ urlParams: { userId: '2' } })
      const result = await (queryOptions as any).queryFn({
        queryKey: ['users', '2'],
        signal: new AbortController().signal,
        meta: undefined,
      })

      expect(result).toEqual({
        type: 'error',
        message: 'Invalid user ID',
        code: 400,
      })
    })

    it('should pass error response (404) through processResponse', async () => {
      adapter.mock('/users/999', 'GET', () => {
        return new Response(JSON.stringify({ notFound: true }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        })
      })

      const options = makeQueryOptions(endpoint, {
        processResponse: (data) => {
          if ('error' in data) {
            return { type: 'error' as const, message: data.error }
          }
          if ('notFound' in data) {
            return { type: 'notFound' as const }
          }
          if ('serverError' in data) {
            return { type: 'serverError' as const, message: data.serverError }
          }
          return { type: 'success' as const, user: data }
        },
      })

      const queryOptions = options({ urlParams: { userId: '999' } })
      const result = await (queryOptions as any).queryFn({
        queryKey: ['users', '999'],
        signal: new AbortController().signal,
        meta: undefined,
      })

      expect(result).toEqual({ type: 'notFound' })
    })

    it('should call onFail for actual errors (not API error responses)', async () => {
      adapter.mock('/users/error', 'GET', () => {
        throw new Error('Network error')
      })

      const onFail = vi.fn()
      const options = makeQueryOptions(endpoint, {
        processResponse: (data) => data,
        onFail,
      })

      const queryOptions = options({ urlParams: { userId: 'error' } })

      await expect(
        (queryOptions as any).queryFn({
          queryKey: ['users', 'error'],
          signal: new AbortController().signal,
          meta: undefined,
        }),
      ).rejects.toThrow('Network error')

      expect(onFail).toHaveBeenCalledTimes(1)
      expect(onFail.mock.calls[0][0]).toBeInstanceOf(Error)
    })
  })

  describe('makeMutation with errorSchema', () => {
    const mutationEndpoint = api.declareEndpoint({
      method: 'POST',
      url: '/users' as const,
      requestSchema,
      responseSchema,
      errorSchema,
    })

    it('should return success response as data', async () => {
      adapter.mock('/users', 'POST', () => {
        return new Response(JSON.stringify({ id: '1', name: 'Created User' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        })
      })

      const mutation = makeMutation(mutationEndpoint, {
        processResponse: (data) => {
          if ('error' in data) {
            return { ok: false as const, error: data.error }
          }
          if ('notFound' in data) {
            return { ok: false as const, error: 'Not found' }
          }
          if ('serverError' in data) {
            return { ok: false as const, error: data.serverError }
          }
          return { ok: true as const, user: data }
        },
      })

      const mutationResult = mutation(undefined as never)
      const result = await mutationResult.mutateAsync({
        data: { name: 'New User' },
      })

      expect(result).toEqual({
        ok: true,
        user: { id: '1', name: 'Created User' },
      })
    })

    it('should return error response (400) as data (not thrown)', async () => {
      adapter.mock('/users', 'POST', () => {
        return new Response(
          JSON.stringify({ error: 'Name is required', code: 400 }),
          {
            status: 400,
            headers: { 'content-type': 'application/json' },
          },
        )
      })

      const mutation = makeMutation(mutationEndpoint, {
        processResponse: (data) => {
          if ('error' in data) {
            return { ok: false as const, error: data.error, code: data.code }
          }
          if ('notFound' in data) {
            return { ok: false as const, error: 'Not found' }
          }
          if ('serverError' in data) {
            return { ok: false as const, error: data.serverError }
          }
          return { ok: true as const, user: data }
        },
      })

      const mutationResult = mutation(undefined as never)
      const result = await mutationResult.mutateAsync({
        data: { name: '' },
      })

      // Error response is returned, not thrown
      expect(result).toEqual({
        ok: false,
        error: 'Name is required',
        code: 400,
      })
    })

    it('should call onSuccess with error response data (when error response is returned)', async () => {
      adapter.mock('/users', 'POST', () => {
        return new Response(
          JSON.stringify({ error: 'Validation failed', code: 400 }),
          {
            status: 400,
            headers: { 'content-type': 'application/json' },
          },
        )
      })

      const onSuccess = vi.fn()

      const mutation = makeMutation(mutationEndpoint, {
        processResponse: (data) => data,
        onSuccess,
      })

      const mutationResult = mutation(undefined as never)
      await mutationResult.mutateAsync({
        data: { name: 'Test' },
      })

      expect(onSuccess).toHaveBeenCalledTimes(1)
      expect(onSuccess.mock.calls[0][0]).toEqual({
        error: 'Validation failed',
        code: 400,
        __status: 400,
      })
    })

    it('should call onError for actual network errors (not API error responses)', async () => {
      adapter.mock('/users', 'POST', () => {
        throw new Error('Network failure')
      })

      const onError = vi.fn()
      const onSuccess = vi.fn()

      const mutation = makeMutation(mutationEndpoint, {
        processResponse: (data) => data,
        onError,
        onSuccess,
      })

      const mutationResult = mutation(undefined as never)

      await expect(
        mutationResult.mutateAsync({
          data: { name: 'Test' },
        }),
      ).rejects.toThrow('Network failure')

      expect(onError).toHaveBeenCalledTimes(1)
      expect(onSuccess).not.toHaveBeenCalled()
    })
  })

  describe('endpoints without errorSchema', () => {
    const noErrorSchemaEndpoint = api.declareEndpoint({
      method: 'GET',
      url: '/simple' as const,
      responseSchema,
    })

    it('should work without errorSchema (backwards compatibility)', async () => {
      adapter.mock('/simple', 'GET', () => {
        return new Response(JSON.stringify({ id: '1', name: 'Simple' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      })

      const options = makeQueryOptions(noErrorSchemaEndpoint, {
        processResponse: (data) => data,
      })

      const queryOptions = options({})
      const result = await (queryOptions as any).queryFn({
        queryKey: ['simple'],
        signal: new AbortController().signal,
        meta: undefined,
      })

      expect(result).toEqual({ id: '1', name: 'Simple' })
    })
  })
})
