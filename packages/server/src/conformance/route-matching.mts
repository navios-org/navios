import { registerModule } from '@navios/core'

import { registerController } from '../controllers/controller.mjs'
import { handler } from '../handlers/handler.mjs'

import type { RequestContext } from '../context/request-context.mjs'

import { endpoint } from './suite.mjs'

import type { ConformanceSuite } from './suite.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * How a path is matched to a route: module prefixes, static segments before
 * url params, trailing slashes and empty params.
 * @internal
 */
export function defineRouteMatchingTopic(suite: ConformanceSuite) {
  const { it, expect, url, fetch } = suite

  // Declared with the param route first: matching must not depend on the
  // order of registration.
  const matched = (route: string) => (params: any) => ({
    route,
    urlParams: params.urlParams ?? {},
  })
  class PrecedenceController {
    byId = handler(endpoint({ method: 'GET', url: '/reports/$id' }), matched('/reports/$id'))
    export = handler(
      endpoint({ method: 'GET', url: '/reports/export' }),
      matched('/reports/export'),
    )
    detail = handler(
      endpoint({ method: 'GET', url: '/reports/$id/detail' }),
      matched('/reports/$id/detail'),
    )
    exportNamed = handler(
      endpoint({ method: 'GET', url: '/reports/export/$name' }),
      matched('/reports/export/$name'),
    )
    anyPair = handler(endpoint({ method: 'GET', url: '/pairs/$a/$b' }), matched('/pairs/$a/$b'))
    secondFixed = handler(
      endpoint({ method: 'GET', url: '/pairs/$a/fixed' }),
      matched('/pairs/$a/fixed'),
    )
    firstFixed = handler(
      endpoint({ method: 'GET', url: '/pairs/fixed/$b' }),
      matched('/pairs/fixed/$b'),
    )
    paramThenStatic = handler(
      endpoint({ method: 'GET', url: '/trees/$a/leaf' }),
      matched('/trees/$a/leaf'),
    )
    staticBranch = handler(
      endpoint({ method: 'GET', url: '/trees/oak/root' }),
      matched('/trees/oak/root'),
    )
  }
  registerController(PrecedenceController, { attributes: [suite.Public()] })

  class MembersController {
    members = handler(
      endpoint({ method: 'GET', url: '/members/$id' }),
      (params: any, ctx: RequestContext) => ({
        handler: params.urlParams,
        context: ctx.urlParams,
        query: ctx.query,
      }),
    )
  }
  registerController(MembersController)

  class MembersModule {}
  registerModule(MembersModule, { controllers: [MembersController], prefix: '/orgs/$orgId' })

  return {
    controllers: [PrecedenceController],
    modules: [MembersModule],
    tests() {
      it('passes url params of a module prefix, and the raw query, to the context', async () => {
        const response = await fetch(url('/orgs/a%20b/members/7?tag=x&tag=y'))
        expect(await response.json()).toEqual({
          handler: { orgId: 'a b', id: '7' },
          context: { orgId: 'a b', id: '7' },
          query: { tag: ['x', 'y'] },
        })
      })

      it('prefers a static segment to a url param, whatever the order of registration', async () => {
        const match = async (path: string) => (await fetch(url(path))).json()

        expect(await match('/reports/export')).toEqual({ route: '/reports/export', urlParams: {} })
        expect(await match('/reports/42')).toEqual({
          route: '/reports/$id',
          urlParams: { id: '42' },
        })

        // The first segment that differs decides.
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

        // A static segment that leads nowhere falls back to the param route.
        expect(await match('/trees/oak/leaf')).toEqual({
          route: '/trees/$a/leaf',
          urlParams: { a: 'oak' },
        })
        expect(await match('/trees/oak/root')).toEqual({ route: '/trees/oak/root', urlParams: {} })

        // inject() matches like the server does.
        const injected = async (path: string) =>
          (await suite.app.inject({ method: 'GET', url: `/api${path}` })).body
        expect(await injected('/reports/export')).toEqual({
          route: '/reports/export',
          urlParams: {},
        })
        expect(await injected('/reports/42/detail')).toEqual({
          route: '/reports/$id/detail',
          urlParams: { id: '42' },
        })
        expect(await injected('/pairs/x/fixed')).toEqual({
          route: '/pairs/$a/fixed',
          urlParams: { a: 'x' },
        })
        expect(await injected('/trees/oak/leaf')).toEqual({
          route: '/trees/$a/leaf',
          urlParams: { a: 'oak' },
        })
      })

      it('does not match a path with a trailing slash, over HTTP or with inject()', async () => {
        for (const path of ['/simple/', '/items/1/parts/7/', '/simple/?x=1']) {
          const response = await fetch(url(path))
          expect(response.status).toBe(404)
          expect(response.headers.get('content-type')).toContain('application/problem+json')

          const injected = await suite.app.inject({ method: 'GET', url: `/api${path}` })
          expect(injected.status).toBe(404)
        }
        expect((await fetch(url('/simple?x=1'))).status).toBe(200)
        expect((await suite.app.inject({ method: 'GET', url: '/api/simple?x=1' })).status).toBe(200)
      })

      it('does not match an empty url param, over HTTP or with inject()', async () => {
        for (const path of ['/reports/', '/pairs//fixed', '/items//parts/7']) {
          const response = await fetch(url(path))
          expect(response.status).toBe(404)
          expect(response.headers.get('content-type')).toContain('application/problem+json')

          const injected = await suite.app.inject({ method: 'GET', url: `/api${path}` })
          expect(injected.status).toBe(404)
        }
      })
    },
  }
}
