import { registerController } from '../controllers/controller.mjs'
import { handler } from '../handlers/handler.mjs'

import type { RequestContext } from '../context/request-context.mjs'

import { endpoint } from './suite.mjs'

import type { ConformanceSuite } from './suite.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/** What a fetch handler sees of a request. */
async function describeRequest(request: Request) {
  const url = new URL(request.url)
  return {
    method: request.method,
    target: `${url.pathname}${url.search}`,
    contentType: request.headers.get('content-type'),
    custom: request.headers.get('x-custom'),
    body: request.body === null ? null : await request.text(),
  }
}

/** A handler written for `fetch`, as a library would export it. */
async function fetchHandler(request: Request): Promise<Response> {
  const headers = new Headers({ 'content-type': 'text/plain; charset=utf-8' })
  headers.append('set-cookie', 'first=1; Path=/')
  headers.append('set-cookie', 'second=2; Path=/')
  return new Response(
    `${request.method} ${new URL(request.url).pathname}: ${await request.text()}`,
    {
      status: 201,
      headers,
    },
  )
}

/**
 * What code written for `fetch` needs of a server: a rest param that takes
 * the rest of the path, the request as a Web `Request`, and a returned
 * `Response` sent as it is.
 * @internal
 */
export function defineFetchHandlersTopic(suite: ConformanceSuite) {
  const { it, expect, url, fetch } = suite

  const matched = (route: string) => (params: any, ctx: RequestContext) => ({
    route,
    urlParams: params.urlParams ?? {},
    path: ctx.path,
  })

  class FetchHandlersController {
    rest = handler(endpoint({ method: 'GET', url: '/rest/$path*' }), matched('/rest/$path*'))
    restFixed = handler(endpoint({ method: 'GET', url: '/rest/fixed' }), matched('/rest/fixed'))
    restParam = handler(
      endpoint({ method: 'GET', url: '/rest/$id/meta' }),
      matched('/rest/$id/meta'),
    )

    echoGet = handler(endpoint({ method: 'GET', url: '/fetch/echo/$path*' }), async (_p, ctx) =>
      describeRequest(await ctx.toWebRequest()),
    )
    echoPost = handler(endpoint({ method: 'POST', url: '/fetch/echo/$path*' }), async (_p, ctx) =>
      describeRequest(await ctx.toWebRequest()),
    )

    rewrap = handler(endpoint({ method: 'GET', url: '/fetch/rewrap/$path*' }), async (_p, ctx) => {
      // What a fetch handler may do with the request: make another one from it.
      const request = new Request(await ctx.toWebRequest(), { headers: { 'x-rewrapped': '1' } })
      return { ...(await describeRequest(request)), rewrapped: request.headers.get('x-rewrapped') }
    })

    mount = handler(
      endpoint({ method: 'POST', url: '/fetch/mount/$path*', response: 'stream' }),
      async (_p, ctx) => fetchHandler(await ctx.toWebRequest()),
    )
    streamed = handler(
      endpoint({ method: 'GET', url: '/fetch/stream', response: 'stream' }),
      () => {
        const encoder = new TextEncoder()
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(encoder.encode('one,'))
              controller.enqueue(encoder.encode('two'))
              controller.close()
            },
          }),
          { headers: { 'content-type': 'text/csv' } },
        )
      },
    )
    redirect = handler(
      endpoint({ method: 'GET', url: '/fetch/redirect', response: 'stream' }),
      () => new Response(null, { status: 302, headers: { location: '/elsewhere' } }),
    )
  }
  registerController(FetchHandlersController, { attributes: [suite.Public()] })

  return {
    controllers: [FetchHandlersController],
    tests() {
      it('matches the rest of the path with a rest param, over HTTP and with inject()', async () => {
        const expected = {
          route: '/rest/$path*',
          urlParams: { path: 'a b/c.txt' },
          path: '/api/rest/a%20b/c.txt',
        }
        expect(await (await fetch(url('/rest/a%20b/c.txt'))).json()).toEqual(expected)
        const injected = await suite.app.inject({ method: 'GET', url: '/api/rest/a%20b/c.txt' })
        expect(injected.body).toEqual(expected)
      })

      it('prefers fixed text and a url param to a rest param', async () => {
        const match = async (path: string) => ((await (await fetch(url(path))).json()) as any).route

        expect(await match('/rest/fixed')).toBe('/rest/fixed')
        expect(await match('/rest/x/meta')).toBe('/rest/$id/meta')
        expect(await match('/rest/x/other')).toBe('/rest/$path*')
        expect(await match('/rest/x')).toBe('/rest/$path*')
      })

      it('matches no empty rest, and no empty segment in it', async () => {
        for (const path of ['/rest', '/rest/', '/rest/a//b', '/rest/a/']) {
          const response = await fetch(url(path))
          expect(response.status).toBe(404)
          expect(response.headers.get('content-type')).toContain('application/problem+json')
          const injected = await suite.app.inject({ method: 'GET', url: `/api${path}` })
          expect(injected.status).toBe(404)
        }
      })

      it('gives ctx.toWebRequest() the method, the target, the headers and the body', async () => {
        const response = await fetch(url('/fetch/echo/a/b?x=1&y=two'), {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-custom': 'yes' },
          body: 'a=1&b=two+words',
        })

        expect(await response.json()).toEqual({
          method: 'POST',
          target: '/api/fetch/echo/a/b?x=1&y=two',
          contentType: 'application/x-www-form-urlencoded',
          custom: 'yes',
          body: 'a=1&b=two+words',
        })
        const get = await fetch(url('/fetch/echo/x'))
        expect(await get.json()).toMatchObject({ method: 'GET', target: '/api/fetch/echo/x' })
      })

      it('gives ctx.toWebRequest() the target as it was sent, over HTTP and with inject()', async () => {
        const target = '/api/fetch/echo/a%2Fb/c%20d?q=%2F'
        const served = await fetch(url('/fetch/echo/a%2Fb/c%20d?q=%2F'))
        expect(await served.json()).toMatchObject({ target })
        const injected = await suite.app.inject({ method: 'GET', url: target })
        expect(injected.body).toMatchObject({ target })
      })

      it('gives a request that a fetch handler can make another request from', async () => {
        const response = await fetch(url('/fetch/rewrap/a/b'))

        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
          method: 'GET',
          target: '/api/fetch/rewrap/a/b',
          rewrapped: '1',
        })
      })

      it('sends what a fetch handler returns: status, headers, every cookie and the body', async () => {
        const response = await fetch(url('/fetch/mount/sign-in'), { method: 'POST', body: 'hi' })

        expect(response.status).toBe(201)
        expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8')
        expect(response.headers.getSetCookie()).toEqual(['first=1; Path=/', 'second=2; Path=/'])
        expect(await response.text()).toBe('POST /api/fetch/mount/sign-in: hi')
      })

      it('streams the body of a returned Response, and sends a redirect without one', async () => {
        const streamed = await fetch(url('/fetch/stream'))
        expect(streamed.headers.get('content-type')).toBe('text/csv')
        expect(await streamed.text()).toBe('one,two')

        const redirect = await fetch(url('/fetch/redirect'), { redirect: 'manual' })
        expect(redirect.status).toBe(302)
        expect(redirect.headers.get('location')).toBe('/elsewhere')
      })
    },
  }
}
