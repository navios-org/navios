import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import { builder } from '../../builder.mjs'
import { isHttpError, isNetworkError, isValidationError } from '../../errors/guards.mjs'

import type { Client } from '../../types/common.mjs'

const userSchema = z.object({ id: z.string(), name: z.string() })
const notFoundSchema = z.object({ msg: z.literal('not found') })

function mockClient(impl: () => Promise<unknown>): Client {
  return { request: vi.fn().mockImplementation(impl) } as unknown as Client
}

describe("declareEndpoint with result: 'envelope'", () => {
  it('returns ok envelope on success', async () => {
    const api = builder()
    api.provideClient(
      mockClient(() =>
        Promise.resolve({
          data: { id: '1', name: 'A' },
          status: 200,
          statusText: 'OK',
          headers: new Headers({ etag: 'abc' }),
        }),
      ),
    )

    const getUser = api.declareEndpoint({
      method: 'GET',
      url: '/u',
      responseSchema: userSchema,
      result: 'envelope',
    })

    const env: any = await getUser({})
    expect(env.ok).toBe(true)
    if (env.ok) {
      expect(env.data).toEqual({ id: '1', name: 'A' })
      expect(env.error).toBeNull()
      expect(env.response.status).toBe(200)
      expect(env.response.headers.get('etag')).toBe('abc')
    }
  })

  it('returns http error variant for matched errorSchema entry', async () => {
    const api = builder()
    api.provideClient(
      mockClient(() =>
        Promise.reject({
          response: {
            data: { msg: 'not found' },
            status: 404,
            statusText: 'NF',
            headers: new Headers(),
          },
        }),
      ),
    )

    const getUser = api.declareEndpoint({
      method: 'GET',
      url: '/u',
      responseSchema: userSchema,
      errorSchema: { 404: notFoundSchema },
      result: 'envelope',
    })

    const env: any = await getUser({})
    expect(env.ok).toBe(false)
    if (!env.ok) {
      expect(isHttpError(env.error, 404)).toBe(true)
      if (isHttpError(env.error, 404)) {
        expect(env.error.body).toMatchObject({ msg: 'not found', status: 404 })
      }
      expect(env.response?.status).toBe(404)
    }
  })

  it('returns http-unknown for unmatched status', async () => {
    const api = builder()
    api.provideClient(
      mockClient(() =>
        Promise.reject({
          response: {
            data: 'oops',
            status: 500,
            statusText: 'SE',
            headers: new Headers(),
          },
        }),
      ),
    )
    const getUser = api.declareEndpoint({
      method: 'GET',
      url: '/u',
      responseSchema: userSchema,
      errorSchema: { 404: notFoundSchema },
      result: 'envelope',
    })
    const env: any = await getUser({})
    expect(env.ok).toBe(false)
    if (!env.ok) expect(env.error.kind).toBe('http-unknown')
  })

  it('returns validation variant for Zod success-body parse failure', async () => {
    const api = builder()
    api.provideClient(
      mockClient(() =>
        Promise.resolve({
          data: { id: 1, name: 'A' }, // id should be string
          status: 200,
          statusText: 'OK',
          headers: new Headers(),
        }),
      ),
    )
    const getUser = api.declareEndpoint({
      method: 'GET',
      url: '/u',
      responseSchema: userSchema,
      result: 'envelope',
    })
    const env: any = await getUser({})
    expect(env.ok).toBe(false)
    if (!env.ok) expect(isValidationError(env.error)).toBe(true)
  })

  it('non-Zod throw during success-body processing is classified as validation', async () => {
    const api = builder()
    api.provideClient(
      mockClient(() =>
        Promise.resolve({
          data: { id: '1', name: 'A' },
          status: 200,
          statusText: 'OK',
          headers: new Headers(),
        }),
      ),
    )

    // Zod transform that throws a non-ZodError; Zod propagates it as-is.
    const responseSchema = z.unknown().transform(() => {
      throw new Error('custom transform failure')
    })

    const getUser = api.declareEndpoint({
      method: 'GET',
      url: '/u',
      responseSchema,
      result: 'envelope',
    })

    const env: any = await getUser({})
    expect(env.ok).toBe(false)
    if (!env.ok) {
      expect(isValidationError(env.error)).toBe(true)
      if (isValidationError(env.error)) {
        expect(env.error.status).toBe(200)
        expect(env.error.issues).toEqual([])
        expect(env.error.body).toEqual({ id: '1', name: 'A' })
      }
      // We had a successful HTTP response in hand; response should be present.
      expect(env.response?.status).toBe(200)
    }
  })

  it('returns network variant when no response is present', async () => {
    const api = builder()
    api.provideClient(mockClient(() => Promise.reject(new TypeError('fetch failed'))))
    const getUser = api.declareEndpoint({
      method: 'GET',
      url: '/u',
      responseSchema: userSchema,
      result: 'envelope',
    })
    const env: any = await getUser({})
    expect(env.ok).toBe(false)
    if (!env.ok) expect(isNetworkError(env.error)).toBe(true)
  })

  it('respects builder defaults.result when per-endpoint not set', async () => {
    const api = builder({ defaults: { result: 'envelope' } })
    api.provideClient(
      mockClient(() =>
        Promise.resolve({
          data: { id: '1', name: 'A' },
          status: 200,
          statusText: 'OK',
          headers: new Headers(),
        }),
      ),
    )
    const getUser = api.declareEndpoint({
      method: 'GET',
      url: '/u',
      responseSchema: userSchema,
    })
    const env: any = await getUser({})
    expect(env.ok).toBe(true)
  })

  it('validateResponse: false skips Zod parsing in data mode', async () => {
    const api = builder()
    api.provideClient(
      mockClient(() =>
        Promise.resolve({
          data: { id: 1, name: 'A' },
          status: 200,
          statusText: 'OK',
          headers: new Headers(),
        }),
      ),
    )
    const getUser = api.declareEndpoint({
      method: 'GET',
      url: '/u',
      responseSchema: userSchema,
      validateResponse: false,
    })
    const result = await getUser({})
    expect(result).toEqual({ id: 1, name: 'A' })
  })
})
