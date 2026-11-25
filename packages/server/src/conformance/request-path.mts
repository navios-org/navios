import { registerModule } from '@navios/core'
import { registerInjectable } from '@navios/di'

import { NaviosFactory } from '../application/navios-factory.mjs'
import { registerController } from '../controllers/controller.mjs'
import { handler } from '../handlers/handler.mjs'

import type { RequestContext } from '../context/request-context.mjs'
import type { HttpGuard as Guard } from '../routing/http-contracts.mjs'

import { rawRequest } from './raw-request.mjs'
import { endpoint } from './suite.mjs'

import type { ConformanceSuite } from './suite.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * What a request says about where it goes and comes from: one form of
 * `ctx.path` for what was matched, `ctx.url`, `ctx.ip`, and the paths that
 * cannot be declared.
 * @internal
 */
export function defineRequestPathTopic(suite: ConformanceSuite) {
  const { it, expect, url, fetch } = suite

  class PathGuard implements Guard {
    canActivate(ctx: RequestContext) {
      return !ctx.path.startsWith('/api/where/admin')
    }
  }
  registerInjectable(PathGuard)

  const where = (_params: any, ctx: RequestContext) => ({
    path: ctx.path,
    pathname: ctx.url.pathname,
    search: ctx.url.search,
    host: ctx.url.host,
    isUrl: ctx.url instanceof URL && ctx.url === ctx.url,
    urlParams: ctx.urlParams,
    ip: ctx.ip ?? null,
  })

  class WhereController {
    fixed = handler(endpoint({ method: 'GET', url: '/where/fixed' }), where)
    param = handler(endpoint({ method: 'GET', url: '/where/is/$id' }), where)
    trailing = handler(endpoint({ method: 'GET', url: '/where/trailing/' }), where)
    colon = handler(endpoint({ method: 'GET', url: '/where/things:batch' }), where)
    encoded = handler(endpoint({ method: 'GET', url: '/where/caf%C3%A9' }), where)
    brackets = handler(endpoint({ method: 'GET', url: '/where/a[b]' }), where)
    adminFixed = handler(endpoint({ method: 'GET', url: '/where/admin/secrets' }), () => 'secret')
    adminParam = handler(endpoint({ method: 'GET', url: '/where/admin/$id' }), () => 'secret')
  }
  registerController(WhereController, { attributes: [suite.Public()], guards: [PathGuard] })

  class RootController {
    none = handler(endpoint({ method: 'GET', url: '' }), where)
    slash = handler(endpoint({ method: 'GET', url: '/' }), where)
  }
  registerController(RootController, { attributes: [suite.Public()] })

  class RootModule {}
  registerModule(RootModule, { controllers: [RootController], prefix: '/where-root/' })

  return {
    controllers: [WhereController],
    modules: [RootModule],
    tests() {
      it('gives the path that was matched in one form', async () => {
        for (const [path, expected = path] of [
          ['/where/fixed'],
          ['/where/fixed?x=/where/admin', '/where/fixed'],
          ['/where/trailing/'],
          ['/where/things:batch'],
          ['/where/caf%C3%A9'],
          ['/where/a[b]', '/where/a%5Bb%5D'],
          ['/where/is/7'],
          ['/where/is/a%2Fb'],
          ['/where/is/a%2fb', '/where/is/a%2Fb'],
          ['/where/is/%41%7E', '/where/is/A~'],
          ['/where/is/1;v=2'],
          ['/where/is/%D0%BF%20%25'],
        ] as Array<[string, string?]>) {
          const response = await fetch(url(path))
          expect(response.status).toBe(200)
          const body = await response.json()
          expect(body.path).toBe(`/api${expected}`)
          expect(body.pathname).toBe(body.path)
          expect(body.isUrl).toBe(true)
        }
        const response = await fetch(url('/where/is/7?a=1&a=2'))
        expect((await response.json()).search).toBe('?a=1&a=2')
      })

      it('serves a declared url as it is, after the prefix', async () => {
        const path = async (of: string) => (await (await fetch(url(of))).json()).path
        expect(await path('/where-root')).toBe('/api/where-root')
        expect(await path('/where-root/')).toBe('/api/where-root/')
        expect((await fetch(url('/where/trailing'))).status).toBe(404)
        expect((await fetch(url('/where/fixed/'))).status).toBe(404)
      })

      it('does not match a dot segment to a url param, over HTTP or with inject()', async () => {
        for (const id of ['%2e%2e', '%2E', '..', '.']) {
          const injected = await suite.app.inject({ method: 'GET', url: `/api/where/is/${id}` })
          expect(injected.status).toBe(404)
          if (suite.isServed) {
            const response = await rawRequest(suite.base, `/api/where/is/${id}`)
            expect(response.status).toBe(404)
          }
        }
      })

      it('gives the address that a test request says it comes from', async () => {
        const inject = async (remoteAddress?: string) =>
          (await suite.app.inject({ method: 'GET', url: '/api/where/fixed', remoteAddress }))
            .body as { ip: string | null }
        expect((await inject('203.0.113.7')).ip).toBe('203.0.113.7')
        expect((await inject()).ip).toBe(null)
      })

      it('does not start with a path that routers read differently', async () => {
        const start = async (paths: string[], prefix?: string) => {
          class BadPathController {
            constructor() {
              paths.forEach((path, index) => {
                ;(this as any)[`handler${index}`] = handler(
                  endpoint({ method: 'GET', url: path }),
                  () => ({}),
                )
              })
            }
          }
          registerController(BadPathController)
          class BadPathModule {}
          registerModule(BadPathModule, { controllers: [BadPathController], prefix })
          const app = await NaviosFactory.create(BadPathModule, {
            adapter: suite.options.adapter(),
            logger: false,
          })
          try {
            await app.init()
            return ''
          } catch (error) {
            return (error as Error).message
          } finally {
            await app.close()
          }
        }
        for (const path of [
          '/files/$name.json',
          '/two/$a-$b',
          '/opt/$id?',
          '/v$ver/x',
          '/users/:id',
          '/star/*',
          '/o/$id/p/$id',
          '/a//b',
          '/a/../b',
          '/a b',
          'noslash',
        ]) {
          const message = await start([path])
          expect(message).toContain('BadPathController.handler0')
          expect(message).toContain(JSON.stringify(path))
        }
        expect(await start(['/members/$id'], '/orgs/$id')).toContain('two url params named "id"')
        expect(await start(['/a/$x', '/a/$y'])).toContain('served by both')
        expect(await start(['/caf%C3%A9', '/café'])).toContain('served by both')
        expect(await start(['/v1/$name', '/v1/things:batch'])).toBe('')
      })

      if (suite.isServed) {
        it('knows the address and the host of a client', async () => {
          const body = await (await fetch(url('/where/fixed'))).json()
          expect(body.ip.endsWith('127.0.0.1')).toBe(true)
          expect(body.host).toBe(new URL(suite.base).host)
        })

        it('has one path for a guard, whatever the Host and the form of the target', async () => {
          for (const [target, host] of [
            ['/api/where/admin/secrets', 'localhost'],
            ['/api/where/admin/secrets', ''],
            ['/api/where/admin/secrets', 'a b'],
            ['/api/where/admin/secrets', 'x/y?z'],
            ['/api/where/admin/7', ''],
            ['/api/where/admin/%2e%2e', 'localhost'],
            ['/api/where/%61dmin/secrets', 'localhost'],
            ['/api/where/is/../admin/secrets', 'localhost'],
            ['http://localhost/api/where/admin/secrets', 'localhost'],
            ['http://other.example/api/where/admin/secrets', ''],
          ]) {
            const { status } = await rawRequest(suite.base, target, { host })
            // A router that does not know the form says that there is nothing.
            expect([403, 404].includes(status)).toBe(true)
          }
          for (const host of ['', 'a b']) {
            const { body } = await rawRequest(suite.base, '/api/where/is/7?a=1', { host })
            expect(body.path).toBe('/api/where/is/7')
            expect(body.pathname).toBe('/api/where/is/7')
            expect(body.search).toBe('?a=1')
            expect(body.host).toBe('localhost')
          }
          const absolute = await rawRequest(suite.base, 'http://localhost/api/where/is/7?a=1')
          expect(absolute.body.path).toBe('/api/where/is/7')
          expect(absolute.body.pathname).toBe('/api/where/is/7')
        })
      }
    },
  }
}
