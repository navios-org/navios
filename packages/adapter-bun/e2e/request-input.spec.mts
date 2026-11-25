import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test'
import { connect } from 'node:net'
import { setTimeout as wait } from 'node:timers/promises'

import {
  handler,
  NaviosFactory,
  registerController,
  registerInjectable,
  registerModule,
} from '@navios/server'
import { z } from 'zod/v4'

import type { NaviosApplication, RequestContext } from '@navios/server'

import { defineBunEnvironment } from '../src/index.mjs'

import type { BunEnvironment } from '../src/index.mjs'

const anything = {
  '~standard': {
    version: 1 as const,
    vendor: 'test',
    validate: (value: unknown) => ({ value }),
  },
}

describe('bun adapter: request input', () => {
  let app: NaviosApplication<BunEnvironment>
  let base: string
  const statuses: unknown[] = []
  const logger = { log: mock(), error: mock(), warn: mock(), debug: mock() }

  beforeAll(async () => {
    class ObserveGuard {
      canActivate(ctx: RequestContext) {
        ctx.onFinish(() => {
          statuses.push(ctx.responseStatus)
        })
        return true
      }
    }
    registerInjectable(ObserveGuard)
    class InputController {
      query = handler({ config: { method: 'GET', url: '/query' } } as any, (_: any, ctx: any) => ({
        entries: Object.entries(ctx.query),
        inherited: typeof ctx.query.toString,
      }))
      upload = handler(
        {
          config: { method: 'POST', url: '/upload', body: 'multipart', requestSchema: anything },
        } as any,
        ({ data }: any) => ({ keys: Object.keys(data) }),
      )
      echo = handler(
        { config: { method: 'POST', url: '/echo', requestSchema: anything } } as any,
        { guards: [ObserveGuard] },
        ({ data }: any) => data,
      )
      native = handler(
        { config: { method: 'POST', url: '/native/$id' } } as any,
        async (_: any, ctx: RequestContext) => {
          const { request, server } = ctx.raw as BunEnvironment['raw']
          const copy = request.clone()
          const before = request.bodyUsed
          return {
            ip: server?.requestIP(request)?.address ?? null,
            sameIp: ctx.ip === server?.requestIP(request)?.address,
            params: (request as any).params,
            isStream: request.body instanceof ReadableStream,
            text: await request.text(),
            bodyUsed: [before, request.bodyUsed],
            copy: await copy.text(),
            again: await request.text().catch(() => 'used'),
          }
        },
      )
      json = handler(
        { config: { method: 'POST', url: '/native-json' } } as any,
        async (_: any, ctx: RequestContext) =>
          (ctx.raw as BunEnvironment['raw']).request.json() as Promise<object>,
      )
      user = handler({ config: { method: 'GET', url: '/users/$id' } } as any, (input: any) => ({
        id: input.urlParams.id,
      }))
      coffee = handler({ config: { method: 'GET', url: '/café/$id' } } as any, () => ({}))
      colonFixed = this.colon('/colon/things:batch')
      colonName = this.colon('/colon/$name')
      colonOne = this.colon('/colon/$id/things:batch')
      colonTwo = this.colon('/colon/$id/x:y/$last')
      colonOther = this.colon('/colon/$a/$b/$c/$d')
      nullable = handler(
        {
          config: {
            method: 'POST',
            url: '/nullable',
            body: 'multipart',
            requestSchema: z.object({
              file: z.instanceof(File).nullable(),
              blob: z.instanceof(Blob).nullable(),
              number: z.number().nullable(),
              meta: z.object({ a: z.number() }).nullable(),
              text: z.string().nullable(),
            }),
          },
        } as any,
        ({ data }: any) => data,
      )
      waiting = handler(
        { config: { method: 'GET', url: '/waiting' } } as any,
        (async (_: unknown, ctx: RequestContext) => {
          await wait(5000, undefined, { signal: ctx.signal })
          return {}
        }) as any,
      )

      private colon(url: string) {
        return handler(
          { config: { method: 'GET', url } } as any,
          (_: any, ctx: RequestContext) => ({
            route: ctx.route.path,
            params: ctx.urlParams,
          }),
        )
      }
    }
    registerController(InputController)
    class AppModule {}
    registerModule(AppModule, { controllers: [InputController] })

    app = await NaviosFactory.create(AppModule, { adapter: defineBunEnvironment(), logger })
    base = await app.listen({ port: 0, hostname: '127.0.0.1' })
  })

  afterAll(async () => {
    await app.close()
  })

  it('keeps query keys that are properties of Object.prototype as plain strings', async () => {
    const response = await fetch(
      `${base}/query?constructor=x&__proto__=y&toString=z&a=1&a=2&hasOwnProperty=1`,
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      entries: [
        ['constructor', 'x'],
        ['__proto__', 'y'],
        ['toString', 'z'],
        ['a', ['1', '2']],
        ['hasOwnProperty', '1'],
      ],
      inherited: 'string',
    })
    const plain = await fetch(`${base}/query?a=1`)
    expect(await plain.json()).toEqual({ entries: [['a', '1']], inherited: 'undefined' })
  })

  const upload = (contentType: string, body: string) =>
    fetch(`${base}/upload`, { method: 'POST', headers: { 'content-type': contentType }, body })

  it('answers 400 for a multipart body that cannot be parsed', async () => {
    logger.error.mockClear()
    for (const response of [
      await upload('multipart/form-data; boundary=xx', 'garbage'),
      await upload('multipart/form-data', 'garbage'),
    ]) {
      expect(response.status).toBe(400)
      expect(response.headers.get('content-type')).toContain('application/problem+json')
      const body = (await response.json()) as any
      expect(JSON.stringify(body)).toContain('Malformed multipart body')
    }
    expect(logger.error).not.toHaveBeenCalled()

    const form = new FormData()
    form.append('title', 'a')
    const accepted = await fetch(`${base}/upload`, { method: 'POST', body: form })
    expect(await accepted.json()).toEqual({ keys: ['title'] })
  })

  it('does not report a client that disconnects while it sends the body', async () => {
    logger.error.mockClear()
    const { port, hostname } = new URL(base)
    for (const length of ['content-length: 1000', 'transfer-encoding: chunked']) {
      await new Promise<void>((resolve) => {
        const socket = connect(Number(port), hostname, () => {
          socket.write(
            `POST /echo HTTP/1.1\r\nhost: x\r\ncontent-type: application/json\r\n${length}\r\n\r\n` +
              (length.startsWith('content') ? '{"a":' : '5\r\n{"a":\r\n'),
          )
          setTimeout(() => socket.destroy(), 30)
        })
        socket.on('close', () => resolve())
      })
      await Bun.sleep(50)
    }
    expect(logger.error).not.toHaveBeenCalled()
    expect(statuses).toEqual([400, 400])
  })

  // The length of a body is up to the client, so nothing may depend on it.
  it('keeps the native request for a body without a declared length', async () => {
    const expected = {
      ip: '127.0.0.1',
      sameIp: true,
      params: { id: '7' },
      isStream: true,
      text: '{"a":1}',
      bodyUsed: [false, true],
      copy: '{"a":1}',
      again: 'used',
    }
    const body = () =>
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"a":1}'))
          controller.close()
        },
      })
    const chunked = { method: 'POST', body: body(), duplex: 'half' } as RequestInit
    expect(await (await fetch(`${base}/native/7`, chunked)).json()).toEqual(expected)
    const declared = { method: 'POST', body: '{"a":1}' }
    expect(await (await fetch(`${base}/native/7`, declared)).json()).toEqual(expected)

    const json = { ...chunked, body: body() }
    expect(await (await fetch(`${base}/native-json`, json)).json()).toEqual({ a: 1 })
    const injected = await app.inject({ method: 'POST', url: '/native-json', body: { a: 1 } })
    expect(injected.body).toEqual({ a: 1 })
  })

  it('serves a body without a declared length to a Host that is not valid', async () => {
    const { port, hostname } = new URL(base)
    const answer = await new Promise<string>((resolve) => {
      let text = ''
      const socket = connect(Number(port), hostname, () => {
        socket.write(
          'POST /native/7 HTTP/1.1\r\nhost: \r\nconnection: close\r\n' +
            'transfer-encoding: chunked\r\n\r\n2\r\nhi\r\n0\r\n\r\n',
        )
      })
      socket.on('data', (chunk) => (text += chunk.toString()))
      socket.on('close', () => resolve(text))
    })
    expect(answer).toContain('200 OK')
    expect(answer).toContain('"text":"hi"')
  })

  it('reads null in a multipart body as any client of an endpoint writes it', async () => {
    const form = new FormData()
    for (const name of ['file', 'blob', 'number', 'meta', 'text']) {
      form.append(name, '')
    }
    const response = await fetch(`${base}/nullable`, { method: 'POST', body: form })
    expect(await response.json()).toEqual({
      file: null,
      blob: null,
      number: null,
      meta: null,
      text: '',
    })
  })

  it('knows the url params of a path with a colon in its fixed text', async () => {
    const requests: Array<[path: string, answer: object | null]> = [
      ['/colon/things:batch', { route: '/colon/things:batch', params: {} }],
      ['/colon/things:other', { route: '/colon/$name', params: { name: 'things:other' } }],
      ['/colon/7/things:batch', { route: '/colon/$id/things:batch', params: { id: '7' } }],
      [
        '/colon/a%20%2Fb/x:y/%25?q=/1',
        { route: '/colon/$id/x:y/$last', params: { id: 'a /b', last: '%' } },
      ],
      ['/colon/7/x:z/9', null],
      ['/colon//things:batch', null],
    ]
    for (const [path, answer] of requests) {
      for (const { status, body } of [
        await fetch(`${base}${path}`).then(async (response) => ({
          status: response.status,
          body: await response.json(),
        })),
        await app.inject({ method: 'GET', url: path }),
      ]) {
        expect([path, status]).toEqual([path, answer === null ? 404 : 200])
        if (answer !== null) {
          expect(body).toEqual(answer)
        }
      }
    }
    const malformed = await fetch(`${base}/colon/%zz/things:batch`)
    expect(malformed.status).toBe(400)
    expect(((await malformed.json()) as any).detail).toContain('not a valid url component')
  })

  it('finds the route of a test request as the server finds that of any other', async () => {
    for (const [path, status] of [
      ['/caf%C3%A9/x', 200],
      ['/café/x', 200],
      ['/caf%c3%a9/x', 404],
      ['/%63af%C3%A9/x', 404],
      ['/%71uery', 404],
      ['/users/%61', 200],
      ['/use%72s/%zz', 404],
      ['/%zz/x', 404],
    ] as const) {
      const response = await fetch(`${base}${path}`)
      const injected = await app.inject({ method: 'GET', url: path })
      expect([path, response.status, injected.status]).toEqual([path, status, status])
    }
  })

  it('does not report a handler that was stopped because its client had gone', async () => {
    logger.error.mockClear()
    const controller = new AbortController()
    const pending = fetch(`${base}/waiting`, { signal: controller.signal }).catch(() => null)
    await Bun.sleep(50)
    controller.abort()
    await pending
    await Bun.sleep(50)
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('answers 400 for a url param that is not valid percent-encoding', async () => {
    for (const id of ['%E0%A4%A', '%', 'a%2', '%zz', '%FF', '%ED%A0%80']) {
      for (const answer of [
        await fetch(`${base}/users/${id}`).then(async (response) => ({
          status: response.status,
          body: await response.json(),
        })),
        await app.inject({ method: 'GET', url: `/users/${id}` }),
      ]) {
        expect(answer.status).toBe(400)
        expect(answer.body).toMatchObject({
          title: 'Bad Request',
          detail: `'/users/${id}' is not a valid url component`,
        })
      }
    }
    for (const [id, value] of [
      ['a%20b%2Fc', 'a b/c'],
      ['%25', '%'],
      // The character that Bun puts in place of what it cannot decode.
      ['%EF%BF%BD', '\uFFFD'],
    ]) {
      expect(await (await fetch(`${base}/users/${id}`)).json()).toEqual({ id: value })
      const injected = await app.inject({ method: 'GET', url: `/users/${id}` })
      expect(injected.body).toEqual({ id: value })
    }
  })
})
