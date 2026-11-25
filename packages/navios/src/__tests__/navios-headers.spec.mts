import { describe, expect, it } from 'vitest'

import { recordingClient } from './recording-client.mjs'

describe('navios::headers', () => {
  it('should let a header of the call replace a default one spelled differently', async () => {
    const { navios, calls } = recordingClient({ headers: { authorization: 'Bearer default' } })

    await navios.get('/', { headers: { Authorization: 'Bearer per-call' } })

    expect(new Headers(calls[0]!.init.headers).get('authorization')).toBe('Bearer per-call')
  })

  it('should send a content type of the caller once for an object body', async () => {
    const { navios, calls } = recordingClient()

    await navios.post('/', { a: 1 }, { headers: { 'content-type': 'application/json' } })

    expect(new Headers(calls[0]!.init.headers).get('content-type')).toBe('application/json')
  })

  it('should keep a custom JSON content type for an object body', async () => {
    const { navios, calls } = recordingClient()

    await navios.post('/', { a: 1 }, { headers: { 'Content-Type': 'application/vnd.api+json' } })

    expect(calls[0]!.init.body).toBe('{"a":1}')
    expect(new Headers(calls[0]!.init.headers).get('content-type')).toBe('application/vnd.api+json')
  })

  it.each([
    ['a Headers instance', new Headers({ 'X-A': '1' })],
    ['entries', [['X-A', '1']] as [string, string][]],
  ])('should accept %s', async (_name, headers) => {
    const { navios, calls } = recordingClient({ headers: { 'x-b': '2' } })

    await navios.get('/', { headers })

    expect(calls[0]!.init.headers).toEqual({ 'x-a': '1', 'x-b': '2' })
  })

  it('should skip undefined headers', async () => {
    const { navios, calls } = recordingClient({ headers: { 'x-a': 'default' } })

    await navios.get('/', { headers: { 'X-A': undefined, 'x-b': undefined } })

    expect(calls[0]!.init.headers).toEqual({ 'x-a': 'default' })
  })

  it('should let a request interceptor replace a header spelled differently', async () => {
    const { navios, calls } = recordingClient({ headers: { authorization: 'old' } })
    navios.interceptors.request.use((config) => {
      config.headers.Authorization = 'new'
      return config
    })

    await navios.get('/')

    expect(new Headers(calls[0]!.init.headers).get('authorization')).toBe('new')
  })

  it('should leave the content type of a FormData body to fetch', async () => {
    const { navios, calls } = recordingClient({ headers: { 'Content-Type': 'application/json' } })
    const form = new FormData()
    form.append('a', 'x')

    await navios.post('/', form)

    expect(calls[0]!.init.body).toBe(form)
    expect(calls[0]!.init.headers).toEqual({})
  })

  it('should read changed defaults for every request', async () => {
    const { navios, calls } = recordingClient()
    navios.defaults.headers['X-A'] = '1'

    await navios.get('/')

    expect(calls[0]!.init.headers).toEqual({ 'x-a': '1' })
  })

  describe('a header record, whatever case a name is in', () => {
    const client = () => recordingClient({ headers: { Authorization: 'Bearer default' } })

    it('should let a default be read, changed and deleted', async () => {
      const { navios, calls } = client()
      const { headers } = navios.defaults

      expect(headers.Authorization).toBe('Bearer default')
      expect('AUTHORIZATION' in headers).toBe(true)
      expect(Object.hasOwn(headers, 'Authorization')).toBe(true)

      headers.AUTHORIZATION = 'Bearer changed'
      await navios.get('/')
      delete headers.Authorization
      await navios.get('/')

      expect(calls.map((call) => call.init.headers)).toEqual([
        { authorization: 'Bearer changed' },
        {},
      ])
    })

    it('should show an interceptor the header of the call', async () => {
      const { navios, calls } = recordingClient()
      navios.interceptors.request.use((config) => {
        if (!config.headers.Authorization) config.headers.Authorization = 'Bearer session'
        delete config.headers['x-remove']
      })

      await navios.get('/', { headers: { authorization: 'Bearer call', 'X-Remove': '1' } })
      await navios.get('/')

      expect(calls.map((call) => call.init.headers)).toEqual([
        { authorization: 'Bearer call' },
        { authorization: 'Bearer session' },
      ])
    })

    it('should be a plain object to whoever spreads, lists or serialises it', () => {
      const { headers } = client().navios.defaults
      headers['X-A'] = '1'
      const plain = { authorization: 'Bearer default', 'x-a': '1' }

      expect({ ...headers }).toEqual(plain)
      expect(Object.keys(headers)).toEqual(['authorization', 'x-a'])
      expect(Object.entries(headers)).toEqual(Object.entries(plain))
      expect(JSON.stringify(headers)).toBe(JSON.stringify(plain))
      expect(headers).toEqual(plain)
      expect([...new Headers(headers)]).toEqual(Object.entries(plain))
      expect(`${headers}`).toBe('[object Object]')
      expect(headers.hasOwnProperty('X-A')).toBe(true)
    })

    it('should keep the headers of one request from the defaults and the caller', async () => {
      const { navios, calls } = client()
      const own = { 'X-A': '1' }
      navios.interceptors.request.use((config) => {
        config.headers.Authorization = 'Bearer request'
        config.headers['x-a'] = '2'
      })

      await navios.get('/', { headers: own })

      expect(calls[0]!.init.headers).toEqual({ authorization: 'Bearer request', 'x-a': '2' })
      expect(navios.defaults.headers).toEqual({ authorization: 'Bearer default' })
      expect(own).toEqual({ 'X-A': '1' })
    })
  })

  it('should leave one spelling of a header an interceptor replaced the record for', async () => {
    const { navios, calls } = recordingClient(
      { headers: { authorization: 'Bearer default' } },
      () => new Response(null, { status: 401 }),
    )
    navios.interceptors.request.use((config) => ({
      ...config,
      headers: { ...config.headers, Authorization: 'Bearer session' },
    }))

    const error = await navios.get('/').catch((err) => err)

    expect(calls[0]!.init.headers).toEqual({ authorization: 'Bearer session' })
    expect({ ...error.config.headers }).toEqual({ authorization: 'Bearer session' })
    expect(error.config.headers.Authorization).toBe('Bearer session')
  })

  it('should send the new token of a retry that spreads the headers of error.config', async () => {
    const { navios, calls } = recordingClient({ headers: { Authorization: 'default' } }, (call) =>
      call.init.headers.authorization === 'new'
        ? Response.json({ ok: true })
        : new Response('{}', { status: 401 }),
    )
    const retry = recordingClient()
    navios.interceptors.request.use((config) => ({
      ...config,
      headers: { ...config.headers, Authorization: 'old' },
    }))
    navios.interceptors.response.use(null, (error) => {
      const authorization = 'new'
      return retry.navios.request({
        ...error.config,
        headers: { ...error.config.headers, authorization },
      })
    })

    await navios.get('/')

    expect(calls[0]!.init.headers).toEqual({ authorization: 'old' })
    expect(retry.calls[0]!.init.headers).toEqual({ authorization: 'new' })
  })
})
