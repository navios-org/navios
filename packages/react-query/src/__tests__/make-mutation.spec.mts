import { builder } from '@navios/builder'
import { create } from '@navios/http'
import { makeNaviosFakeAdapter } from '@navios/http/testing'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import { makeMutation } from '../mutation/make-hook.mjs'

vi.mock('@tanstack/react-query', async (importReal) => {
  const actual = await importReal<typeof import('@tanstack/react-query')>()
  const mockMutationContext = { mutationId: 1, meta: undefined }
  return {
    ...actual,
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
          await req.onSettled?.(res, null, data, onMutateResult, mockMutationContext)
          return res
        } catch (err) {
          const onMutateResult = undefined
          await req.onError?.(err, data, onMutateResult, mockMutationContext)
          await req.onSettled?.(undefined, err, data, onMutateResult, mockMutationContext)
          throw err
        }
      },
      mutate: req.mutationFn,
    })),
  }
})

describe('makeMutation', () => {
  const adapter = makeNaviosFakeAdapter()
  const api = builder({})
  api.provideClient(create({ adapter: adapter.fetch }))
  const responseSchema = z.discriminatedUnion('success', [
    z.object({ success: z.literal(true), test: z.string() }),
    z.object({ success: z.literal(false), message: z.string() }),
  ])
  type ResponseType = z.output<typeof responseSchema>
  const endpoint = api.declareEndpoint({
    method: 'POST',
    url: '/test/$testId/foo/$fooId' as const,
    requestSchema: z.object({
      testId: z.string(),
      fooId: z.string(),
    }),
    querySchema: z.object({ foo: z.string() }),
    responseSchema,
  })
  adapter.mock('/test/1/foo/2', 'POST', () => {
    return new Response(
      JSON.stringify({
        success: true,
        test: 'test',
      }),
      {
        status: 200,
        statusText: 'OK',
        headers: {
          'content-type': 'application/json',
        },
      },
    )
  })

  it('should just work', async () => {
    const mutation = makeMutation(endpoint, {
      processResponse: (data: ResponseType) => {
        if (!data.success) {
          throw new Error(data.message)
        }
        return data
      },
      onSuccess: (data, variables, context) => {
        expect(data).toMatchObject({
          success: true,
          test: 'test',
        })
        expect(variables).toMatchObject({
          urlParams: {
            testId: '1',
            fooId: '2',
          },
          data: {
            testId: '1',
            fooId: '2',
          },
          params: {
            foo: 'bar',
          },
        })
        expect(context).toHaveProperty('mutationId')
        expect(context).toHaveProperty('onMutateResult')
      },

      onError: (err, _variables, context) => {
        console.log('onError', err, context)
      },
    })
    // @ts-expect-error internal type
    const mutationResult = mutation()
    await mutationResult.mutateAsync({
      urlParams: {
        testId: '1',
        fooId: '2',
      },
      data: {
        testId: '1',
        fooId: '2',
      },
      params: {
        foo: 'bar',
      },
    })
  })

  it('should work with a key', async () => {
    const mutation = makeMutation(endpoint, {
      processResponse: (data: ResponseType) => {
        if (!data.success) {
          throw new Error(data.message)
        }
        return data
      },
      useKey: true,
    })
    const mutationResult = mutation({
      urlParams: {
        fooId: '2',
        testId: '1',
      },
    })
    console.log('mutationResult', mutationResult)

    // @ts-expect-error from mock
    expect(mutationResult.mutationKey).toMatchObject(['test', '1', 'foo', '2'])
  })

  describe('stream mutations', () => {
    const streamEndpoint = api.declareStream({
      method: 'GET',
      url: '/files/$fileId/download' as const,
    })

    adapter.mock('/files/123/download', 'GET', () => {
      const blob = new Blob(['test file content'], { type: 'text/plain' })
      return new Response(blob, {
        status: 200,
        statusText: 'OK',
        headers: {
          'content-type': 'application/octet-stream',
        },
      })
    })

    it('should work without processResponse (returns Blob)', async () => {
      // @ts-expect-error stream endpoint type differs from regular endpoint
      const mutation = makeMutation(streamEndpoint, {})
      // @ts-expect-error internal type
      const mutationResult = mutation()

      const result = await mutationResult.mutateAsync({
        urlParams: { fileId: '123' },
      })

      expect(result).toBeInstanceOf(Blob)
    })

    it('should work with processResponse transformation', async () => {
      // @ts-expect-error stream endpoint type differs from regular endpoint
      const mutation = makeMutation(streamEndpoint, {
        processResponse: (blob: Blob) => URL.createObjectURL(blob),
      })
      // @ts-expect-error internal type
      const mutationResult = mutation()

      const result = await mutationResult.mutateAsync({
        urlParams: { fileId: '123' },
      })

      expect(typeof result).toBe('string')
      expect(result).toContain('blob:')
    })

    it('should call onSuccess with Blob data and context', async () => {
      const onSuccess = vi.fn()
      // @ts-expect-error stream endpoint type differs from regular endpoint
      const mutation = makeMutation(streamEndpoint, {
        onSuccess,
      })
      // @ts-expect-error internal type
      const mutationResult = mutation()

      await mutationResult.mutateAsync({
        urlParams: { fileId: '123' },
      })

      expect(onSuccess).toHaveBeenCalledTimes(1)
      expect(onSuccess.mock.calls[0][0]).toBeInstanceOf(Blob)
      expect(onSuccess.mock.calls[0][1]).toMatchObject({
        urlParams: { fileId: '123' },
      })
      // Third argument should be context with onMutateResult and mutationId
      expect(onSuccess.mock.calls[0][2]).toHaveProperty('onMutateResult')
      expect(onSuccess.mock.calls[0][2]).toHaveProperty('mutationId')
    })
  })

  describe('mutation callbacks', () => {
    it('should call onMutate before mutation and pass result to other callbacks', async () => {
      const callOrder: string[] = []
      const onMutate = vi.fn((_variables, _context) => {
        callOrder.push('onMutate')
        return { optimisticId: 'temp-123' }
      })
      const onSuccess = vi.fn((_data, _variables, context) => {
        callOrder.push('onSuccess')
        expect(context.onMutateResult).toEqual({ optimisticId: 'temp-123' })
      })
      const onSettled = vi.fn((_data, _error, _variables, context) => {
        callOrder.push('onSettled')
        expect(context.onMutateResult).toEqual({ optimisticId: 'temp-123' })
      })

      const mutation = makeMutation(endpoint, {
        processResponse: (data: ResponseType) => {
          if (!data.success) throw new Error(data.message)
          return data
        },
        onMutate,
        onSuccess,
        onSettled,
      })

      // @ts-expect-error internal type
      const mutationResult = mutation()
      await mutationResult.mutateAsync({
        urlParams: { testId: '1', fooId: '2' },
        data: { testId: '1', fooId: '2' },
        params: { foo: 'bar' },
      })

      expect(callOrder).toEqual(['onMutate', 'onSuccess', 'onSettled'])
      expect(onMutate).toHaveBeenCalledTimes(1)
      expect(onSuccess).toHaveBeenCalledTimes(1)
      expect(onSettled).toHaveBeenCalledTimes(1)
    })

    it('should call onError and onSettled on failure', async () => {
      adapter.mock('/test/1/foo/2', 'POST', () => {
        return new Response(JSON.stringify({ success: false, message: 'Test error' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      })

      const onError = vi.fn()
      const onSettled = vi.fn()

      const mutation = makeMutation(endpoint, {
        processResponse: (data: ResponseType) => {
          if (!data.success) throw new Error(data.message)
          return data
        },
        onError,
        onSettled,
      })

      // @ts-expect-error internal type
      const mutationResult = mutation()

      await expect(
        mutationResult.mutateAsync({
          urlParams: { testId: '1', fooId: '2' },
          data: { testId: '1', fooId: '2' },
          params: { foo: 'bar' },
        }),
      ).rejects.toThrow('Test error')

      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError.mock.calls[0][0]).toBeInstanceOf(Error)
      expect(onError.mock.calls[0][0].message).toBe('Test error')
      expect(onSettled).toHaveBeenCalledTimes(1)
      expect(onSettled.mock.calls[0][1]).toBeInstanceOf(Error)

      // Restore the mock
      adapter.mock('/test/1/foo/2', 'POST', () => {
        return new Response(JSON.stringify({ success: true, test: 'test' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      })
    })

    it('should merge useContext result with MutationFunctionContext', async () => {
      const useContext = () => ({
        queryClient: { invalidate: vi.fn() },
        customValue: 'test',
      })

      const onSuccess = vi.fn()

      const mutation = makeMutation(endpoint, {
        processResponse: (data: ResponseType) => {
          if (!data.success) throw new Error(data.message)
          return data
        },
        useContext,
        onSuccess,
      })

      // @ts-expect-error internal type
      const mutationResult = mutation()
      await mutationResult.mutateAsync({
        urlParams: { testId: '1', fooId: '2' },
        data: { testId: '1', fooId: '2' },
        params: { foo: 'bar' },
      })

      expect(onSuccess).toHaveBeenCalledTimes(1)
      const context = onSuccess.mock.calls[0][2]
      expect(context).toHaveProperty('queryClient')
      expect(context).toHaveProperty('customValue', 'test')
      expect(context).toHaveProperty('mutationId')
      expect(context).toHaveProperty('onMutateResult')
    })
  })
})
