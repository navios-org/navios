import { describe, expect, it, vi } from 'vitest'

import { HttpException } from '../errors/index.mjs'
import { encodeResult } from '../pipeline/encode-result.mjs'
import { reply, result } from '../responses/index.mjs'
import { sseStream } from '../sse/index.mjs'

import type { RequestContext } from '../context/index.mjs'
import type { Interceptor } from '../routing/http-contracts.mjs'
import type { RouteResult } from '../routing/index.mjs'
import type { SseMessage } from '../sse/index.mjs'

import { input, JSON_TYPE, setup } from './pipeline-setup.mjs'

/** Answers with what the interceptor makes of the result of the handler. */
function answering(change: (result: RouteResult) => unknown): Interceptor {
  return {
    intercept: async (_ctx, next) => change(await next()) as RouteResult,
  }
}

const respond = (value: unknown) =>
  setup({}, () => ({}), { interceptors: [answering(() => value)] })

describe('the body of a response', () => {
  it('is JSON text, with the content type of JSON', () => {
    expect(setup({}, () => ({ a: 1 })).execute(input())).toMatchObject({
      status: 200,
      headers: JSON_TYPE,
      sent: '{"a":1}',
    })
    expect(setup({}, () => null).execute(input())).toMatchObject({
      headers: JSON_TYPE,
      sent: 'null',
    })
  })

  it('is missing, with its content type, for an undefined JSON result', () => {
    expect(setup({}, () => undefined).execute(input())).toEqual({
      status: 200,
      headers: {},
      body: null,
      sent: null,
      release: undefined,
    })
    const withHeader = setup({}, (_params, ctx: RequestContext) => {
      ctx.reply.header('x-a', '1')
    })
    expect(withHeader.execute(input())).toMatchObject({ headers: { 'x-a': '1' }, sent: null })
  })

  it('is missing for a status that has none', async () => {
    for (const status of [204, 205, 304]) {
      for (const headers of [undefined, { 'content-type': 'text/html', 'content-length': '3' }]) {
        const answer = await respond({ status, headers, body: 'abc', kind: 'text' }).execute(
          input(),
        )
        expect(answer.status).toBe(status)
        expect(answer.sent).toBeNull()
        expect(answer.headers['content-type']).toBeUndefined()
        expect(answer.headers['content-length']).toBe(
          headers !== undefined && status === 304 ? '3' : undefined,
        )
      }
      const json = await respond({ status, body: { a: 1 }, kind: 'json' }).execute(input())
      expect(json.sent).toBeNull()
    }
  })

  it('is bytes for any view of a buffer', async () => {
    const bytes = new TextEncoder().encode('abc')
    for (const body of [
      bytes,
      bytes.buffer,
      new DataView(bytes.buffer),
      Buffer.from('abc'),
      new Uint16Array(bytes.slice(0, 2).buffer),
    ]) {
      const answer = await setup({ response: 'blob' }, () => body).execute(input())
      expect(answer.sent).toBeInstanceOf(Uint8Array)
      expect(answer.headers).toEqual({ 'content-type': 'application/octet-stream' })
    }
  })

  it('that cannot be sent is an error naming the endpoint and the body', async () => {
    for (const [body, name] of [
      [12, 'a value of type number'],
      [{ a: 1 }, 'a plain object'],
      [['a'].values(), 'an object of class'],
      [new Response('x'), 'an object of class Response'],
    ] as const) {
      for (const kind of ['text', 'blob', 'stream'] as const) {
        const { execute, unhandled } = setup({ response: kind }, () => body)
        expect((await execute(input())).status).toBe(500)
        expect(String(unhandled[0])).toContain(
          `The response of GET /test is declared as "${kind}", but its body is ${name}`,
        )
      }
    }
  })

  it('that has no JSON is an error that can be mapped', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    const { execute, errors, unhandled } = setup({}, () => circular)
    expect(execute(input())).toMatchObject({
      status: 500,
      body: { title: 'Internal Server Error' },
    })
    expect(unhandled).toHaveLength(1)
    errors.add(TypeError, () => reply(418, { mapped: true }))
    expect(execute(input())).toMatchObject({ status: 418, body: { mapped: true } })
  })

  it('of a kind nobody can write is an error', async () => {
    const { execute, unhandled } = respond({ status: 200, body: 'a', kind: 'html' })
    expect((await execute(input())).status).toBe(500)
    expect(String(unhandled[0])).toContain('is of the kind "html"')
  })
})

describe('the status of a response', () => {
  it('is an error when it cannot be sent', async () => {
    for (const status of [0, 99, 100, 199, 600, 999, 200.5, Number.NaN]) {
      for (const kind of ['json', 'text']) {
        const { execute, unhandled } = respond({ status, body: 'a', kind })
        expect((await execute(input())).status).toBe(500)
        expect(String(unhandled[0])).toContain(`has the status ${status}`)
      }
    }
  })
})

