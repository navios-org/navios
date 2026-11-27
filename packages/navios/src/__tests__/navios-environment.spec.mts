import { afterEach, describe, expect, it, vi } from 'vitest'

describe('navios::environment', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('should be importable where there is no fetch, FormData or URLSearchParams', async () => {
    vi.resetModules()
    const names = ['fetch', 'FormData', 'URLSearchParams', 'Headers'] as const
    const descriptors = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name)!)
    names.forEach((name) => Reflect.deleteProperty(globalThis, name))
    try {
      const { create } = await import('../index.mjs')
      expect(() => create()).not.toThrow()
    } finally {
      names.forEach((name, i) => Object.defineProperty(globalThis, name, descriptors[i]!))
    }
  })

  it('should use a fetch that was replaced after create()', async () => {
    const { create, default: navios } = await import('../index.mjs')
    const client = create({ baseURL: 'http://x.test' })
    const patched = vi.fn(async () => Response.json({ patched: true }))
    vi.stubGlobal('fetch', patched)

    expect((await client.get('/')).data).toEqual({ patched: true })
    expect((await navios.get('http://x.test/')).data).toEqual({ patched: true })
    expect(patched).toHaveBeenCalledTimes(2)
  })

  it('should have a default export that is callable and a complete client', async () => {
    const { default: navios } = await import('../index.mjs')
    const fetchMock = vi.fn(async () => Response.json({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    const id = navios.interceptors.request.use((config) => {
      config.headers['x-a'] = '1'
    })

    expect((await navios({ url: 'http://x.test/a' })).data).toEqual({ ok: true })
    expect((await navios.request({ url: 'http://x.test/a' })).data).toEqual({ ok: true })
    navios.defaults.headers['x-default'] = '1'
    expect(navios.create().defaults.headers).toEqual({ 'x-default': '1' })
    delete navios.defaults.headers['x-default']
    expect(navios.defaults.responseType).toBe('json')
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.headers).toEqual({ 'x-a': '1' })
    navios.interceptors.request.eject(id)
  })
})
