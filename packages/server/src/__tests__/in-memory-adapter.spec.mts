import { afterEach, describe, expect, it } from 'vitest'

import { Controller, handler, Module, NaviosFactory } from '../index.mjs'
import { defineInMemoryEnvironment } from '../testing/index.mjs'

import type { NaviosApplication } from '../index.mjs'

const get = (url: string) => ({ config: { method: 'GET', url } }) as never
const matched = (route: string) => (params: { urlParams?: Record<string, string> }) => ({
  route,
  urlParams: params.urlParams ?? {},
})

describe('in-memory adapter: route matching', () => {
  let app: NaviosApplication | null = null

  afterEach(async () => {
    await app?.close()
    app = null
  })

  // The same table as the 'prefers a static segment' case of the adapter
  // conformance suite, which the Fastify and Bun adapters run over HTTP.
  async function createApp() {
    @Controller()
    class PrecedenceController {
      byId = handler(get('/reports/$id'), matched('/reports/$id'))
      export = handler(get('/reports/export'), matched('/reports/export'))
      detail = handler(get('/reports/$id/detail'), matched('/reports/$id/detail'))
      exportNamed = handler(get('/reports/export/$name'), matched('/reports/export/$name'))
      anyPair = handler(get('/pairs/$a/$b'), matched('/pairs/$a/$b'))
      secondFixed = handler(get('/pairs/$a/fixed'), matched('/pairs/$a/fixed'))
      firstFixed = handler(get('/pairs/fixed/$b'), matched('/pairs/fixed/$b'))
      paramThenStatic = handler(get('/trees/$a/leaf'), matched('/trees/$a/leaf'))
      staticBranch = handler(get('/trees/oak/root'), matched('/trees/oak/root'))
    }

    @Module({ controllers: [PrecedenceController] })
    class AppModule {}

    app = await NaviosFactory.create(AppModule, {
      adapter: defineInMemoryEnvironment(),
      logger: false,
    })
    const created = app
    return async (url: string) => (await created.inject({ method: 'GET', url })).body
  }

  it('prefers a static route to a param route registered before it', async () => {
    const match = await createApp()
    expect(await match('/reports/export')).toEqual({ route: '/reports/export', urlParams: {} })
    expect(await match('/reports/42')).toEqual({ route: '/reports/$id', urlParams: { id: '42' } })
  })

  it('lets the first segment that differs decide', async () => {
    const match = await createApp()
    expect(await match('/reports/export/detail')).toEqual({
      route: '/reports/export/$name',
      urlParams: { name: 'detail' },
    })
    expect(await match('/reports/42/detail')).toEqual({
      route: '/reports/$id/detail',
      urlParams: { id: '42' },
    })
    expect(await match('/pairs/fixed/fixed')).toEqual({
      route: '/pairs/fixed/$b',
      urlParams: { b: 'fixed' },
    })
    expect(await match('/pairs/x/fixed')).toEqual({
      route: '/pairs/$a/fixed',
      urlParams: { a: 'x' },
    })
    expect(await match('/pairs/x/y')).toEqual({
      route: '/pairs/$a/$b',
      urlParams: { a: 'x', b: 'y' },
    })
  })

  it('falls back to a param route when a static segment leads nowhere', async () => {
    const match = await createApp()
    expect(await match('/trees/oak/leaf')).toEqual({
      route: '/trees/$a/leaf',
      urlParams: { a: 'oak' },
    })
    expect(await match('/trees/oak/root')).toEqual({ route: '/trees/oak/root', urlParams: {} })
  })

  // As on the Fastify and Bun adapters: see the 'does not match a path with a
  // trailing slash' case of the adapter conformance suite.
  it('does not match a path with a trailing slash', async () => {
    const match = await createApp()
    const created = app!
    for (const url of ['/reports/export/', '/reports/42/', '/reports/42/detail/', '/pairs/x/y/']) {
      const response = await created.inject({ method: 'GET', url })
      expect(response.status, url).toBe(404)
      expect(response.headers['content-type'], url).toContain('application/problem+json')
    }
    // The query string is not part of the path.
    expect(await match('/reports/export?format=csv')).toEqual({
      route: '/reports/export',
      urlParams: {},
    })
    expect(
      (await created.inject({ method: 'GET', url: '/reports/export/?format=csv' })).status,
    ).toBe(404)
  })

  it('does not take an empty segment for a url param', async () => {
    await createApp()
    const response = await app!.inject({ method: 'GET', url: '/reports/' })
    expect(response.status).toBe(404)
  })
})

describe('in-memory adapter: trailing slash with a prefix and at the root', () => {
  let app: NaviosApplication | null = null

  afterEach(async () => {
    await app?.close()
    app = null
  })

  async function createApp(globalPrefix?: string) {
    @Controller()
    class RootController {
      root = handler(get('/'), matched('/'))
      users = handler(get('/users'), matched('/users'))
    }

    @Module({ controllers: [RootController] })
    class AppModule {}

    app = await NaviosFactory.create(AppModule, {
      adapter: defineInMemoryEnvironment(),
      logger: false,
      globalPrefix,
    })
    const created = app
    return async (url: string) => (await created.inject({ method: 'GET', url })).status
  }

  it('matches the root path as "/" only', async () => {
    const status = await createApp()
    expect(await status('/')).toBe(200)
    expect(await status('')).toBe(200)
    expect(await status('/users')).toBe(200)
    expect(await status('/users/')).toBe(404)
  })

  it('matches the root of a global prefix without a trailing slash only', async () => {
    const status = await createApp('/api')
    expect(await status('/api')).toBe(200)
    expect(await status('/api/')).toBe(404)
    expect(await status('/api/users')).toBe(200)
    expect(await status('/api/users/')).toBe(404)
    expect(await status('/')).toBe(404)
  })
})

describe('in-memory adapter: query string and content type', () => {
  let app: NaviosApplication | null = null

  afterEach(async () => {
    await app?.close()
    app = null
  })

  async function createApp() {
    @Controller()
    class QueryController {
      search = handler(get('/search'), (_params: unknown, ctx: { query: unknown }) => ({
        query: ctx.query,
      }))
    }

    @Module({ controllers: [QueryController] })
    class AppModule {}

    app = await NaviosFactory.create(AppModule, {
      adapter: defineInMemoryEnvironment(),
      logger: false,
    })
    return app
  }

  it('gives a repeated query parameter as an array, like the Fastify and Bun adapters', async () => {
    const created = await createApp()
    const response = await created.inject({ method: 'GET', url: '/search?tag=a&tag=b&tag=c&q=x' })
    expect(response.body).toEqual({ query: { tag: ['a', 'b', 'c'], q: 'x' } })
  })

  it('takes query parameters named like members of Object.prototype as plain parameters', async () => {
    const created = await createApp()
    const response = await created.inject({
      method: 'GET',
      url: '/search?constructor=a&constructor=b&toString=c',
    })
    expect(response.body).toEqual({ query: { constructor: ['a', 'b'], toString: 'c' } })
  })

  it('sends JSON with a charset, like the Fastify and Bun adapters', async () => {
    const created = await createApp()
    const response = await created.inject({ method: 'GET', url: '/search' })
    expect(response.headers['content-type']).toBe('application/json; charset=utf-8')
  })
})
