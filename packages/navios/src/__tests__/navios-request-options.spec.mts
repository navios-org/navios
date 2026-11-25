import { getEventListeners } from 'node:events'
import { setFlagsFromString } from 'node:v8'
import { runInNewContext } from 'node:vm'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { create } from '../client/create-navios.mjs'

import { recordingClient } from './recording-client.mjs'

/** An adapter that, like `fetch`, settles only when its signal aborts. */
function hangingClient() {
  return create({
    baseURL: 'http://x.test',
    adapter: (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal
        if (!signal) return
        if (signal.aborted) return reject(signal.reason)
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      }),
  })
}

describe('navios::timeout', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('should abort the request when the timeout elapses', async () => {
    const navios = hangingClient()

    const error = await navios.get('/slow', { timeout: 10 }).catch((err) => err)

    expect(error).toBeInstanceOf(Error)
    expect(error.code).toBe('ECONNABORTED')
    expect(error.cause.name).toBe('TimeoutError')
  })

  it('should still abort through the signal of the caller when a timeout is set', async () => {
    const navios = hangingClient()
    const controller = new AbortController()

    const pending = navios.get('/slow', { timeout: 10_000, signal: controller.signal })
    controller.abort()
    const error = await pending.catch((err) => err)

    expect(error.code).toBe('ERR_CANCELED')
    expect(error.cause.name).toBe('AbortError')
  })

  it('should need neither AbortSignal.timeout nor AbortSignal.any', async () => {
    const { timeout, any } = AbortSignal
    // @ts-expect-error simulates a runtime without them
    AbortSignal.timeout = AbortSignal.any = undefined
    try {
      const navios = hangingClient()
      const controller = new AbortController()

      const timedOut = await navios
        .get('/slow', { timeout: 10, signal: controller.signal })
        .catch((err) => err)
      expect(timedOut.code).toBe('ECONNABORTED')

      const pending = navios.get('/slow', { timeout: 10_000, signal: controller.signal })
      controller.abort()
      expect((await pending.catch((err) => err)).code).toBe('ERR_CANCELED')
    } finally {
      Object.assign(AbortSignal, { timeout, any })
    }
  })

  it('should report a timeout on a runtime whose signals have no reason', async () => {
    const navios = create({
      baseURL: 'http://x.test',
      adapter: (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal!.addEventListener('abort', () =>
            reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })),
          )
        }),
    })

    const error = await navios.get('/slow', { timeout: 10 }).catch((err) => err)

    expect(error.code).toBe('ECONNABORTED')
  })

  it('should report an abort with a reason of its own as ERR_CANCELED', async () => {
    const reason = new Error('navigated away')

    const error = await hangingClient()
      .get('/slow', { signal: AbortSignal.abort(reason) })
      .catch((err) => err)

    expect(error.code).toBe('ERR_CANCELED')
    expect(error.cause).toBe(reason)
  })

  it('should leave no listener and no timer behind when the request settles', async () => {
    vi.useFakeTimers()
    const { any } = AbortSignal
    // @ts-expect-error simulates a runtime without it
    AbortSignal.any = undefined
    try {
      const { navios } = recordingClient()
      const controller = new AbortController()

      for (let i = 0; i < 5; i++) {
        await navios.get('/fast', { timeout: 60_000, signal: controller.signal })
      }

      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      AbortSignal.any = any
    }
  })

  it('should keep a stream abortable, but not under the timeout, after the headers arrived', async () => {
    const { navios, calls } = recordingClient()
    const controller = new AbortController()

    await navios.get('/stream', { responseType: 'stream', timeout: 10, signal: controller.signal })
    await new Promise((resolve) => setTimeout(resolve, 30))

    expect(calls[0]!.init.signal!.aborted).toBe(false)
    controller.abort()
    expect(calls[0]!.init.signal!.aborted).toBe(true)
  })

  describe('of a stream, with the long-lived signal of a caller', () => {
    const chunks = () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          for (const byte of [1, 2, 3]) controller.enqueue(new Uint8Array([byte]))
          controller.close()
        },
      })

    async function open(
      respond: () => Response | Promise<Response> = () => new Response(chunks()),
    ) {
      const { navios } = recordingClient({}, respond)
      const { signal } = new AbortController()
      const options = { responseType: 'stream', timeout: 1000, signal } as const
      const result = await navios.get<ReadableStream<Uint8Array> | null>('/', options).then(
        (response) => response.data,
        (error: Error) => error,
      )
      return { result, listeners: () => getEventListeners(signal, 'abort').length }
    }

    it('should leave no listener once the stream was read to its end', async () => {
      const { result, listeners } = await open()
      expect(listeners()).toBe(1)

      const bytes: number[] = []
      for await (const chunk of result as ReadableStream<Uint8Array>) bytes.push(...chunk)

      expect(bytes).toEqual([1, 2, 3])
      expect(listeners()).toBe(0)
    })

    it.each([
      [
        'a reader that cancels',
        async (stream: ReadableStream<Uint8Array>) => {
          const reader = stream.getReader()
          await reader.read()
          await reader.cancel('enough')
        },
      ],
      [
        'a loop that breaks',
        async (stream: ReadableStream<Uint8Array>) => {
          for await (const _chunk of stream) break
        },
      ],
      [
        'a stream that is not read',
        (stream: ReadableStream<Uint8Array>) => stream.cancel('unused'),
      ],
    ])('should leave no listener, and cancel the body, after %s', async (_name, stop) => {
      let cancelled = 0
      const { result, listeners } = await open(
        () =>
          new Response(
            new ReadableStream({
              pull: (controller) => controller.enqueue(new Uint8Array([1])),
              cancel: () => void cancelled++,
            }),
          ),
      )

      await stop(result as ReadableStream<Uint8Array>)

      expect(cancelled).toBe(1)
      expect(listeners()).toBe(0)
    })

    it('should leave no listener when the body breaks', async () => {
      const { result, listeners } = await open(
        () =>
          new Response(
            new ReadableStream({ pull: (controller) => controller.error(new Error('reset')) }),
          ),
      )

      await expect((result as ReadableStream).getReader().read()).rejects.toThrow('reset')

      expect(listeners()).toBe(0)
    })

    it.each<[string, () => Response | Promise<Response>]>([
      ['a network failure', () => Promise.reject(new TypeError('fetch failed'))],
      ['an error status', () => new Response('no', { status: 500 })],
      ['a response without a body', () => new Response(null, { status: 204 })],
    ])('should leave no listener after %s', async (_name, respond) => {
      const { listeners } = await open(respond)

      expect(listeners()).toBe(0)
    })

    it('should leave no listener after a stream that was dropped half read', async () => {
      setFlagsFromString('--expose-gc')
      const collectGarbage = runInNewContext('gc') as () => void
      const { listeners } = await (async () => {
        const { result, listeners } = await open()
        await (result as ReadableStream).getReader().read()
        return { listeners }
      })()
      expect(listeners()).toBe(1)

      await vi.waitFor(() => {
        collectGarbage()
        expect(listeners()).toBe(0)
      })
    })

    it('should hand out the body itself when there is no signal to follow', async () => {
      const response = new Response(chunks())
      const { navios } = recordingClient({}, () => response)

      const { data } = await navios.get('/', { responseType: 'stream', timeout: 1000 })

      expect(data).toBe(response.body)
    })
  })

  it.each([Infinity, 2 ** 31, Number.MAX_SAFE_INTEGER])(
    'should be none for %d, which a timer cannot wait for',
    async (timeout) => {
      const { navios, calls } = recordingClient({}, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return Response.json({ ok: true })
      })

      expect((await navios.get('/', { timeout })).data).toEqual({ ok: true })
      expect(calls[0]!.init.signal).toBeUndefined()
    },
  )

  it('should pass the signal of the caller through when there is no timeout', async () => {
    const { navios, calls } = recordingClient()
    const controller = new AbortController()

    await navios.get('/fast', { signal: controller.signal })

    expect(calls[0]!.init.signal).toBe(controller.signal)
  })
})

