import { describe, expect, it } from 'vitest'

import { create } from '../client/create-navios.mjs'

import { recordingClient } from './recording-client.mjs'

describe('navios::defaults', () => {
  it('should apply the timeout of the client to every request', async () => {
    const navios = create({
      baseURL: 'http://x.test',
      timeout: 10,
      adapter: (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
        }),
    })

    const error = await navios.get('/slow').catch((err) => err)

    expect(error.code).toBe('ECONNABORTED')
  })

  it('should apply the credentials of the client, and let a request replace them', async () => {
    const { navios, calls } = recordingClient({ credentials: 'include' })
    navios.defaults.timeout = 5000

    await navios.get('/a')
    await navios.get('/b', { credentials: 'omit' })

    expect(calls[0]!.init.credentials).toBe('include')
    expect(calls[1]!.init.credentials).toBe('omit')
  })
})

describe('navios::create on a client', () => {
  it('should inherit the defaults of the client it was called on', async () => {
    const { navios: parent, calls } = recordingClient({
      baseURL: 'http://parent.test/api',
      headers: { 'X-Tenant': 'acme', 'X-Kept': '1' },
      responseType: 'text',
      timeout: 1000,
    })

    const child = parent.create({ headers: { 'x-tenant': 'other' } })
    const { data } = await child.get('/users')

    expect(calls[0]!.url).toBe('http://parent.test/api/users')
    expect(calls[0]!.init.headers).toEqual({ 'x-tenant': 'other', 'x-kept': '1' })
    expect(data).toBe('{}')
    expect(child.defaults.timeout).toBe(1000)
  })

  it('should let the config replace an inherited default', async () => {
    const { navios: parent, calls } = recordingClient({ baseURL: 'http://parent.test' })

    await parent.create({ baseURL: 'http://child.test' }).get('/users')

    expect(calls[0]!.url).toBe('http://child.test/users')
  })

  it('should read the defaults of the parent when it is called', async () => {
    const { navios: parent, calls } = recordingClient()
    parent.defaults.headers['X-Late'] = 'yes'

    const child = parent.create()
    parent.defaults.headers['X-Later'] = 'no'
    child.defaults.headers['X-Child'] = 'own'
    await child.get('/a')
    await parent.get('/b')

    expect(calls[0]!.init.headers).toEqual({ 'x-late': 'yes', 'x-child': 'own' })
    expect(calls[1]!.init.headers).toEqual({ 'x-late': 'yes', 'x-later': 'no' })
  })

  it('should not inherit interceptors', async () => {
    const { navios: parent, calls } = recordingClient()
    parent.interceptors.request.use((config) => {
      config.headers['x-intercepted'] = '1'
    })

    await parent.create().get('/a')

    expect(calls[0]!.init.headers).toEqual({})
  })

  it('should leave the exported create without defaults of any client', async () => {
    const calls: string[] = []
    const client = create({
      adapter: async (url) => {
        calls.push(url)
        return Response.json({})
      },
    })

    await client.get('http://own.test/a')

    expect(client.defaults.baseURL).toBeUndefined()
    expect(calls).toEqual(['http://own.test/a'])
  })
})
