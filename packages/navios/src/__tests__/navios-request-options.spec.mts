import { describe, expect, it } from 'vitest'

import { create } from '../client/create-navios.mjs'

interface Call {
  url: string
  init: RequestInit
}

function recordingClient() {
  const calls: Call[] = []
  const navios = create({
    baseURL: 'http://x.test',
    adapter: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} })
      return Response.json({})
    },
  })
  return { navios, calls }
}

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

  it('should combine the signals without AbortSignal.any', async () => {
    const any = AbortSignal.any
    // @ts-expect-error simulates a runtime without AbortSignal.any
    AbortSignal.any = undefined
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
      AbortSignal.any = any
    }
  })

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
})

describe('navios::body', () => {
  it('should send a string body as it is, as text/plain', async () => {
    const { navios, calls } = recordingClient()

    await navios.post('/s', 'hello')

    expect(calls[0]!.init.body).toBe('hello')
    expect(calls[0]!.init.headers).toEqual({ 'Content-Type': 'text/plain' })
  })

  it('should keep a content type the caller set for a string body', async () => {
    const { navios, calls } = recordingClient()

    await navios.post('/s', '<a/>', { headers: { 'content-type': 'application/xml' } })

    expect(calls[0]!.init.body).toBe('<a/>')
    expect(calls[0]!.init.headers).toEqual({ 'content-type': 'application/xml' })
  })

  it('should send a body on DELETE', async () => {
    const { navios, calls } = recordingClient()

    await navios.delete('/s', { data: { ids: [1] } })

    expect(calls[0]!.init.body).toBe('{"ids":[1]}')
    expect(calls[0]!.init.headers).toEqual({ 'Content-Type': 'application/json' })
  })

  it.each(['GET', 'HEAD'] as const)('should not send a body on %s', async (method) => {
    const { navios, calls } = recordingClient()

    await navios.request({ url: '/s', method, data: { a: 1 } })

    expect(calls[0]!.init.body).toBeUndefined()
  })
})