describe('navios::params', () => {
  it('should merge params into a URL that already has a query string', async () => {
    const { navios, calls } = recordingClient()

    await navios.get('/q?fixed=1', { params: { a: 'b' } })

    expect(calls[0]!.url).toBe('http://x.test/q?fixed=1&a=b')
  })

  it('should merge URLSearchParams into a URL that already has a query string', async () => {
    const { navios, calls } = recordingClient()

    await navios.get('/q?fixed=1', { params: new URLSearchParams({ a: 'b' }) })

    expect(calls[0]!.url).toBe('http://x.test/q?fixed=1&a=b')
  })

  it('should leave a URL with a query string alone when there are no params', async () => {
    const { navios, calls } = recordingClient()

    await navios.get('/q?fixed=1', { params: {} })

    expect(calls[0]!.url).toBe('http://x.test/q?fixed=1')
  })

  it('should put the query before a fragment', async () => {
    const { navios, calls } = recordingClient()

    await navios.get('/q#part', { params: { a: 1 } })

    expect(calls[0]!.url).toBe('http://x.test/q?a=1#part')
  })

  it('should serialise array items like single values and skip empty ones', async () => {
    const { navios, calls } = recordingClient()
    const date = new Date(5)

    await navios.get('/q', {
      params: { a: ['x', null, undefined, 'y'], d: [date], o: [{ b: 1 }], n: null, u: undefined },
    })

    const query = new URL(calls[0]!.url).searchParams
    expect([...query]).toEqual([
      ['a', 'x'],
      ['a', 'y'],
      ['d', date.toISOString()],
      ['o', '{"b":1}'],
    ])
  })

  it('should serialise dates and objects', async () => {
    const { navios, calls } = recordingClient()

    await navios.get('/q', { params: { d: new Date(5), o: { a: 1 }, b: false } })

    const query = new URL(calls[0]!.url).searchParams
    expect(query.get('d')).toBe('1970-01-01T00:00:00.005Z')
    expect(query.get('o')).toBe('{"a":1}')
    expect(query.get('b')).toBe('false')
  })
})

