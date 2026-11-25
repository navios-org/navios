import { EndpointError } from '@navios/builder'
import { MutationObserver } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import { setHttpClient } from '../endpoint/http-client.mjs'

import { makeHttp, setup } from './helpers.mjs'

const hooks = vi.hoisted(() => ({
  // Hand the options straight back so a test can run them through a real
  // MutationObserver — real TanStack callbacks, no React renderer.
  useMutation: vi.fn((options: unknown) => options),
  useIsMutating: vi.fn((_filters: unknown) => 0),
}))

vi.mock('@tanstack/react-query', async (importReal) => ({
  ...(await importReal<typeof import('@tanstack/react-query')>()),
  ...hooks,
}))

const userSchema = z.object({ id: z.string(), name: z.string() })

describe('client.mutation', () => {
  let ctx: ReturnType<typeof setup>

  /** Runs a mutation hook's options through a real observer. */
  function run(mutation: () => unknown, variables: unknown) {
    const observer = new MutationObserver(ctx.queryClient, mutation() as never)
    return observer.mutate(variables as never)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ctx = setup(() => ({ data: { id: '1', name: 'Saved' } }))
  })

  it('calls the endpoint with the variables and resolves with parsed data', async () => {
    const updateUser = ctx.client.mutation({
      method: 'PATCH',
      url: '/users/$userId',
      requestSchema: z.object({ name: z.string() }),
      responseSchema: userSchema,
    })

    const data = await run(updateUser, { urlParams: { userId: 1 }, data: { name: 'Saved' } })

    expect(data).toEqual({ id: '1', name: 'Saved' })
    expect(ctx.http.calls[0]).toMatchObject({
      method: 'PATCH',
      url: '/users/1',
      data: { name: 'Saved' },
    })
  })

  it('always sets a mutation key of [method, url]', () => {
    const scoped = ctx.client.mutation(
      ctx.api.declareEndpoint({ method: 'POST', url: '/users', responseSchema: z.any() }),
      { keyPrefix: ['tenant'] },
    )
    expect(scoped.mutationKey).toEqual(['tenant', 'POST', '/users'])
    expect(scoped()).toMatchObject({ mutationKey: ['tenant', 'POST', '/users'] })
  })

  it('passes TanStack options such as scope and retry through', () => {
    const create = ctx.client.mutation({
      method: 'POST',
      url: '/users',
      responseSchema: z.any(),
      scope: { id: 'users' },
      retry: 2,
      meta: { audit: true },
    })
    expect(create()).toMatchObject({ scope: { id: 'users' }, retry: 2, meta: { audit: true } })
  })

  it('hands callbacks the TanStack context merged with useContext', async () => {
    const onMutate = vi.fn(() => 'snapshot')
    const onSuccess = vi.fn()
    const onSettled = vi.fn()
    const create = ctx.client.mutation({
      method: 'POST',
      url: '/users',
      responseSchema: userSchema,
      useContext: () => ({ toast: 'toast-fn' }),
      onMutate,
      onSuccess,
      onSettled,
    })

    await run(create, undefined)

    expect(onMutate).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ toast: 'toast-fn', client: ctx.queryClient }),
    )
    expect(onSuccess).toHaveBeenCalledWith(
      { id: '1', name: 'Saved' },
      undefined,
      expect.objectContaining({
        toast: 'toast-fn',
        client: ctx.queryClient,
        onMutateResult: 'snapshot',
      }),
    )
    expect(onSettled).toHaveBeenCalledWith(
      { id: '1', name: 'Saved' },
      null,
      undefined,
      expect.objectContaining({ onMutateResult: 'snapshot' }),
    )
  })

  it('gives onError the typed EndpointError', async () => {
    ctx.http.respond(() => ({ status: 409, data: { reason: 'taken' } }))
    const onError = vi.fn()
    const create = ctx.client.mutation({
      method: 'POST',
      url: '/users',
      responseSchema: userSchema,
      errorSchema: { 409: z.object({ reason: z.string() }) },
      onError,
    })

    const error = await run(create, undefined).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(EndpointError)
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'http', status: 409, body: { reason: 'taken' } }),
      undefined,
      expect.objectContaining({ client: ctx.queryClient }),
    )
  })

  describe('invalidates', () => {
    it('invalidates whole endpoints and computed keys after success', async () => {
      const getUser = ctx.client.query({
        method: 'GET',
        url: '/users/$userId',
        responseSchema: z.any(),
      })
      const listUsers = ctx.client.query({ method: 'GET', url: '/users', responseSchema: z.any() })
      const other = ctx.client.query({ method: 'GET', url: '/teams', responseSchema: z.any() })
      getUser.setData(ctx.queryClient, { urlParams: { userId: 1 } }, 'u1')
      getUser.setData(ctx.queryClient, { urlParams: { userId: 2 } }, 'u2')
      listUsers.setData(ctx.queryClient, {}, 'list')
      other.setData(ctx.queryClient, {}, 'teams')

      const updateUser = ctx.client.mutation({
        method: 'PATCH',
        url: '/users/$userId',
        responseSchema: z.any(),
        invalidates: [
          listUsers,
          (_data, variables) => getUser.key({ urlParams: variables.urlParams }),
        ],
      })
      await run(updateUser, { urlParams: { userId: 1 } })

      const invalidated = ctx.queryClient
        .getQueryCache()
        .getAll()
        .filter((q) => q.state.isInvalidated)
        .map((q) => q.state.data)
        .sort()
      expect(invalidated).toEqual(['list', 'u1'])
    })

    it('does not invalidate when the mutation fails', async () => {
      ctx.http.respond(() => ({ status: 500 }))
      const listUsers = ctx.client.query({ method: 'GET', url: '/users', responseSchema: z.any() })
      listUsers.setData(ctx.queryClient, {}, 'list')
      const create = ctx.client.mutation({
        method: 'POST',
        url: '/users',
        responseSchema: z.any(),
        invalidates: [listUsers],
      })

      await run(create, undefined).catch(() => {})

      expect(ctx.queryClient.getQueryState(listUsers.key())?.isInvalidated).toBe(false)
    })
  })

  describe('optimistic', () => {
    function declare() {
      const getUser = ctx.client.query({
        method: 'GET',
        url: '/users/$userId',
        responseSchema: userSchema,
      })
      const updateUser = ctx.client.mutation({
        method: 'PATCH',
        url: '/users/$userId',
        requestSchema: z.object({ name: z.string() }),
        responseSchema: userSchema,
        optimistic: (update) =>
          update(getUser, {
            args: (variables) => ({ urlParams: variables.urlParams }),
            update: (current, variables) => current && { ...current, ...variables.data },
          }),
      })
      const args = { urlParams: { userId: 1 } }
      getUser.setData(ctx.queryClient, args, { id: '1', name: 'Before' })
      return { getUser, updateUser, args }
    }

    it('applies the update before the request and invalidates on settle', async () => {
      const { getUser, updateUser, args } = declare()
      let seenDuringRequest: unknown
      ctx.http.respond(() => {
        seenDuringRequest = getUser.getData(ctx.queryClient, args)
        return { data: { id: '1', name: 'Server' } }
      })

      await run(updateUser, { ...args, data: { name: 'Optimistic' } })

      expect(seenDuringRequest).toEqual({ id: '1', name: 'Optimistic' })
      expect(ctx.queryClient.getQueryState(getUser.key(args))?.isInvalidated).toBe(true)
    })

    it('restores the previous value when the mutation fails', async () => {
      const { getUser, updateUser, args } = declare()
      ctx.http.respond(() => ({ status: 500 }))

      await run(updateUser, { ...args, data: { name: 'Optimistic' } }).catch(() => {})

      expect(getUser.getData(ctx.queryClient, args)).toEqual({ id: '1', name: 'Before' })
    })

    it('keeps concurrent mutations apart', async () => {
      const { getUser, updateUser } = declare()
      const one = { urlParams: { userId: 1 } }
      const two = { urlParams: { userId: 2 } }
      getUser.setData(ctx.queryClient, two, { id: '2', name: 'Two before' })
      ctx.http.respond((config) =>
        config.url === '/users/1' ? { status: 500 } : { data: { id: '2', name: 'Two server' } },
      )

      await Promise.allSettled([
        run(updateUser, { ...one, data: { name: 'One optimistic' } }),
        run(updateUser, { ...two, data: { name: 'Two optimistic' } }),
      ])

      expect(getUser.getData(ctx.queryClient, one)).toEqual({ id: '1', name: 'Before' })
      expect(getUser.getData(ctx.queryClient, two)).toEqual({ id: '2', name: 'Two optimistic' })
    })

    it('respects rollbackOnError: false and invalidateOnSettled: false', async () => {
      const list = ctx.client.query({ method: 'GET', url: '/users', responseSchema: z.any() })
      list.setData(ctx.queryClient, {}, ['a'])
      ctx.http.respond(() => ({ status: 500 }))
      const create = ctx.client.mutation({
        method: 'POST',
        url: '/users',
        responseSchema: z.any(),
        optimistic: (update) => [
          update(list, {
            update: (current: string[] | undefined) => [...(current ?? []), 'b'],
            rollbackOnError: false,
            invalidateOnSettled: false,
          }),
        ],
      })

      await run(create, undefined).catch(() => {})

      expect(list.getData(ctx.queryClient)).toEqual(['a', 'b'])
      expect(ctx.queryClient.getQueryState(list.key())?.isInvalidated).toBe(false)
    })
  })

  describe('optimistic rollback edge cases', () => {
    it('empties an entry again when it had no data before the mutation', async () => {
      const list = ctx.client.query({
        method: 'GET',
        url: '/todos',
        responseSchema: z.array(z.string()),
      })
      const create = ctx.client.mutation({
        method: 'POST',
        url: '/todos',
        requestSchema: z.object({ title: z.string() }),
        responseSchema: z.any(),
        optimistic: (update) =>
          update(list, { update: (current, v) => [...(current ?? []), v.data.title] }),
      })
      ctx.http.respond(() => ({ status: 500 }))

      await run(create, { data: { title: 'never saved' } }).catch(() => {})

      expect(list.getData(ctx.queryClient)).toBeUndefined()
    })

    it('restores the original value when two overlapping mutations on one entry both fail', async () => {
      const getUser = ctx.client.query({
        method: 'GET',
        url: '/users/$userId',
        responseSchema: userSchema,
      })
      const updateUser = ctx.client.mutation({
        method: 'PATCH',
        url: '/users/$userId',
        requestSchema: z.object({ name: z.string() }),
        responseSchema: userSchema,
        optimistic: (update) =>
          update(getUser, {
            args: (variables) => ({ urlParams: variables.urlParams }),
            update: (current, variables) => current && { ...current, ...variables.data },
            invalidateOnSettled: false,
          }),
      })
      const args = { urlParams: { userId: 1 } }
      getUser.setData(ctx.queryClient, args, { id: '1', name: 'Before' })
      ctx.http.respond(() => ({ status: 500 }))

      await Promise.allSettled([
        run(updateUser, { ...args, data: { name: 'A' } }),
        run(updateUser, { ...args, data: { name: 'B' } }),
      ])

      expect(getUser.getData(ctx.queryClient, args)).toEqual({ id: '1', name: 'Before' })
    })

    it('keeps a still-pending update when an overlapping one fails', async () => {
      const list = ctx.client.query({
        method: 'GET',
        url: '/todos',
        responseSchema: z.array(z.string()),
      })
      const create = ctx.client.mutation({
        method: 'POST',
        url: '/todos',
        requestSchema: z.object({ title: z.string() }),
        responseSchema: z.any(),
        optimistic: (update) =>
          update(list, {
            update: (current, v) => [...(current ?? []), v.data.title],
            invalidateOnSettled: false,
          }),
      })
      list.setData(ctx.queryClient, {}, ['kept'])
      let release!: () => void
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      ctx.http.respond((config) =>
        (config.data as { title: string }).title === 'fails' ? { status: 500 } : { data: {} },
      )
      const slow = ctx.http.client.request
      ctx.http.client.request = (async (config: never) => {
        if ((config as { data: { title: string } }).data.title === 'slow') await gate
        return slow(config)
      }) as never

      const pending = run(create, { data: { title: 'slow' } })
      await run(create, { data: { title: 'fails' } }).catch(() => {})

      // The failed update is gone; the one still in flight stays applied.
      expect(list.getData(ctx.queryClient)).toEqual(['kept', 'slow'])
      release()
      await pending
      expect(list.getData(ctx.queryClient)).toEqual(['kept', 'slow'])
    })
  })

  describe('useIsMutating', () => {
    it('filters by the endpoint key', () => {
      const create = ctx.client.mutation({ method: 'POST', url: '/users', responseSchema: z.any() })
      hooks.useIsMutating.mockReturnValueOnce(2)

      expect(create.useIsMutating()).toBe(true)
      expect(hooks.useIsMutating).toHaveBeenCalledWith({ mutationKey: ['POST', '/users'] })
    })

    it('narrows to matching urlParams', () => {
      const update = ctx.client.mutation({
        method: 'PATCH',
        url: '/users/$userId',
        responseSchema: z.any(),
      })

      expect(update.useIsMutating({ urlParams: { userId: 1 } })).toBe(false)

      const filters = hooks.useIsMutating.mock.calls[0]?.[0] as {
        predicate: (mutation: unknown) => boolean
      }
      expect(filters.predicate({ state: { variables: { urlParams: { userId: '1' } } } })).toBe(true)
      expect(filters.predicate({ state: { variables: { urlParams: { userId: 2 } } } })).toBe(false)
      expect(filters.predicate({ state: { variables: undefined } })).toBe(false)
    })
  })

  it('uses the HTTP client bound to the QueryClient', async () => {
    const perRequest = makeHttp(() => ({ data: { id: '9', name: 'Per request' } }))
    setHttpClient(ctx.queryClient, perRequest.client)
    const create = ctx.client.mutation({
      method: 'POST',
      url: '/users',
      responseSchema: userSchema,
    })

    await expect(run(create, undefined)).resolves.toEqual({ id: '9', name: 'Per request' })
    expect(ctx.http.calls).toHaveLength(0)
  })

  it('withResponse delivers the status and headers with the data', async () => {
    ctx.http.respond(() => ({
      status: 201,
      data: { id: '1', name: 'Saved' },
      headers: { location: '/users/1' },
    }))
    const onSuccess = vi.fn()
    const create = ctx.client.mutation({
      method: 'POST',
      url: '/users',
      responseSchema: userSchema,
      withResponse: true,
      onSuccess,
    })

    const result = await run(create, undefined)

    const expected = {
      data: { id: '1', name: 'Saved' },
      response: { status: 201, statusText: 'OK', headers: { location: '/users/1' } },
    }
    expect(result).toEqual(expected)
    expect(onSuccess).toHaveBeenCalledWith(expected, undefined, expect.anything())
  })

  it('passes an inline `responses` map through to the endpoint', async () => {
    ctx.http.respond(() => ({ status: 204, data: '' }))
    const save = ctx.client.mutation({
      method: 'PUT',
      url: '/users/$id',
      responses: { 200: userSchema, 204: null },
      withResponse: true,
    })

    const result = await run(save, { urlParams: { id: 1 } })

    expect(result).toMatchObject({ data: undefined, response: { status: 204 } })
    expect(save.endpoint.config.responses).toBeDefined()
  })

  it('works for multipart endpoints without a separate method', async () => {
    const upload = ctx.client.mutation({
      method: 'POST',
      url: '/files',
      body: 'multipart',
      requestSchema: z.object({ file: z.instanceof(File) }),
      responseSchema: z.any(),
    })

    await run(upload, { data: { file: new File(['x'], 'x.txt') } })

    expect(ctx.http.calls[0]?.data).toBeInstanceOf(FormData)
  })
})
