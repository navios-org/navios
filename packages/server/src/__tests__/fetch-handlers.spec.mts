import { afterEach, describe, expect, it } from 'vitest'

import { Controller, handler, Injectable, Module, NaviosFactory } from '../index.mjs'
import { defineInMemoryEnvironment } from '../testing/index.mjs'

import type { Guard, NaviosApplication, RequestContext } from '../index.mjs'

const route = (method: string, url: string, response = 'stream') =>
  ({ config: { method, url, response } }) as never

/** What a fetch handler saw of the request. */
async function describeRequest(request: Request) {
  return {
    method: request.method,
    url: request.url,
    contentType: request.headers.get('content-type'),
    custom: request.headers.get('x-custom'),
    body: request.body === null ? null : await request.text(),
  }
}

describe('fetch handlers: rest params, ctx.toWebRequest() and returned responses', () => {
  let app: NaviosApplication | null = null

  afterEach(async () => {
    await app?.close()
    app = null
  })

  async function createApp() {
    @Injectable()
    class ReadsBodyGuard implements Guard {
      async canActivate(ctx: RequestContext) {
        await ctx.rawBody()
        return true
      }
    }

    @Controller()
    class FetchController {
      files = handler(route('GET', '/files/$path*', 'json'), (params: any, ctx) => ({
        handler: params.urlParams,
        context: ctx.urlParams,
        path: ctx.path,
      }))
      readme = handler(route('GET', '/files/readme', 'json'), () => ({ route: 'readme' }))

      echo = handler(route('POST', '/fetch/echo/$path*', 'json'), async (_params, ctx) =>
        describeRequest(await ctx.toWebRequest()),
      )
      echoGet = handler(route('GET', '/fetch/echo/$path*', 'json'), async (_params, ctx) =>
        describeRequest(await ctx.toWebRequest()),
      )
      headers = handler(route('GET', '/fetch/headers', 'json'), async (_params, ctx) => {
        const { headers } = await ctx.toWebRequest()
        return {
          connection: headers.get('connection'),
          keepAlive: headers.get('keep-alive'),
          custom: headers.get('x-custom'),
        }
      })
      echoAfterGuard = handler(
        route('POST', '/fetch/guarded/$path*', 'json'),
        { guards: [ReadsBodyGuard] },
        async (_params, ctx) => describeRequest(await ctx.toWebRequest()),
      )

      response = handler(route('GET', '/fetch/response'), (_params, ctx) => {
        ctx.reply.header('x-from-reply', 'reply')
        ctx.reply.header('x-both', 'reply')
        const headers = new Headers({
          'content-type': 'text/plain; charset=utf-8',
          'x-both': 'response',
        })
        headers.append('set-cookie', 'first=1; Path=/')
        headers.append('set-cookie', 'second=2; Path=/')
        return new Response('from fetch', { status: 201, headers })
      })
      cookies = handler(route('GET', '/fetch/cookies'), (_params, ctx) => {
        ctx.reply.append('set-cookie', 'appended=1; Path=/')
        ctx.reply.cookie('structured', '2', { path: '/' })
        return new Response(null, { status: 204, headers: { 'set-cookie': 'own=3; Path=/' } })
      })
      redirect = handler(
        route('GET', '/fetch/redirect'),
        () => new Response(null, { status: 302, headers: { location: '/elsewhere' } }),
      )
      streamed = handler(route('GET', '/fetch/stream'), () => {
        const encoder = new TextEncoder()
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode('one,'))
            controller.enqueue(encoder.encode('two'))
            controller.close()
          },
        })
        return new Response(body, { headers: { 'content-type': 'text/csv' } })
      })
    }

    @Module({ controllers: [FetchController] })
    class AppModule {}

    app = await NaviosFactory.create(AppModule, {
      adapter: defineInMemoryEnvironment(),
      logger: false,
    })
    return app
  }

  it('matches a rest param and gives its value with the slashes', async () => {
    const created = await createApp()

    const response = await created.inject({ method: 'GET', url: '/files/docs/a%20b/c.txt' })

    expect(response.body).toEqual({
      handler: { path: 'docs/a b/c.txt' },
      context: { path: 'docs/a b/c.txt' },
      path: '/files/docs/a%20b/c.txt',
    })
  })

  it('prefers a fixed route to a rest param, and matches no empty rest segment', async () => {
    const created = await createApp()

    expect((await created.inject({ method: 'GET', url: '/files/readme' })).body).toEqual({
      route: 'readme',
    })
    for (const url of ['/files', '/files/', '/files/a//b', '/files/a/']) {
      expect((await created.inject({ method: 'GET', url })).status, url).toBe(404)
    }
  })

  it('gives a fetch handler the method, url with its query, headers and body', async () => {
    const created = await createApp()

    const response = await created.inject({
      method: 'POST',
      url: '/fetch/echo/a/b?x=1&y=two',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-custom': 'yes' },
      body: 'a=1&b=two+words',
    })

    expect(response.body).toEqual({
      method: 'POST',
      url: 'http://localhost/fetch/echo/a/b?x=1&y=two',
      contentType: 'application/x-www-form-urlencoded',
      custom: 'yes',
      body: 'a=1&b=two+words',
    })
  })

  it('leaves out of a built request what belongs to the connection', async () => {
    const created = await createApp()

    const response = await created.inject({
      method: 'GET',
      url: '/fetch/headers',
      headers: { connection: 'keep-alive', 'keep-alive': 'timeout=5', 'x-custom': 'yes' },
    })

    expect(response.body).toEqual({ connection: null, keepAlive: null, custom: 'yes' })
  })

  it('keeps the target as it was sent once a guard has read the body', async () => {
    const created = await createApp()

    const response = await created.inject({
      method: 'POST',
      url: '/fetch/guarded/a%2Fb?x=%2F',
      headers: { 'content-type': 'text/plain' },
      body: 'read twice',
    })

    expect((response.body as { url: string }).url).toBe(
      'http://localhost/fetch/guarded/a%2Fb?x=%2F',
    )
  })

  it('gives a GET request without a body', async () => {
    const created = await createApp()

    const response = await created.inject({ method: 'GET', url: '/fetch/echo/x' })

    expect(response.body).toMatchObject({ method: 'GET', body: null })
  })

  it('keeps the body when a guard has read it', async () => {
    const created = await createApp()

    const response = await created.inject({
      method: 'POST',
      url: '/fetch/guarded/x',
      headers: { 'content-type': 'text/plain' },
      body: 'read twice',
    })

    expect(response.body).toMatchObject({ body: 'read twice' })
  })

  it('sends a returned Response with its status, headers and every cookie', async () => {
    const created = await createApp()

    const response = await created.inject({ method: 'GET', url: '/fetch/response' })

    expect(response.status).toBe(201)
    expect(response.text).toBe('from fetch')
    expect(response.headers['content-type']).toBe('text/plain; charset=utf-8')
    expect(response.headers['x-from-reply']).toBe('reply')
    expect(response.headers['x-both']).toBe('response')
    expect(response.cookies).toEqual(['first=1; Path=/', 'second=2; Path=/'])
  })

  it('keeps the cookies of ctx.reply next to those of a returned Response', async () => {
    const created = await createApp()

    const response = await created.inject({ method: 'GET', url: '/fetch/cookies' })

    expect(response.status).toBe(204)
    expect(response.cookies.map((cookie) => cookie.split(';')[0]).sort()).toEqual([
      'appended=1',
      'own=3',
      'structured=2',
    ])
  })

  it('sends a returned redirect without a body', async () => {
    const created = await createApp()

    const response = await created.inject({ method: 'GET', url: '/fetch/redirect' })

    expect(response.status).toBe(302)
    expect(response.headers.location).toBe('/elsewhere')
    expect(response.text).toBe('')
  })

  it('streams the body of a returned Response', async () => {
    const created = await createApp()

    const response = await created.inject({ method: 'GET', url: '/fetch/stream' })

    expect(response.text).toBe('one,two')
    expect(response.headers['content-type']).toBe('text/csv')
  })
})
