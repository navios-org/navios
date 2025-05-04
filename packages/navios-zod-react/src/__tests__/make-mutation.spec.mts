import { create } from 'navios'
import { makeNaviosFakeAdapter } from 'navios/testing'

import { declareAPI } from '@navios/navios-zod'

import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { makeMutation } from '../make-mutation.mjs'

vi.mock('@tanstack/react-query', async (importReal) => {
  const actual = await importReal<typeof import('@tanstack/react-query')>()
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
          const res = await req.mutationFn(data)
          await req.onSuccess?.(res, data)
          return res
        } catch (err) {
          req.onError?.(err, data)
          throw err
        }
      },
      mutate: req.mutationFn,
    })),
  }
})

describe('makeMutation', () => {
  const adapter = makeNaviosFakeAdapter()
  const api = declareAPI({})
  api.provideClient(create({ adapter: adapter.fetch }))
  const responseSchema = z.discriminatedUnion('success', [
    z.object({ success: z.literal(true), test: z.string() }),
    z.object({ success: z.literal(false), message: z.string() }),
  ])
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
      processResponse: (data) => {
        if (!data.success) {
          throw new Error(data.message)
        }
        return data
      },
      onSuccess: (queryClient, data, variables) => {
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
      },

      onError: (err) => {
        console.log('onError', err)
      },
    })
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
      processResponse: (data) => {
        if (!data.success) {
          throw new Error(data.message)
        }
        return data
      },
      useKey: true,
    })
    const mutationResult = mutation({
      fooId: '2',
      testId: '1',
    })
    console.log('mutationResult', mutationResult)

    // @ts-expect-error from mock
    expect(mutationResult.mutationKey).toMatchObject(['test', '1', 'foo', '2'])
  })
})