describe('navios::url', () => {
  it.each([
    ['http://x.test/api', '/users', 'http://x.test/api/users'],
    ['http://x.test/api/', '/users', 'http://x.test/api/users'],
    ['http://x.test/api/', 'users', 'http://x.test/api/users'],
    ['http://x.test/api', 'users', 'http://x.test/api/users'],
    ['http://x.test/api/', '', 'http://x.test/api/'],
    ['', '/users', '/users'],
    ['http://x.test/api', 'https://other.test/users', 'https://other.test/users'],
    // Only a scheme makes a URL absolute: a doubled slash must not change the host
    ['http://x.test/api', '//other.test/users', 'http://x.test/api/other.test/users'],
  ])('should join %s and %s', async (baseURL, url, expected) => {
    const { navios, calls } = recordingClient({ baseURL })

    await navios.get(url)

    expect(calls[0]!.url).toBe(expected)
  })
})

describe('navios::body', () => {
  it('should send a string body as it is, as text/plain', async () => {
    const { navios, calls } = recordingClient()

    await navios.post('/s', 'hello')

    expect(calls[0]!.init.body).toBe('hello')
    expect(calls[0]!.init.headers).toEqual({ 'content-type': 'text/plain' })
  })

  it('should keep a content type the caller set for a string body', async () => {
    const { navios, calls } = recordingClient()

    await navios.post('/s', '<a/>', { headers: { 'content-type': 'application/xml' } })

    expect(calls[0]!.init.body).toBe('<a/>')
    expect(calls[0]!.init.headers).toEqual({ 'content-type': 'application/xml' })
  })

  it.each([
    [0, '0'],
    [5, '5'],
    [true, 'true'],
    [false, 'false'],
    [[1], '[1]'],
    [{ a: 1 }, '{"a":1}'],
  ])('should send %j as JSON', async (data, body) => {
    const { navios, calls } = recordingClient()

    await navios.post('/s', data)

    expect(calls[0]!.init.body).toBe(body)
    expect(calls[0]!.init.headers).toEqual({ 'content-type': 'application/json' })
  })

  it('should send an empty string', async () => {
    const { navios, calls } = recordingClient()

    await navios.post('/s', '')

    expect(calls[0]!.init.body).toBe('')
    expect(calls[0]!.init.headers).toEqual({ 'content-type': 'text/plain' })
  })

  it.each([undefined, null])('should send no body for %s', async (data) => {
    const { navios, calls } = recordingClient()

    await navios.post('/s', data)
    await navios.post('/s', data, { headers: { 'content-type': 'text/plain' } })

    expect(calls.map((call) => call.init.body)).toEqual([undefined, undefined])
    expect(calls[0]!.init.headers).toEqual({})
  })

  it.each(['application/json', 'application/vnd.api+json; charset=utf-8'])(
    'should send null when the content type is %s',
    async (type) => {
      const { navios, calls } = recordingClient()

      await navios.post('/s', null, { headers: { 'Content-Type': type } })

      expect(calls[0]!.init.body).toBe('null')
      expect(calls[0]!.init.headers).toEqual({ 'content-type': type })
    },
  )

  it.each([
    ['URLSearchParams', new URLSearchParams({ a: '1' })],
    ['Blob', new Blob(['x'])],
    ['File', new File(['x'], 'x.txt')],
    ['ArrayBuffer', new ArrayBuffer(2)],
    ['Uint8Array', new Uint8Array([1, 2])],
    ['FormData', new FormData()],
  ])('should send a %s as it is', async (_name, data) => {
    const { navios, calls } = recordingClient()

    await navios.post('/s', data)

    expect(calls[0]!.init.body).toBe(data)
    expect(calls[0]!.init.headers).toEqual({})
    expect(calls[0]!.init.duplex).toBeUndefined()
  })

  it('should send a stream with half duplex, which fetch requires', async () => {
    const { navios, calls } = recordingClient()
    const stream = new Blob(['x']).stream()

    await navios.post('/s', stream)

    expect(calls[0]!.init.body).toBe(stream)
    expect(calls[0]!.init.duplex).toBe('half')
  })

  it('should send a body on DELETE', async () => {
    const { navios, calls } = recordingClient()

    await navios.delete('/s', { data: { ids: [1] } })

    expect(calls[0]!.init.body).toBe('{"ids":[1]}')
    expect(calls[0]!.init.headers).toEqual({ 'content-type': 'application/json' })
  })

  it.each(['GET', 'HEAD'] as const)('should not send a body on %s', async (method) => {
    const { navios, calls } = recordingClient()

    await navios.request({ url: '/s', method, data: { a: 1 } })

    expect(calls[0]!.init.body).toBeUndefined()
  })
})

describe('navios::fetch options', () => {
  it('should map withCredentials to credentials', async () => {
    const { navios, calls } = recordingClient()

    await navios.get('/s', { withCredentials: true })
    await navios.get('/s', { withCredentials: true, credentials: 'omit' })
    await navios.get('/s')

    expect(calls.map((call) => call.init.credentials)).toEqual(['include', 'omit', undefined])
  })

  it('should hand only fetch options to the adapter', async () => {
    const { navios, calls } = recordingClient()

    await navios.post('/s', { a: 1 }, { params: { p: 1 }, timeout: 1000, cache: 'no-store' })

    expect(Object.keys(calls[0]!.init).sort()).toEqual([
      'body',
      'cache',
      'headers',
      'method',
      'signal',
    ])
  })

  it('should treat an undefined option as not given', async () => {
    const { navios } = recordingClient({ responseType: undefined })

    const response = await navios.get('/s', { responseType: undefined, baseURL: undefined })

    expect(response.data).toEqual({})
  })
})
