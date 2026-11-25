import { registerController } from '../controllers/controller.mjs'
import { handler } from '../handlers/handler.mjs'

import { s } from './schema.mjs'
import { endpoint } from './suite.mjs'

import type { ConformanceSuite } from './suite.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Methods: `HEAD` of a `GET` route, a method that a path is not served for,
 * and one that is declared in lower case.
 * @internal
 */
export function defineMethodsTopic(suite: ConformanceSuite) {
  const { it, expect, url, fetch } = suite

  class MethodsController {
    get = handler(
      endpoint({
        method: 'GET',
        url: '/methods/$id',
        responseSchema: s.object({ id: s.string() }),
      }),
      ({ urlParams }: any) => urlParams,
    )

    put = handler(endpoint({ method: 'PUT', url: '/methods/$id' }), () => ({}))

    fixed = handler(endpoint({ method: 'DELETE', url: '/methods/fixed' }), () => ({}))

    lowerCase = handler(endpoint({ method: 'patch', url: '/methods/$id' }), () => ({
      patched: true,
    }))
  }
  registerController(MethodsController, { attributes: [suite.Public()] })

  return {
    controllers: [MethodsController],
    tests() {
      it('answers HEAD with the headers of the GET route and no body', async () => {
        const response = await fetch(url('/methods/7'), { method: 'HEAD' })
        expect(response.status).toBe(200)
        expect(response.headers.get('content-type')).toContain('application/json')
        expect(await response.text()).toBe('')
        expect((await fetch(url('/nowhere'), { method: 'HEAD' })).status).toBe(404)

        const injected = await suite.app.inject({ method: 'HEAD', url: '/api/methods/7' })
        expect(injected.status).toBe(200)
        expect(injected.text).toBe('')
      })

      it('answers 405 with the methods that a path is served for', async () => {
        const notAllowed = async (method: string, path: string, allow: string) => {
          const response = await fetch(url(path), { method })
          expect(response.status).toBe(405)
          expect(response.headers.get('allow')).toBe(allow)
          expect(response.headers.get('content-type')).toContain('application/problem+json')
          expect((await response.json()).title).toBe('Method Not Allowed')

          const injected = await suite.app.inject({ method, url: `/api${path}` })
          expect(injected.status).toBe(405)
          expect(injected.headers.allow).toBe(allow)
        }
        await notAllowed('POST', '/methods/7', 'GET, HEAD, PATCH, PUT')
        await notAllowed('OPTIONS', '/methods/7', 'GET, HEAD, PATCH, PUT')
        // Every route that has the path counts.
        await notAllowed('POST', '/methods/fixed', 'DELETE, GET, HEAD, PATCH, PUT')
        expect((await fetch(url('/methods/7/x'), { method: 'POST' })).status).toBe(404)
      })

      it('serves a method that is declared in lower case', async () => {
        const response = await fetch(url('/methods/7'), { method: 'PATCH' })
        expect(await response.json()).toEqual({ patched: true })
      })
    },
  }
}
