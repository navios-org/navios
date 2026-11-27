import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import {
  ConnectionError,
  createEventSourceHandler,
  isConnectionError as isEventSourceConnectionError,
} from '../eventsource/index.mjs'
import { NaviosError } from '../index.mjs'
import { createWebSocketHandler, isConnectionError } from '../socket/index.mjs'

class FakeEventSource extends EventTarget {
  readyState = 0
  onopen = null
  onerror = null
  onmessage = null
  constructor(readonly url: string) {
    super()
  }
  close() {}
}

class FakeWebSocket extends EventTarget {
  readyState = 0
  onopen = null
  onclose = null
  onerror = null
  onmessage = null
  constructor(readonly url: string) {
    super()
  }
  send() {}
  close() {}
}

/** Both declarations, as far as their connections are alike. */
type Declare = (config?: {
  baseURL?: string
}) => (options: {
  url: string
  urlParamsSchema?: unknown
  querySchema?: unknown
}) => (params?: object) => { url: string }

const declarations: Record<string, Declare> = {
  declareWebSocket: ((config = {}) =>
    createWebSocketHandler({ ...config, WebSocket: FakeWebSocket as never })) as Declare,
  declareEventSource: ((config = {}) =>
    createEventSourceHandler({ ...config, EventSource: FakeEventSource as never })) as Declare,
}

function thrownBy(run: () => unknown): unknown {
  try {
    run()
  } catch (error) {
    return error
  }
  throw new Error('nothing was thrown')
}

describe.each(Object.entries(declarations))('%s: the base URL', (_name, create) => {
  it.each([
    ['https://api.example.com', '/feed', 'https://api.example.com/feed'],
    ['https://api.example.com/', '/feed', 'https://api.example.com/feed'],
    ['https://api.example.com/v1/', 'feed', 'https://api.example.com/v1/feed'],
    ['https://api.example.com/v1', 'feed', 'https://api.example.com/v1/feed'],
    ['https://api.example.com//', '//feed', 'https://api.example.com/feed'],
  ])('should join %s and %s with one slash', (baseURL, url, expected) => {
    expect(create({ baseURL })({ url })().url).toBe(expected)
  })

  it('should leave a URL with a scheme of its own as it is', () => {
    const connect = create({ baseURL: 'https://api.example.com' })({ url: 'wss://other.test/ws' })

    expect(connect().url).toBe('wss://other.test/ws')
  })

  it('should use the URL alone without a base URL', () => {
    expect(create()({ url: '/feed' })().url).toBe('/feed')
  })
})

describe.each(Object.entries(declarations))('%s: invalid arguments', (_name, create) => {
  const declare = create({ baseURL: 'https://api.example.com' })

  it('should throw a request-validation ConnectionError for url params a schema rejects', () => {
    const connect = declare({
      url: '/rooms/$roomId',
      urlParamsSchema: z.object({ roomId: z.uuid() }),
    })

    const error = thrownBy(() => connect({ urlParams: { roomId: 'nope' } }))

    expect(error).toBeInstanceOf(ConnectionError)
    expect(error).toBeInstanceOf(NaviosError)
    expect(isConnectionError(error)).toBe(true)
    expect(isEventSourceConnectionError(error)).toBe(true)
    expect(error).toMatchObject({
      name: 'ConnectionError',
      kind: 'request-validation',
      url: '/rooms/$roomId',
      issues: [{ part: 'urlParams', path: ['roomId'] }],
    })
    expect((error as ConnectionError).cause).toBeInstanceOf(z.ZodError)
  })

  it('should throw a request-validation ConnectionError for a query a schema rejects', () => {
    const connect = declare({ url: '/feed', querySchema: z.object({ token: z.string() }) })

    const invalid = thrownBy(() => connect({ params: { token: 1 } }))
    const leftOut = thrownBy(() => connect())

    expect(invalid).toMatchObject({
      kind: 'request-validation',
      issues: [{ part: 'params', path: ['token'] }],
    })
    expect(leftOut).toMatchObject({
      kind: 'request-validation',
      issues: [{ part: 'params', path: ['token'] }],
    })
  })

  it('should list the issues of every part', () => {
    const connect = declare({
      url: '/rooms/$roomId',
      urlParamsSchema: z.object({ roomId: z.uuid() }),
      querySchema: z.object({ token: z.string() }),
    })

    const error = thrownBy(() => connect({ urlParams: { roomId: 'nope' }, params: {} }))

    expect((error as ConnectionError).issues?.map((issue) => issue.part)).toEqual([
      'urlParams',
      'params',
    ])
  })

  it.each([
    ['left out', undefined, /Missing urlParams/],
    ['empty', { roomId: '' }, /Missing required URL parameters: roomId/],
    ['a dot segment', { roomId: '..' }, /cannot be "\." or "\.\."/],
    ['not writable', { roomId: { id: 1 } }, /Invalid URL parameters/],
  ])(
    'should throw a config ConnectionError for url params that are %s',
    (_case, urlParams, message) => {
      const connect = declare({ url: '/rooms/$roomId' })

      const error = thrownBy(() => connect(urlParams ? { urlParams } : undefined))

      expect(error).toBeInstanceOf(ConnectionError)
      expect(error).toMatchObject({ kind: 'config', url: '/rooms/$roomId' })
      expect((error as Error).message).toMatch(message)
      expect((error as ConnectionError).issues).toBeUndefined()
    },
  )

  it('should throw a config ConnectionError for a schema that validates asynchronously', () => {
    const connect = declare({
      url: '/feed',
      querySchema: {
        '~standard': {
          version: 1,
          vendor: 'test',
          validate: async (value: unknown) => ({ value }),
        },
      },
    })

    const error = thrownBy(() => connect())

    expect(error).toMatchObject({ kind: 'config' })
    expect((error as Error).message).toMatch(/asynchronous schemas/)
  })

  it('should have a JSON form without the cause', () => {
    const connect = declare({ url: '/feed', querySchema: z.object({ token: z.string() }) })

    const error = thrownBy(() => connect({ params: { token: 1 } })) as ConnectionError

    expect(error.toJSON()).toEqual({
      name: 'ConnectionError',
      message: error.message,
      kind: 'request-validation',
      url: '/feed',
      issues: [{ message: expect.any(String), path: ['token'], part: 'params' }],
    })
  })
})

describe('a runtime without the class', () => {
  it('should throw a config ConnectionError', () => {
    vi.stubGlobal('WebSocket', undefined)
    vi.stubGlobal('EventSource', undefined)
    try {
      const socket = thrownBy(() => createWebSocketHandler()({ url: '/ws' })())
      const source = thrownBy(() => createEventSourceHandler()({ url: '/feed' })())

      expect(socket).toMatchObject({ name: 'ConnectionError', kind: 'config', url: '/ws' })
      expect(source).toMatchObject({ name: 'ConnectionError', kind: 'config', url: '/feed' })
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
