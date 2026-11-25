import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import { Controller, handler, Injectable, Module, NaviosFactory } from '../index.mjs'
import { createTestClient, defineInMemoryEnvironment } from '../testing/index.mjs'

import type { Interceptor, NaviosApplication, RequestContext, RouteResult } from '../index.mjs'

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

  // The url as it is declared, after the prefix: what a client calls whose
  // base url is the prefix.
  it('matches the root of a global prefix with the slash it is declared with', async () => {
    const status = await createApp('/api')
    expect(await status('/api/')).toBe(200)
    expect(await status('/api')).toBe(404)
    expect(await status('/api/users')).toBe(200)
    expect(await status('/api/users/')).toBe(404)
    expect(await status('/')).toBe(404)
  })
})

describe('in-memory adapter: a request is what it is over HTTP', () => {
  let app: NaviosApplication | null = null

  afterEach(async () => {
    await app?.close()
    app = null
  })

  async function createApp() {
    const anything = {
      '~standard': { version: 1, vendor: 'test', validate: (value: unknown) => ({ value }) },
    }
    const echo = (url: string, body?: 'multipart') =>
      ({ config: { method: 'POST', url, body, requestSchema: anything } }) as never
    const describeBody = ({ data }: any, ctx: RequestContext) => ({
      type: typeof data,
      data,
      contentType: ctx.headers.get('content-type')?.split(';')[0],
      length: ctx.headers.get('content-length'),
    })

    @Controller()
    class EchoController {
      echo = handler(echo('/echo'), describeBody)
      upload = handler(echo('/upload', 'multipart'), async ({ data }: any) => ({
        title: data.title,
        file: [data.file.name, data.file.type, await data.file.text()],
      }))
      item = handler(get('/items/$id'), ({ urlParams }: any) => urlParams)
      cookies = handler(get('/cookies'), (_params: any, ctx: RequestContext) => {
        ctx.reply.cookie('a', '1')
        ctx.reply.cookie('b', '2')
        return {}
      })
      status = handler(get('/status'), { interceptors: [BadStatus] }, () => ({}))
      nothing = handler(get('/function'), () => () => 'not JSON')
      feed = handler(
        { config: { method: 'GET', url: '/feed', response: 'stream' } } as never,
        async function* () {
          yield 'endless'
          await new Promise(() => {})
        },
      )
    }

    @Module({ controllers: [EchoController] })
    class AppModule {}

    app = await NaviosFactory.create(AppModule, {
      adapter: defineInMemoryEnvironment(),
      logger: false,
    })
    return app
  }

  @Injectable()
  class BadStatus implements Interceptor {
    async intercept(_ctx: RequestContext, next: () => Promise<RouteResult>) {
      return { ...(await next()), status: 700 }
    }
  }

  it('sends an object as JSON, so nothing reaches the schema that JSON does not have', async () => {
    const created = await createApp()
    const response = await created.inject({
      method: 'POST',
      url: '/echo',
      body: { date: new Date(0), gone: undefined, map: new Map([[1, 2]]), list: [undefined] },
    })
    expect(response.body).toMatchObject({
      data: { date: '1970-01-01T00:00:00.000Z', map: {}, list: [null] },
      contentType: 'application/json',
    })
  })

  it('sends other bodies as fetch does', async () => {
    const created = await createApp()
    const post = async (body: unknown, headers?: Record<string, string>) =>
      (await created.inject({ method: 'POST', url: '/echo', body, headers })).body
    expect(await post('{"a":1}')).toMatchObject({ type: 'string', contentType: 'text/plain' })
    const json = { 'Content-Type': 'application/json' }
    const bytes = new TextEncoder().encode('{"a":1}')
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(bytes)
        controller.close()
      },
    })
    for (const body of ['{"a":1}', bytes, bytes.buffer, new Blob([bytes]), stream]) {
      expect(await post(body, json)).toMatchObject({ data: { a: 1 }, length: '7' })
    }
    const blob = new Blob([bytes], { type: 'application/vnd.x+json' })
    expect(await post(blob)).toMatchObject({ data: { a: 1 } })
    expect(await post(new URLSearchParams({ a: '1' }))).toMatchObject({ status: 415 })
    expect(await post(undefined)).toMatchObject({ type: 'undefined' })
    expect(await post(null)).toMatchObject({ type: 'undefined' })
    expect(await post('')).toMatchObject({ type: 'undefined' })
  })

  it('sends FormData to a multipart route', async () => {
    const created = await createApp()
    const form = new FormData()
    form.append('title', 'x')
    form.append('file', new File(['abc'], 'a.txt', { type: 'text/plain' }))
    const response = await created.inject({ method: 'POST', url: '/upload', body: form })
    expect(response.body).toEqual({ title: 'x', file: ['a.txt', 'text/plain', 'abc'] })
  })

  it('answers what cannot be sent, or not be matched, as the other adapters do', async () => {
    const created = await createApp()
    const inject = (url: string, method = 'GET') => created.inject({ method, url })
    expect((await inject('/items/%zz')).status).toBe(400)
    expect((await inject('/items/%zz')).headers['content-type']).toBe('application/problem+json')
    expect((await inject('/status')).status).toBe(500)
    expect(await inject('/function')).toMatchObject({ status: 200, text: '', body: undefined })
    expect((await inject('/items/a%2Fb')).body).toEqual({ id: 'a/b' })
  })

  it('gives the cookies of the response one by one', async () => {
    const created = await createApp()
    const response = await created.inject({ method: 'GET', url: '/cookies' })
    expect(response.cookies).toEqual(['a=1; Path=/', 'b=2; Path=/'])
    expect(response.headers['set-cookie']).toBe('a=1; Path=/\nb=2; Path=/')
    expect((await created.inject({ method: 'GET', url: '/items/1' })).cookies).toEqual([])
  })

  it('answers HEAD without a body, also for one that does not end', async () => {
    const created = await createApp()
    const head = await created.inject({ method: 'HEAD', url: '/feed' })
    expect(head.status).toBe(200)
    expect(head.text).toBe('')
    expect((await created.inject({ method: 'head', url: '/items/1' })).text).toBe('')
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

describe('createTestClient', () => {
  it('calls a declaration as a client of the builder does', async () => {
    const calls: Array<{ method: string; url: string }> = []
    const app = {
      inject: async (request: { method: string; url: string }) => {
        calls.push({ method: request.method, url: request.url })
        return { status: 200, headers: {}, cookies: [], text: '', body: undefined }
      },
    }
    const call = createTestClient(app, { prefix: '/api' }) as any
    await call(get('/items/$id/parts/'), {
      urlParams: { id: 'a/b c' },
      params: { tag: ['x', 'y'], when: new Date(0), filter: { a: 1 }, none: undefined, n: 5 },
    })
    expect(calls[0].url).toBe(
      '/api/items/a%2Fb%20c/parts/?tag=x&tag=y&when=1970-01-01T00%3A00%3A00.000Z' +
        '&filter=%7B%22a%22%3A1%7D&n=5',
    )
    await call(get(''))
    expect(calls[1].url).toBe('/api')
    expect(() => call(get('/items/$id'))).toThrow('Missing url param "id"')
  })

  it('encodes a body as a client of the builder does', async () => {
    const seen: any[] = []
    @Controller()
    class BodyController {
      json = handler(
        {
          config: {
            method: 'POST',
            url: '/json',
            requestSchema: z.union([z.string(), z.number()]),
          },
        } as never,
        ({ data }: any) => void seen.push(data),
      )
      upload = handler(
        {
          config: {
            method: 'POST',
            url: '/upload',
            body: 'multipart',
            requestSchema: z.object({
              file: z.instanceof(File),
              tags: z.array(z.string()),
              count: z.number(),
              meta: z.object({ a: z.number() }),
              at: z.iso.datetime(),
              none: z.string(),
            }),
          },
        } as never,
        ({ data }: any) => void seen.push(data),
      )
    }
    @Module({ controllers: [BodyController] })
    class AppModule {}
    const app = await NaviosFactory.create(AppModule, {
      adapter: defineInMemoryEnvironment(),
      logger: false,
    })
    const call = createTestClient(app) as any
    const post = (url: string, body?: 'multipart') => ({ config: { method: 'POST', url, body } })
    expect((await call(post('/json'), { data: 'text' })).status).toBe(200)
    expect((await call(post('/json'), { data: 5 })).status).toBe(200)
    const file = new File(['x'], 'a.txt', { type: 'text/plain' })
    const data = { file, tags: ['one'], count: 2, meta: { a: 1 }, at: new Date(0), none: null }
    const upload = await call(post('/upload', 'multipart'), {
      data: { ...data, missing: undefined },
    })
    expect(upload.status).toBe(200)
    expect(seen.slice(0, 2)).toEqual(['text', 5])
    expect(await seen[2].file.text()).toBe('x')
    expect(seen[2]).toMatchObject({
      tags: ['one'],
      count: 2,
      meta: { a: 1 },
      at: '1970-01-01T00:00:00.000Z',
      none: '',
    })
    await app.close()
  })
})
