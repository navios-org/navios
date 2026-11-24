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

  it('still accepts a trailing slash', async () => {
    const match = await createApp()
    expect(await match('/reports/export/')).toEqual({ route: '/reports/export', urlParams: {} })
    expect(await match('/reports/42/')).toEqual({ route: '/reports/$id', urlParams: { id: '42' } })
  })
})