describe('what an interceptor or an encoder returns', () => {
  it('may be a reply()', async () => {
    expect(await respond(reply(403, { reason: 'no' })).execute(input())).toMatchObject({
      status: 403,
      body: { reason: 'no' },
    })
    expect(await respond(reply(204)).execute(input())).toMatchObject({ status: 204, sent: null })
  })

  it('is an error when it is no result', async () => {
    for (const value of [
      undefined,
      null,
      'text',
      { status: 200 },
      { status: '200', kind: 'json' },
    ]) {
      const { execute, unhandled } = respond(value)
      expect((await execute(input())).status).toBe(500)
      expect(unhandled).toHaveLength(1)
      expect(String(unhandled[0])).toContain('did not return a response')
    }
  })

  it('names the encoder, and releases the request', async () => {
    const released = vi.fn()
    const { execute, unhandled } = setup(
      { response: 'text' },
      (_params, ctx: RequestContext) => {
        ctx.onFinish(released)
        return result('xml', '<a/>')
      },
      { encoders: { xml: () => undefined as never } },
    )
    const answer = await execute(input())
    expect(answer.status).toBe(500)
    expect(String(unhandled[0])).toContain('The encoder of "xml" responses did not return')
    await answer.release!()
    expect(released).toHaveBeenCalledTimes(1)
  })
})

