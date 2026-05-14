import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import { builder } from '../builder.mjs'

import type { Client } from '../types/common.mjs'
import type { BuilderErrorEvent } from '../types/index.mjs'

describe('onError event', () => {
  it('fires for HTTP errors with kind, status, body, endpoint', async () => {
    const events: BuilderErrorEvent[] = []
    const api = builder({ onError: (e) => events.push(e) })
    api.provideClient({
      request: () =>
        Promise.reject({
          response: {
            data: { msg: 'gone' },
            status: 404,
            statusText: 'NF',
            headers: new Headers(),
          },
        }),
    } as unknown as Client)
    const ep = api.declareEndpoint({
      method: 'GET',
      url: '/u',
      responseSchema: z.object({ name: z.string() }),
      errorSchema: { 404: z.object({ msg: z.string() }) },
      result: 'envelope',
    })
    await ep({})
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      kind: 'http',
      status: 404,
      endpoint: { method: 'GET', url: '/u' },
    })
    expect(events[0].body).toMatchObject({ msg: 'gone' })
  })

  it('fires for validation errors on 2xx with zodIssues', async () => {
    const events: BuilderErrorEvent[] = []
    const api = builder({ onError: (e) => events.push(e) })
    api.provideClient({
      request: () =>
        Promise.resolve({
          data: { id: 1, name: 'A' },
          status: 200,
          statusText: 'OK',
          headers: new Headers(),
        }),
    } as unknown as Client)
    const ep = api.declareEndpoint({
      method: 'GET',
      url: '/u',
      responseSchema: z.object({ id: z.string(), name: z.string() }),
      result: 'envelope',
    })
    await ep({})
    expect(events).toHaveLength(1)
    expect(events[0].kind).toBe('validation')
    expect(events[0].status).toBe(200)
    expect(events[0].zodIssues?.length).toBeGreaterThan(0)
    expect(events[0].endpoint).toEqual({ method: 'GET', url: '/u' })
  })

  it('fires for validation errors on matched error status (HTTP+invalid body)', async () => {
    const events: BuilderErrorEvent[] = []
    const api = builder({ onError: (e) => events.push(e) })
    api.provideClient({
      request: () =>
        Promise.reject({
          response: {
            data: { msg: 42 }, // expected string
            status: 404,
            statusText: 'NF',
            headers: new Headers(),
          },
        }),
    } as unknown as Client)
    const ep = api.declareEndpoint({
      method: 'GET',
      url: '/u',
      responseSchema: z.object({ name: z.string() }),
      errorSchema: { 404: z.object({ msg: z.string() }) },
      result: 'envelope',
    })
    await ep({})
    expect(events).toHaveLength(1)
    expect(events[0].kind).toBe('validation')
    expect(events[0].status).toBe(404)
    expect(events[0].zodIssues?.length).toBeGreaterThan(0)
  })

  it('fires for unknown HTTP errors with http-unknown kind', async () => {
    const events: BuilderErrorEvent[] = []
    const api = builder({ onError: (e) => events.push(e) })
    api.provideClient({
      request: () =>
        Promise.reject({
          response: {
            data: 'oops',
            status: 500,
            statusText: 'SE',
            headers: new Headers(),
          },
        }),
    } as unknown as Client)
    const ep = api.declareEndpoint({
      method: 'GET',
      url: '/u',
      responseSchema: z.object({ name: z.string() }),
      result: 'envelope',
    })
    await ep({})
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      kind: 'http-unknown',
      status: 500,
      endpoint: { method: 'GET', url: '/u' },
    })
    expect(events[0].body).toBe('oops')
  })

  it('fires for network errors with kind: network, no status', async () => {
    const events: BuilderErrorEvent[] = []
    const api = builder({ onError: (e) => events.push(e) })
    const cause = new TypeError('fetch failed')
    api.provideClient({
      request: () => Promise.reject(cause),
    } as unknown as Client)
    const ep = api.declareEndpoint({
      method: 'GET',
      url: '/u',
      responseSchema: z.object({ name: z.string() }),
      result: 'envelope',
    })
    await ep({})
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      kind: 'network',
      endpoint: { method: 'GET', url: '/u' },
    })
    expect(events[0].status).toBeUndefined()
    expect(events[0].cause).toBeInstanceOf(TypeError)
  })

  it('fires for legacy data-mode throws (then rethrows)', async () => {
    const events: BuilderErrorEvent[] = []
    const api = builder({ onError: (e) => events.push(e) })
    api.provideClient({
      request: () =>
        Promise.reject({
          response: { data: 'no', status: 500, statusText: 'SE', headers: new Headers() },
        }),
    } as unknown as Client)
    const ep = api.declareEndpoint({
      method: 'GET',
      url: '/u',
      responseSchema: z.object({ name: z.string() }),
    })
    await expect(ep({})).rejects.toBeDefined()
    expect(events).toHaveLength(1)
    expect(events[0].kind).toBe('http-unknown')
    expect(events[0].status).toBe(500)
    expect(events[0].endpoint).toEqual({ method: 'GET', url: '/u' })
  })

  it('does not fire on success', async () => {
    const events: BuilderErrorEvent[] = []
    const api = builder({ onError: (e) => events.push(e) })
    api.provideClient({
      request: () =>
        Promise.resolve({
          data: { name: 'A' },
          status: 200,
          statusText: 'OK',
          headers: new Headers(),
        }),
    } as unknown as Client)
    const ep = api.declareEndpoint({
      method: 'GET',
      url: '/u',
      responseSchema: z.object({ name: z.string() }),
      result: 'envelope',
    })
    await ep({})
    expect(events).toHaveLength(0)
  })
})
