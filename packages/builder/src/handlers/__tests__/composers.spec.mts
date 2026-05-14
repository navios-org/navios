import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import {
  isHttpError,
  isNetworkError,
  isUnknownHttpError,
  isValidationError,
} from '../../errors/guards.mjs'
import { buildErr, buildOk, runRequest, toResponseMeta } from '../create-handler.mjs'

import type { Client } from '../../types/common.mjs'

function mockClient(impl: () => Promise<unknown>): Client {
  return { request: vi.fn().mockImplementation(impl) } as unknown as Client
}

describe('runRequest', () => {
  it('returns ok with response on success', async () => {
    const client = mockClient(() =>
      Promise.resolve({
        data: { x: 1 },
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
      }),
    )
    const result = await runRequest(client, { method: 'GET', url: '/u' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.response.data).toEqual({ x: 1 })
  })

  it('returns err on rejection', async () => {
    const client = mockClient(() => Promise.reject(new TypeError('boom')))
    const result = await runRequest(client, { method: 'GET', url: '/u' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBeInstanceOf(TypeError)
  })
})

describe('buildOk', () => {
  it('builds an ok envelope with normalized response meta', () => {
    const response = {
      data: { x: 1 },
      status: 200,
      statusText: 'OK',
      headers: new Headers({ etag: 'abc' }),
    }
    const env = buildOk({ name: 'A' }, response)
    expect(env.ok).toBe(true)
    expect(env.data).toEqual({ name: 'A' })
    expect(env.error).toBeNull()
    expect(env.response.status).toBe(200)
    expect(env.response.headers.get('etag')).toBe('abc')
  })

  it('normalizes plain-object headers to Headers', () => {
    const response = {
      data: {},
      status: 200,
      statusText: 'OK',
      headers: { etag: 'abc' } as Record<string, string>,
    }
    const env = buildOk({}, response)
    expect(env.response.headers).toBeInstanceOf(Headers)
    expect(env.response.headers.get('etag')).toBe('abc')
  })
})

describe('buildErr', () => {
  it('classifies network errors when no response is present', () => {
    const env = buildErr(new TypeError('net'), undefined)
    expect(env.ok).toBe(false)
    if (!env.ok) {
      expect(isNetworkError(env.error)).toBe(true)
      expect(env.response).toBeNull()
    }
  })

  it('classifies http errors with matching errorSchema', () => {
    const error = {
      response: {
        data: { msg: 'gone' },
        status: 404,
        statusText: 'NF',
        headers: new Headers(),
      },
    }
    const env = buildErr(error, { 404: z.object({ msg: z.string() }) })
    expect(env.ok).toBe(false)
    if (!env.ok) {
      expect(isHttpError(env.error, 404)).toBe(true)
      if (isHttpError(env.error, 404)) {
        expect(env.error.body).toMatchObject({ msg: 'gone', status: 404 })
      }
      expect(env.response?.status).toBe(404)
    }
  })

  it('classifies http-unknown when no errorSchema match', () => {
    const error = {
      response: {
        data: 'oops',
        status: 500,
        statusText: 'SE',
        headers: new Headers(),
      },
    }
    const env = buildErr(error, { 404: z.object({}) })
    expect(env.ok).toBe(false)
    if (!env.ok) expect(isUnknownHttpError(env.error)).toBe(true)
  })

  it('classifies validation when matched schema fails to parse', () => {
    const error = {
      response: {
        data: { msg: 42 },
        status: 400,
        statusText: 'Bad',
        headers: new Headers(),
      },
    }
    const env = buildErr(error, { 400: z.object({ msg: z.string() }) })
    expect(env.ok).toBe(false)
    if (!env.ok) expect(isValidationError(env.error)).toBe(true)
  })
})

describe('toResponseMeta', () => {
  it('passes through a Headers instance', () => {
    const headers = new Headers({ etag: 'abc' })
    const meta = toResponseMeta({ status: 200, statusText: 'OK', headers })
    expect(meta.headers).toBe(headers)
  })

  it('normalizes a plain-object headers to a Headers instance', () => {
    const meta = toResponseMeta({ status: 200, statusText: 'OK', headers: { etag: 'abc' } })
    expect(meta.headers).toBeInstanceOf(Headers)
    expect(meta.headers.get('etag')).toBe('abc')
  })
})
