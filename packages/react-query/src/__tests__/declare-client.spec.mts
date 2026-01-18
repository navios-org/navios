import { builder } from '@navios/builder'
import { create } from '@navios/http'
import { makeNaviosFakeAdapter } from '@navios/http/testing'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import { declareClient } from '../client/declare-client.mjs'

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
      onSuccess(data, variables, context) {
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
        expect(context).toHaveProperty('mutationId')
        expect(context).toHaveProperty('onMutateResult')
      },
      onError: (err, _variables, context) => {
        console.log('onError', err, context)
      },
    })

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

  it('should work with queryFromEndpoint', async () => {
    const client = declareClient({
      api,
    })

    const endpoint = api.declareEndpoint({
      url: '/test/$id/foo/$foo' as const,
      method: 'GET',
      responseSchema,
    })

    const query = client.queryFromEndpoint(endpoint, {
      processResponse: (data) => data,
    })

    expect(query).toBeDefined()
    expect(typeof query).toBe('function')
  })

  it('should work with infiniteQueryFromEndpoint', async () => {
    const client = declareClient({
      api,
    })

    const endpoint = api.declareEndpoint({
      url: '/test/$id/foo/$foo' as const,
      method: 'GET',
      responseSchema,
      querySchema: z.object({
        page: z.number(),
      }),
    })

    const query = client.infiniteQueryFromEndpoint(endpoint, {
      processResponse: (data) => data,
      getNextPageParam: (_lastPage, allPages) => {
        return { page: allPages.length + 1 }
      },
    })

    expect(query).toBeDefined()
    expect(typeof query).toBe('function')
  })

  it('should work with mutationFromEndpoint', async () => {
    const client = declareClient({
      api,
    })

    const endpoint = api.declareEndpoint({
      url: '/test/$testId/foo/$fooId' as const,
      method: 'POST',
      requestSchema: z.object({
        testId: z.string(),
      }),
      responseSchema: z.object({
        success: z.literal(true),
        test: z.string(),
      }),
    })

    const mutation = client.mutationFromEndpoint(endpoint, {
      processResponse: (data) => data,
    })

    expect(mutation).toBeDefined()
    expect(typeof mutation).toBe('function')
  })

  it('should work with multipartMutation', async () => {
    const client = declareClient({
      api,
    })

    adapter.mock('/upload', 'POST', () => {
      return new Response(
        JSON.stringify({
          success: true,
          fileId: 'file-123',
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

    const mutation = client.multipartMutation({
      url: '/upload' as const,
      method: 'POST',
      requestSchema: z.object({
        file: z.instanceof(File),
        description: z.string(),
      }),
      responseSchema: z.object({
        success: z.literal(true),
        fileId: z.string(),
      }),
      processResponse: (data) => data,
    })

    expect(mutation).toBeDefined()
    expect(typeof mutation).toBe('function')
  })

  it('should work with defaults configuration', async () => {
    const client = declareClient({
      api,
      defaults: {
        keyPrefix: ['api', 'v1'],
        keySuffix: ['cache'],
      },
    })

    const query = client.query({
      url: '/test/$id' as const,
      method: 'GET',
      responseSchema: z.object({ id: z.string() }),
      processResponse: (data) => data,
    })

    expect(query).toBeDefined()
  })

  it('should attach endpoint to query options', async () => {
    const client = declareClient({
      api,
    })

    const query = client.query({
      url: '/test/$id' as const,
      method: 'GET',
      responseSchema: z.object({ id: z.string() }),
      processResponse: (data) => data,
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((query as any).endpoint).toBeDefined()
  })

  it('should attach endpoint to infinite query options', async () => {
    const client = declareClient({
      api,
    })

    const query = client.infiniteQuery({
      url: '/test' as const,
      method: 'GET',
      responseSchema: z.object({ items: z.array(z.string()) }),
      querySchema: z.object({ page: z.number() }),
      processResponse: (data) => data,
      getNextPageParam: (_lastPage, allPages) => ({ page: allPages.length + 1 }),
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((query as any).endpoint).toBeDefined()
  })

  it('should attach endpoint to mutation', async () => {
    const client = declareClient({
      api,
    })

    const mutation = client.mutation({
      url: '/test' as const,
      method: 'POST',
      requestSchema: z.object({ name: z.string() }),
      responseSchema: z.object({ id: z.string() }),
      processResponse: (data) => data,
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((mutation as any).endpoint).toBeDefined()
  })

  it('should work with query without processResponse (uses default)', async () => {
    const client = declareClient({
      api,
    })

    const query = client.query({
      url: '/test/$id' as const,
      method: 'GET',
      responseSchema: z.object({ id: z.string() }),
    })

    expect(query).toBeDefined()
  })

  it('should work with mutation lifecycle hooks', async () => {
    const client = declareClient({
      api,
    })

    const onMutate = vi.fn().mockReturnValue({ startTime: Date.now() })
    const onSettled = vi.fn()

    adapter.mock('/lifecycle-test', 'POST', () => {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
      })
    })

    const mutation = client.mutation({
      url: '/lifecycle-test' as const,
      method: 'POST',
      requestSchema: z.object({ value: z.string() }),
      responseSchema: z.object({ success: z.boolean() }),
      processResponse: (data) => data,
      onMutate,
      onSettled,
    })

    const mutationResult = mutation()
    await mutationResult.mutateAsync({ data: { value: 'test' } })

    expect(onMutate).toHaveBeenCalled()
    expect(onSettled).toHaveBeenCalled()
  })
})
