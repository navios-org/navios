import { describe, expect, it } from 'vitest'

import { create } from '../client/create-navios.mjs'
import { HttpClientError } from '../http-client-error.mjs'

import { recordingClient } from './recording-client.mjs'

describe('navios::interceptors', () => {
  it('should use the response a response interceptor returns', async () => {
    const { navios } = recordingClient()
    navios.interceptors.response.use((response) => ({ ...response, data: 'replaced' }))

    expect((await navios.get('/')).data).toBe('replaced')
  })

  it('should keep the response when a response interceptor returns nothing', async () => {
    const { navios } = recordingClient()
    navios.interceptors.response.use(() => {})

    expect((await navios.get('/')).data).toEqual({})
  })

  it('should serialise what request interceptors left in params and data', async () => {
    const { navios, calls } = recordingClient()
    navios.interceptors.request.use((config) => ({
      ...config,
      params: { ...config.params, key: 'k' },
      data: { ...(config.data as object), b: 2 },
    }))

    await navios.post('/', { a: 1 }, { params: { p: 1 } })

    expect(calls[0]!.url).toBe('http://x.test/?p=1&key=k')
    expect(calls[0]!.init.body).toBe('{"a":1,"b":2}')
  })

  it('should keep the config when a request interceptor returns nothing', async () => {
    const { navios, calls } = recordingClient()
    navios.interceptors.request.use((config) => {
      config.headers['x-a'] = '1'
    })

    await navios.get('/a')

    expect(calls[0]!.url).toBe('http://x.test/a')
    expect(calls[0]!.init.headers).toEqual({ 'x-a': '1' })
  })

  it('should still serialise params and bodies after clear()', async () => {
    const { navios, calls } = recordingClient()
    navios.interceptors.request.clear()
    navios.interceptors.response.clear()

    const response = await navios.post('/', { a: 1 }, { params: { p: 1 } })

    expect(calls[0]!.url).toBe('http://x.test/?p=1')
    expect(calls[0]!.init.body).toBe('{"a":1}')
    expect(response.data).toEqual({})
  })

  it('should run only the interceptors that are left after eject()', async () => {
    const { navios } = recordingClient()
    const seen: string[] = []
    const id = navios.interceptors.request.use(() => {
      seen.push('ejected')
    })
    navios.interceptors.request.use(() => {
      seen.push('kept')
    })
    navios.interceptors.request.eject(id)

    await navios.get('/')

    expect(seen).toEqual(['kept'])
  })

  it('should hand a network failure to the rejected response interceptors', async () => {
    const navios = create({
      baseURL: 'http://x.test',
      adapter: async () => {
        throw new TypeError('fetch failed')
      },
    })
    navios.interceptors.response.use(null, (error) => {
      expect(error).toBeInstanceOf(HttpClientError)
      expect(error.response).toBeNull()
      return { data: 'recovered', status: 200, statusText: '', headers: new Headers() }
    })

    expect((await navios.get('/')).data).toBe('recovered')
  })

  it('should hand what a request interceptor throws to the rejected response interceptors', async () => {
    const { navios, calls } = recordingClient()
    const thrown = new Error('no token')
    const seen: unknown[] = []
    navios.interceptors.request.use(() => {
      throw thrown
    })
    navios.interceptors.response.use(null, (error) => {
      seen.push(error)
      throw error
    })

    await expect(navios.get('/')).rejects.toBe(thrown)
    expect(seen).toEqual([thrown])
    expect(calls).toHaveLength(0)
  })

  it('should reject with what a response interceptor throws', async () => {
    const { navios } = recordingClient()
    const thrown = new Error('boom')
    navios.interceptors.response.use(() => {
      throw thrown
    })

    await expect(navios.get('/')).rejects.toBe(thrown)
  })

  it('should not repeat the query when error.config is sent again', async () => {
    const { navios, calls } = recordingClient({}, (call) =>
      call.init.headers.authorization === 'new'
        ? Response.json({ ok: true })
        : new Response('{}', { status: 401 }),
    )
    const controller = new AbortController()
    navios.interceptors.response.use(null, (error) => {
      if (error.response?.status !== 401) throw error
      return navios.request({
        ...error.config,
        headers: { ...error.config.headers, Authorization: 'new' },
      })
    })

    const response = await navios.post(
      '/q?fixed=1',
      { a: 1 },
      { params: { page: 1 }, timeout: 1000, signal: controller.signal },
    )

    expect(response.data).toEqual({ ok: true })
    expect(calls.map((call) => call.url)).toEqual([
      'http://x.test/q?fixed=1&page=1',
      'http://x.test/q?fixed=1&page=1',
    ])
    expect(calls[1]!.init.body).toBe('{"a":1}')
    expect(calls[1]!.init.headers['content-type']).toBe('application/json')
    // Both requests run under a timeout signal of their own
    expect(calls[1]!.init.signal).not.toBe(calls[0]!.init.signal)
    expect(calls[1]!.init.signal!.aborted).toBe(false)
  })

  it('should keep changes an interceptor makes in place from the objects of the caller', async () => {
    const { navios, calls } = recordingClient()
    navios.interceptors.request.use((config) => {
      Object.assign(config.params as object, { trace: 't' })
      if (Array.isArray(config.data)) config.data.push(2)
      else Object.assign(config.data as object, { csrf: 'c' })
    })
    const params = Object.freeze({ page: 1 })
    const data = Object.freeze({ a: 1 })
    const list = Object.freeze([1])

    await navios.post('/', data, { params })
    await navios.post('/', list, { params })

    expect(calls.map((call) => [call.url, call.init.body])).toEqual([
      ['http://x.test/?page=1&trace=t', '{"a":1,"csrf":"c"}'],
      ['http://x.test/?page=1&trace=t', '[1,2]'],
    ])
    expect(params).toEqual({ page: 1 })
    expect(data).toEqual({ a: 1 })
    expect(list).toEqual([1])
  })

  it('should keep changes an interceptor makes in place from the defaults', async () => {
    const { navios, calls } = recordingClient({ params: { key: 'k' } } as object)
    navios.interceptors.request.use((config) => {
      Object.assign(config.params as object, { [`n${calls.length}`]: 1 })
    })

    await navios.get('/')
    await navios.get('/')

    expect(calls.map((call) => call.url)).toEqual([
      'http://x.test/?key=k&n0=1',
      'http://x.test/?key=k&n1=1',
    ])
  })

  it('should hand anything but a plain object or array to interceptors as it is', async () => {
    class Order {
      constructor(readonly id: number) {}
      toJSON() {
        return { order: this.id }
      }
    }
    const { navios, calls } = recordingClient()
    const seen: unknown[] = []
    navios.interceptors.request.use((config) => {
      seen.push(config.data)
    })
    const values = [new Order(1), new FormData(), new URLSearchParams('a=1'), new Uint8Array(1)]

    for (const value of values) await navios.post('/', value)

    values.forEach((value, index) => expect(seen[index]).toBe(value))
    expect(calls[0]!.init.body).toBe('{"order":1}')
  })

  it.each([
    ['nothing', () => undefined],
    ['null', () => null],
  ])(
    'should reject when the rejected request interceptor returns %s',
    async (_name, onRejected) => {
      const { navios, calls } = recordingClient()
      navios.interceptors.request.use(() => {
        throw new Error('no token')
      })
      navios.interceptors.request.use(undefined, onRejected)

      const error = await navios.get('/a').catch((err) => err)

      expect(error).toBeInstanceOf(HttpClientError)
      expect(error.code).toBe('ERR_BAD_OPTION_VALUE')
      expect(error.message).toMatch(/interceptor returned no config/)
      expect(error.toJSON()).toMatchObject({ method: 'GET', url: '/a' })
      expect(calls).toHaveLength(0)
    },
  )
})