describe('response headers', () => {
  it('have lower-case names, and those of a result win', async () => {
    const { execute } = setup(
      {},
      (_params, ctx: RequestContext) => {
        ctx.reply.header('Cache-Control', 'private')
        ctx.reply.header('X-Kept', 'yes')
        ctx.reply.header('Content-Type', 'application/vnd.a+json')
        return {}
      },
      { interceptors: [answering((r) => ({ ...r, headers: { 'CACHE-CONTROL': 'no-store' } }))] },
    )
    expect((await execute(input())).headers).toEqual({
      'cache-control': 'no-store',
      'x-kept': 'yes',
      'content-type': 'application/vnd.a+json',
    })
  })

  it('hold several values', () => {
    const { execute } = setup({}, (_params, ctx: RequestContext) => {
      ctx.reply.append('Link', '</a>')
      ctx.reply.append('link', ['</b>', '</c>'])
      ctx.reply.header('vary', ['a', 'b'])
      ctx.reply.append('set-cookie', 'raw=1')
      ctx.reply.cookie('sid', '2')
      return {}
    })
    expect(execute(input())).toMatchObject({
      headers: {
        link: ['</a>', '</b>', '</c>'],
        vary: ['a', 'b'],
        'set-cookie': ['raw=1', 'sid=2; Path=/'],
      },
    })
  })

  it('are checked when they are set', () => {
    for (const [name, value] of [
      ['x-a', 'a\r\nx-b: 1'],
      ['x-a', 'a\nb'],
      ['x-a', 'a\0b'],
      ['x-a', 'наш'],
      ['x-a', ['ok', 'a\nb']],
      ['x a', 'b'],
      ['x-a:', 'b'],
      ['', 'b'],
      ['x-a', undefined],
      ['x-a', null],
      ['x-a', true],
      ['x-a', [{}]],
    ] as Array<[string, string]>) {
      for (const set of ['header', 'append'] as const) {
        const { execute, unhandled } = setup({}, (_params, ctx: RequestContext) => {
          ctx.reply[set](name, value)
          return {}
        })
        expect(execute(input())).toMatchObject({ status: 500 })
        expect(String(unhandled[0])).toContain('response header')
      }
    }
    const { execute } = setup({}, (_params, ctx: RequestContext) => {
      ctx.reply.header('x-a', 'tab\tand latin é')
      return {}
    })
    expect(execute(input())).toMatchObject({ headers: { 'x-a': 'tab\tand latin é' } })
  })

  it('may be given a number', () => {
    const { execute } = setup({}, (_params, ctx: RequestContext) => {
      ctx.reply.header('retry-after', 5)
      ctx.reply.header('x-list', [1, 'two'])
      ctx.reply.append('x-list', 3)
      return {}
    })
    expect(execute(input())).toMatchObject({
      headers: { 'retry-after': '5', 'x-list': ['1', 'two', '3'] },
    })
    for (const value of [NaN, Infinity]) {
      const { execute: run, unhandled } = setup({}, (_params, ctx: RequestContext) => {
        ctx.reply.header('retry-after', value)
        return {}
      })
      expect(run(input())).toMatchObject({ status: 500 })
      expect(String(unhandled[0])).toContain('response header "retry-after"')
    }
  })

  it('of a result may be a number as well', async () => {
    const { execute } = respond({
      status: 200,
      headers: { 'x-count': 5 as never },
      body: {},
      kind: 'json',
    })
    expect((await execute(input())).headers['x-count']).toBe('5')
  })

  it('of a result are checked as well', async () => {
    const { execute, unhandled } = respond({
      status: 200,
      headers: { 'x-a': 'a\nb' },
      body: {},
      kind: 'json',
    })
    expect((await execute(input())).status).toBe(500)
    expect(String(unhandled[0])).toContain('response header "x-a"')
  })

  it('that are defaults lose to ctx.reply', async () => {
    const events = setup({ response: 'stream' }, (_params, ctx: RequestContext) => {
      ctx.reply.header('cache-control', 'no-store')
      return sseStream([] as unknown as AsyncIterable<SseMessage>)
    })
    expect((await events.execute(input())).headers).toEqual({
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      'x-accel-buffering': 'no',
    })
    const blob = setup({ response: 'blob' }, (_params, ctx: RequestContext) => {
      ctx.reply.header('content-type', 'application/pdf')
      return new Blob(['x'], { type: 'image/png' })
    })
    expect((await blob.execute(input())).headers).toEqual({ 'content-type': 'application/pdf' })
  })

  it('that describe a successful response are not sent with an error', () => {
    const { execute } = setup({}, (_params, ctx: RequestContext) => {
      ctx.reply.header('cache-control', 'public, max-age=31536000')
      ctx.reply.header('content-encoding', 'gzip')
      ctx.reply.header('content-type', 'text/html')
      ctx.reply.header('content-disposition', 'attachment')
      ctx.reply.header('content-security-policy', "default-src 'none'")
      ctx.reply.header('etag', '"1"')
      ctx.reply.header('last-modified', 'Wed, 25 Nov 2026 00:00:00 GMT')
      ctx.reply.header('expires', 'Wed, 25 Nov 2026 00:00:00 GMT')
      ctx.reply.header('retry-after', '5')
      ctx.reply.cookie('kept', '1')
      throw new HttpException(503, 'busy')
    })
    expect(execute(input())).toMatchObject({
      status: 503,
      headers: {
        'content-type': 'application/problem+json',
        'content-security-policy': "default-src 'none'",
        'retry-after': '5',
        'set-cookie': ['kept=1; Path=/'],
      },
    })
    expect(Object.keys((execute(input()) as { headers: object }).headers)).toHaveLength(4)
  })

  it('that restrict caching stay with an error', () => {
    const kept = (value: string) => {
      const { execute } = setup({}, (_params, ctx: RequestContext) => {
        ctx.reply.header('cache-control', value)
        throw new HttpException(404, 'x')
      })
      return (execute(input()) as { headers: Record<string, unknown> }).headers['cache-control']
    }
    for (const value of [
      'private',
      'no-cache',
      'no-store',
      'max-age=0',
      'Private, No-Cache',
      'public, max-age=0, must-revalidate',
      'private, max-age=0',
      'no-cache, max-age=60',
      'no-store, s-maxage=60',
    ]) {
      expect(kept(value), value).toBe(value)
    }
    for (const value of [
      'public',
      'public, max-age=60',
      'max-age=0, s-maxage=60',
      'private, max-age=60',
      'private, max-age=1, immutable',
      'immutable',
      'must-revalidate',
      'x-private',
    ]) {
      expect(kept(value), value).toBeUndefined()
    }
  })

  it('that say what range there would be stay with an error', () => {
    const { execute } = setup({}, (_params, ctx: RequestContext) => {
      ctx.reply.header('content-range', 'bytes */1000')
      throw new HttpException(416, 'no such range')
    })
    expect(execute(input())).toMatchObject({
      status: 416,
      headers: { 'content-range': 'bytes */1000' },
    })
    const partial = setup({}, (_params, ctx: RequestContext) => {
      ctx.reply.header('content-range', 'bytes 0-9/1000')
      throw new HttpException(416, 'no such range')
    })
    expect((partial.execute(input()) as { headers: object }).headers).not.toHaveProperty(
      'content-range',
    )
  })

  it('keep no-store, and what a mapper sets, on an error', () => {
    class Mapped extends Error {}
    const { execute, errors } = setup({}, (_params, ctx: RequestContext) => {
      ctx.reply.header('cache-control', 'private, no-store')
      ctx.reply.header('etag', '"1"')
      throw new Mapped()
    })
    errors.add(Mapped, (_error, ctx) => {
      ctx.reply.header('etag', '"error"')
      return reply(409, {})
    })
    expect(execute(input())).toMatchObject({
      status: 409,
      headers: { 'cache-control': 'private, no-store', etag: '"error"' },
    })
  })

  it('stay with a reply() that has an error status', () => {
    const { execute } = setup(
      {
        errorSchema: {
          404: {
            '~standard': { version: 1, vendor: 't', validate: (value: unknown) => ({ value }) },
          },
        },
      },
      (_params, ctx: RequestContext) => {
        ctx.reply.header('cache-control', 'public, max-age=60')
        return reply(404, {})
      },
    )
    expect(execute(input())).toMatchObject({
      status: 404,
      headers: { 'cache-control': 'public, max-age=60' },
    })
  })
})

