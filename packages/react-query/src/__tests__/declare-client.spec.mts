import { create } from 'navios'
import { makeNaviosFakeAdapter } from 'navios/testing'

import { builder } from '@navios/common'

import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { declareClient } from '../declare-client.mjs'

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
describe('declareClient', () => {
  const adapter = makeNaviosFakeAdapter()
  const api = builder({})
  api.provideClient(create({ adapter: adapter.fetch }))
  const responseSchema = z.discriminatedUnion('success', [
    z.object({ success: z.literal(true), test: z.string() }),
    z.object({ success: z.literal(false), message: z.string() }),
  ])
  adapter.mock('/test/1/foo/2', 'GET', () => {
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
  adapter.mock('/test/1/foo/2', 'POST', (str, req) => {
    return new Response(
      JSON.stringify({
        success: true,
        // @ts-expect-error this is a test
        test: JSON.parse(req?.body).testId,
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

  it('should create a query with the correct options', async () => {
    const client = declareClient({
      api,
    })

    const query = client.query({
      url: '/test/$id/foo/$foo' as const,
      method: 'GET',
      responseSchema,
      querySchema: z.object({
        id: z.string(),
      }),
      processResponse(data) {
        if (!data.success) {
          throw new Error(data.message)
        }
        return data
      },
    })

    expect(query).toBeDefined()
  })

  it('should work with infinite queries', async () => {
    const client = declareClient({
      api,
    })
    const query = client.infiniteQuery({
      url: '/test/$id/foo/$foo' as const,
      method: 'GET',
      responseSchema,
      querySchema: z.object({
        page: z.number(),
        id: z.string(),
      }),
      processResponse(data) {
        if (!data.success) {
          throw new Error(data.message)
        }
        return data
      },
      getNextPageParam(lastPage, allPages) {
        if (lastPage.success) {
          return { page: allPages.length + 1, id: 'foo' }
        }
        return undefined
      },
    })

    expect(query).toBeDefined()
  })

  it('should work with mutations', async () => {
    const client = declareClient({
      api,
    })

    const mutation = client.mutation({
      url: '/test/$testId/foo/$fooId' as const,
      method: 'POST',
      requestSchema: z.object({
        testId: z.string(),
      }),
      responseSchema: z.object({
        success: z.literal(true),
        test: z.string(),
      }),
      processResponse: (data) => {
        if (!data.success) {
          throw new Error('error')
        }
        return data
      },
      onSuccess(queryClient, data, variables) {
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
            testId: 'test',
          },
        })
      },
      onError: (err) => {
        console.log('onError', err)
      },
    })

    // @ts-expect-error it's internal type
    const mutationResult = mutation()
    const res = await mutationResult.mutateAsync({
      urlParams: {
        testId: '1',
        fooId: '2',
      },
      data: {
        testId: 'test',
      },
    })

    expect(res).toMatchObject({
      success: true,
      test: 'test',
    })
  })
})
