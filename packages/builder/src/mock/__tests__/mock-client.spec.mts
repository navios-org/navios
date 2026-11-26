import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import { builder } from '../../http/builder.mjs'
import { getFilename } from '../../http/response-headers.mjs'
import { NaviosError } from '../../shared/navios-error.mjs'
import { createMockClient } from '../mock-client.mjs'

import type { Client } from '../../http/client.mjs'

const userSchema = z.object({ id: z.string(), name: z.string() })

function setup(options?: Parameters<typeof createMockClient>[0]) {
  const mocks = createMockClient(options)
  const api = builder({ client: mocks })
  const getUser = api.declareEndpoint({
    method: 'GET',
    url: '/users/$userId',
    responseSchema: userSchema,
    errorSchema: { 404: z.object({ message: z.string() }) },
  })
  const getMe = api.declareEndpoint({ method: 'GET', url: '/users/me', responseSchema: userSchema })
  return { mocks, api, getUser, getMe }
}

describe('createMockClient', () => {
  it('answers a mocked endpoint with the arguments of the call', async () => {
    const { mocks, getUser } = setup()
    mocks.on(getUser, ({ urlParams }) => ({ id: String(urlParams.userId), name: 'Ada' }))

    await expect(getUser({ urlParams: { userId: 7 } })).resolves.toEqual({ id: '7', name: 'Ada' })
  })

  it('matches endpoints by identity, not by URL', async () => {
    const { mocks, getUser, getMe } = setup()
    mocks.on(getMe, () => ({ id: 'me', name: 'Me' }))
    mocks.on(getUser, () => ({ id: 'other', name: 'Other' }))

    await expect(getMe()).resolves.toEqual({ id: 'me', name: 'Me' })
    await expect(getUser({ urlParams: { userId: 'me' } })).resolves.toEqual({
      id: 'other',
      name: 'Other',
    })
  })

  it('validates what a mock returns like a real response', async () => {
    const { mocks, getUser } = setup()
    mocks.on(getUser, () => ({ id: 1, name: 'Ada' }) as never)

    const result = await getUser.safe({ urlParams: { userId: 1 } })

    expect(result.error?.kind).toBe('response-validation')
  })

  it('copies a JSON body as the wire would', async () => {
    const { mocks, api } = setup()
    const shared = { at: new Date('2026-01-02T03:04:05.000Z') }
    const getEvent = api.declareEndpoint({
      method: 'GET',
      url: '/event',
      responseSchema: z.object({ at: z.string() }),
      validateResponse: false,
    })
    mocks.on(getEvent, () => shared as never)

    const event = await getEvent()

    expect(event).toEqual({ at: '2026-01-02T03:04:05.000Z' })
    expect(event).not.toBe(shared)
  })

  it('answers with another status, a typed body and headers through respond', async () => {
    const { mocks, getUser, api } = setup()
    mocks.on(getUser, (_, { respond }) => respond(404, { message: 'No such user' }))
    const download = api.declareEndpoint({ method: 'GET', url: '/report', response: 'blob' })
    const file = new Blob(['a,b'], { type: 'text/csv' })
    mocks.on(download, (_, { respond }) =>
      respond(200, file, { headers: { 'content-disposition': 'attachment; filename="r.csv"' } }),
    )

    const missing = await getUser.safe({ urlParams: { userId: 1 } })
    const report = await download.safe()

    expect(missing.error).toMatchObject({
      kind: 'http',
      status: 404,
      body: { message: 'No such user' },
    })
    expect(missing.error?.response?.statusText).toBe('Not Found')
    expect(report.data).toBe(file)
    expect(getFilename(report.response)).toBe('r.csv')
  })

  it('sends a plain return with the first declared success status', async () => {
    const { mocks, api } = setup()
    const create = api.declareEndpoint({
      method: 'POST',
      url: '/users',
      responses: { 201: userSchema, 204: null },
    })
    const remove = api.declareEndpoint({ method: 'DELETE', url: '/users/$id', response: 'void' })
    mocks.on(create, () => ({ id: '1', name: 'Ada' }))
    mocks.on(remove, () => undefined)

    const created = await create.safe()
    const removed = await remove.safe({ urlParams: { id: 1 } })

    expect(created.response?.status).toBe(201)
    expect(removed).toMatchObject({ ok: true, data: undefined, response: { status: 204 } })
  })

  it('answers queued once mocks first, then the persistent one', async () => {
    const { mocks, getUser } = setup()
    mocks.on(getUser, () => ({ id: '1', name: 'Persistent' }))
    mocks.once(getUser, (_, { respond }) => respond(404, { message: 'first' }))
    mocks.once(getUser, () => ({ id: '1', name: 'Second' }))

    const first = await getUser.safe({ urlParams: { userId: 1 } })
    const second = await getUser({ urlParams: { userId: 1 } })
    const third = await getUser({ urlParams: { userId: 1 } })

    expect(first.error?.status).toBe(404)
    expect(second.name).toBe('Second')
    expect(third.name).toBe('Persistent')
  })

  it('removes mocks with the returned function, off and reset', async () => {
    const { mocks, getUser, getMe } = setup()
    const remove = mocks.on(getUser, () => ({ id: '1', name: 'Ada' }))
    mocks.on(getMe, () => ({ id: 'me', name: 'Me' }))
    expect(mocks.has(getUser)).toBe(true)

    remove()
    expect(mocks.has(getUser)).toBe(false)
    mocks.off(getMe)
    expect(mocks.has(getMe)).toBe(false)

    mocks.on(getMe, () => ({ id: 'me', name: 'Me' }))
    await getMe()
    mocks.reset()
    expect(mocks.has(getMe)).toBe(false)
    expect(mocks.calls()).toEqual([])
  })

  it('records the calls it answered', async () => {
    const { mocks, getUser, getMe } = setup()
    mocks.on(getUser, () => ({ id: '1', name: 'Ada' }))
    mocks.on(getMe, () => ({ id: 'me', name: 'Me' }))

    await getUser({ urlParams: { userId: 1 } })
    await getMe()

    expect(mocks.calls()).toHaveLength(2)
    expect(mocks.calls(getUser)).toEqual([
      {
        endpoint: getUser.config,
        args: { urlParams: { userId: 1 } },
        request: expect.objectContaining({ method: 'GET', url: '/users/1' }),
      },
    ])
  })

  it('accepts anything that carries the endpoint, like a react-query object', async () => {
    const { mocks, getUser } = setup()
    const query = { endpoint: getUser }
    mocks.on(query, () => ({ id: '1', name: 'Ada' }))

    expect(mocks.has(getUser)).toBe(true)
    expect(() => mocks.on({ endpoint: {} } as never, () => null)).toThrow(NaviosError)
  })

  it('fails a call no mock answers when there is no fallback', async () => {
    const { getUser } = setup()

    const result = await getUser.safe({ urlParams: { userId: 1 } })

    expect(result.error?.kind).toBe('network')
    expect((result.error!.cause as Error).message).toContain(
      'no mock answers GET /users/1 (declared as GET /users/$userId)',
    )
  })

  it('sends a call no mock answers to the fallback, with its context', async () => {
    const real = vi.fn(async () => ({
      status: 200,
      statusText: 'OK',
      headers: {},
      data: { id: 'real', name: 'Real' },
    }))
    const mocks = createMockClient()
    const api = builder({ client: mocks.wrap({ request: real as Client['request'] }) })
    const getUser = api.declareEndpoint({
      method: 'GET',
      url: '/u/$id',
      responseSchema: userSchema,
    })
    const getMe = api.declareEndpoint({ method: 'GET', url: '/me', responseSchema: userSchema })
    mocks.on(getMe, () => ({ id: 'me', name: 'Mock' }))

    await expect(getMe()).resolves.toEqual({ id: 'me', name: 'Mock' })
    await expect(getUser({ urlParams: { id: 1 } })).resolves.toEqual({ id: 'real', name: 'Real' })
    expect(real).toHaveBeenCalledTimes(1)
    expect((real.mock.calls[0] as unknown[])[1]).toEqual({
      endpoint: getUser.config,
      args: { urlParams: { id: 1 } },
    })
    expect(mocks.calls()).toHaveLength(1)
  })

  it('fails the call as a network failure when the mock throws', async () => {
    const { mocks, getUser } = setup()
    mocks.on(getUser, () => {
      throw new TypeError('offline')
    })

    const result = await getUser.safe({ urlParams: { userId: 1 } })

    expect(result.error?.kind).toBe('network')
    expect(result.error?.cause).toBeInstanceOf(TypeError)
  })

  describe('delay', () => {
    it('waits before answering, a per-mock delay winning over the client one', async () => {
      vi.useFakeTimers()
      try {
        const { mocks, getUser, getMe } = setup({ delay: 500 })
        mocks.on(getUser, () => ({ id: '1', name: 'Ada' }))
        mocks.on(getMe, () => ({ id: 'me', name: 'Me' }), { delay: 50 })
        const onUser = vi.fn()
        const onMe = vi.fn()

        void getUser({ urlParams: { userId: 1 } }).then(onUser)
        void getMe().then(onMe)
        await vi.advanceTimersByTimeAsync(100)
        expect(onMe).toHaveBeenCalled()
        expect(onUser).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(500)
        expect(onUser).toHaveBeenCalled()
      } finally {
        vi.useRealTimers()
      }
    })

    it('stops waiting when the call is aborted', async () => {
      const { mocks, getUser } = setup({ delay: [1000, 2000] })
      const handler = vi.fn(() => ({ id: '1', name: 'Ada' }))
      mocks.on(getUser, handler)
      const controller = new AbortController()

      const pending = getUser.safe({ urlParams: { userId: 1 }, signal: controller.signal })
      controller.abort()
      const result = await pending

      expect(result.error?.kind).toBe('aborted')
      expect(handler).not.toHaveBeenCalled()
    })
  })
})