describe('cookies', () => {
  const cookies = (set: (ctx: RequestContext) => void) => {
    const { execute, unhandled } = setup({}, (_params, ctx: RequestContext) => {
      set(ctx)
      return {}
    })
    const answer = execute(input()) as { status: number; headers: Record<string, unknown> }
    return { status: answer.status, sent: answer.headers['set-cookie'], unhandled }
  }

  it('are sent once per name, domain and path, the last one set', () => {
    const { sent } = cookies(({ reply: { cookie } }) => {
      cookie('n', '1')
      cookie('n', '2', { path: '/admin' })
      cookie('n', '3', { domain: 'a.test' })
      cookie('n', '4', { domain: 'A.test' })
      cookie('n', '5')
    })
    expect(sent).toEqual(['n=5; Path=/', 'n=2; Path=/admin', 'n=4; Domain=A.test; Path=/'])
  })

  it('of a result replace those of ctx.reply', async () => {
    const { execute } = setup(
      {},
      (_params, ctx: RequestContext) => {
        ctx.reply.cookie('n', '1')
        ctx.reply.cookie('m', '1')
        return {}
      },
      { interceptors: [answering((r) => ({ ...r, cookies: [{ name: 'n', value: '2' }] }))] },
    )
    expect((await execute(input())).headers['set-cookie']).toEqual(['n=2; Path=/', 'm=1; Path=/'])
  })

  it('are deleted with the attributes they were set with', () => {
    const { sent } = cookies(({ reply: { deleteCookie } }) => {
      deleteCookie('sid')
      deleteCookie('sid', { path: '/admin', domain: 'a.test' })
      deleteCookie('__Host-sid')
    })
    const expired = 'Expires=Thu, 01 Jan 1970 00:00:00 GMT'
    expect(sent).toEqual([
      `sid=; Max-Age=0; Path=/; ${expired}`,
      `sid=; Max-Age=0; Domain=a.test; Path=/admin; ${expired}`,
      `__Host-sid=; Max-Age=0; Path=/; ${expired}; Secure`,
    ])
  })

  it('may be partitioned', () => {
    const { sent } = cookies((ctx) =>
      ctx.reply.cookie('a', '1', { secure: true, sameSite: 'none', partitioned: true }),
    )
    expect(sent).toEqual(['a=1; Path=/; Secure; SameSite=None; Partitioned'])
  })

  it('that a browser would misread or drop are refused', () => {
    for (const [name, options] of [
      ['a=1; Domain=evil.com; b', {}],
      ['a b', {}],
      ['', {}],
      ['a', { path: '/; Domain=evil.com' }],
      ['a', { path: '/\r\nx: y' }],
      ['a', { domain: 'a.com; Secure' }],
      ['a', { maxAge: Number.NaN }],
      ['a', { maxAge: Number.POSITIVE_INFINITY }],
      ['a', { expires: new Date('nonsense') }],
      ['a', { sameSite: 'none' }],
      ['a', { partitioned: true }],
      ['a', { sameSite: 'None; Domain=evil.com' }],
      ['__Secure-a', {}],
      ['__Host-a', {}],
      ['__Host-a', { secure: true, path: '/admin' }],
      ['__Host-a', { secure: true, domain: 'a.com' }],
    ] as Array<[string, object]>) {
      const { status, sent, unhandled } = cookies((ctx) => ctx.reply.cookie(name, 'v', options))
      expect(status).toBe(500)
      expect(sent).toBeUndefined()
      expect(String(unhandled[0])).toContain('cannot be sent')
    }
  })
})

describe('encodeResult()', () => {
  it('encodes a result that belongs to no route', () => {
    expect(
      encodeResult({ status: 413, headers: { 'X-A': '1' }, body: { a: 1 }, kind: 'json' }),
    ).toEqual({
      status: 413,
      headers: { 'content-type': 'application/json; charset=utf-8', 'x-a': '1' },
      body: '{"a":1}',
      release: undefined,
    })
    expect(() => encodeResult({ status: 99, body: null, kind: 'empty' })).toThrow('the status 99')
  })
})
