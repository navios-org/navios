import { registerModule } from '@navios/core'
import { registerInjectable } from '@navios/di'

import { registerController } from '../controllers/controller.mjs'
import { handler } from '../handlers/handler.mjs'

import type { RequestContext } from '../context/request-context.mjs'
import type { Guard } from '../routing/http-contracts.mjs'

import { s } from './schema.mjs'
import { endpoint } from './suite.mjs'

import type { ConformanceSuite } from './suite.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * What the server makes of the body, the query and the headers it is given:
 * media types, JSON, raw bytes, and text in the form a schema describes.
 * @internal
 */
export function defineRequestDecodingTopic(suite: ConformanceSuite) {
  const { it, expect, url, fetch, json, events, options } = suite
  const decoder = new TextDecoder()

  class SignatureGuard implements Guard {
    async canActivate(ctx: RequestContext) {
      const bytes = await ctx.rawBody()
      return ctx.headers.get('x-signature') === String(bytes.byteLength)
    }
  }
  registerInjectable(SignatureGuard)

  class RefusingGuard implements Guard {
    canActivate() {
      return false
    }
  }
  registerInjectable(RefusingGuard)

  class DecodingController {
    object = handler(
      endpoint({
        method: 'POST',
        url: '/decode/object',
        requestSchema: s.object({ name: s.string() }),
      }),
      ({ data }: any) => data,
    )

    anything = handler(
      endpoint({ method: 'POST', url: '/decode/anything', requestSchema: s.any() }),
      ({ data }: any) => {
        events.push('decoded')
        return { type: data === undefined ? 'undefined' : typeof data, data: data ?? null }
      },
    )

    unread = handler(endpoint({ method: 'POST', url: '/decode/unread' }), () => ({ read: false }))

    refused = handler(
      endpoint({ method: 'POST', url: '/decode/refused', requestSchema: s.any() }),
      { guards: [RefusingGuard] },
      () => ({}),
    )

    upload = handler(
      endpoint({
        method: 'POST',
        url: '/decode/upload',
        body: 'multipart',
        requestSchema: s.object({
          title: s.string(),
          tags: s.array(s.string()),
          count: s.number(),
          flag: s.boolean(),
          meta: s.object({ a: s.number() }),
        }),
      }),
      ({ data }: any) => data,
    )

    query = handler(
      endpoint({
        method: 'GET',
        url: '/decode/query',
        querySchema: s.object({
          tags: s.optional(s.array(s.string())),
          ids: s.optional(s.array(s.number())),
          page: s.optional(s.number()),
          flag: s.optional(s.boolean()),
          text: s.optional(s.string()),
          filter: s.optional(s.object({ a: s.number() })),
        }),
      }),
      ({ params }: any) => params,
    )

    params = handler(
      endpoint({
        method: 'GET',
        url: '/decode/params/$id/$flag/$name',
        urlParamsSchema: s.object({ id: s.number(), flag: s.boolean(), name: s.string() }),
      }),
      ({ urlParams }: any) => urlParams,
    )

    prototype = handler(
      endpoint({ method: 'GET', url: '/decode/prototype' }),
      (_params: any, ctx: RequestContext) => ({
        query: Object.entries(ctx.query),
        header: ctx.headers.get('constructor') ?? null,
        other: ctx.headers.get('toString') ?? null,
        cookie: ctx.cookies.get('constructor') ?? null,
      }),
    )

    raw = handler(
      endpoint({
        method: 'POST',
        url: '/decode/raw',
        requestSchema: s.object({ name: s.string() }),
      }),
      async ({ data }: any, ctx: RequestContext) => {
        const bytes = await ctx.rawBody()
        return {
          name: data.name,
          text: decoder.decode(bytes),
          isSame: bytes === (await ctx.rawBody()),
        }
      },
    )

    rawOnly = handler(
      endpoint({ method: 'POST', url: '/decode/raw-only' }),
      async (_params: any, ctx: RequestContext) => ({ bytes: [...(await ctx.rawBody())] }),
    )

    signed = handler(
      endpoint({
        method: 'POST',
        url: '/decode/signed',
        requestSchema: s.object({ name: s.string() }),
      }),
      { guards: [SignatureGuard] },
      ({ data }: any) => data,
    )

    signedUpload = handler(
      endpoint({
        method: 'POST',
        url: '/decode/signed-upload',
        body: 'multipart',
        requestSchema: s.object({ title: s.string(), file: s.file() }),
      }),
      { guards: [SignatureGuard] },
      async ({ data }: any) => ({ title: data.title, file: await data.file.text() }),
    )
  }
  registerController(DecodingController, { attributes: [suite.Public()] })

  class DecodingModule {}
  registerModule(DecodingModule, { controllers: [DecodingController] })

  const post = (path: string, body: BodyInit | undefined, contentType?: string) =>
    fetch(url(path), {
      method: 'POST',
      headers: contentType === undefined ? {} : { 'content-type': contentType },
      // A `Blob` has no content type of its own, where a string has one.
      body: typeof body === 'string' ? new Blob([body]) : body,
    })
  const isProblem = async (response: Response, status: number) => {
    expect(response.status).toBe(status)
    expect(response.headers.get('content-type')).toContain('application/problem+json')
    expect((await response.json()).status).toBe(status)
  }

  return {
    controllers: [],
    modules: [DecodingModule],
    tests() {
      it('decodes a body by its media type, and by nothing else', async () => {
        const body = '{"name":"ann"}'
        for (const type of [
          'application/json',
          'application/json; charset=utf-8',
          'Application/JSON',
          'application/vnd.conformance+json',
          'application/problem+json;charset=utf-8',
        ]) {
          const response = await post('/decode/object', body, type)
          expect(await response.json()).toEqual({ name: 'ann' })
        }

        // A browser sends these across sites without asking, so a body is not
        // JSON because of them. The text is not the object the schema wants.
        for (const type of ['text/plain', 'text/plain; application/json', 'text/plain; x=json']) {
          await isProblem(await post('/decode/object', body, type), 400)
          const text = await post('/decode/anything', body, type)
          expect(await text.json()).toEqual({ type: 'string', data: body })
        }
        for (const type of [
          'application/x-www-form-urlencoded',
          'application/x-www-form-urlencoded; a=json',
          'multipart/form-data; boundary=json',
          'application/x-ndjson',
          'application/jsonx',
          'application/xml',
          'application/octet-stream',
          undefined,
        ]) {
          await isProblem(await post('/decode/anything', body, type), 415)
        }
      })

      it('answers 415 after guards, and only for an endpoint that reads the body', async () => {
        await isProblem(await post('/decode/refused', 'x', 'application/xml'), 403)
        const unread = await post('/decode/unread', 'x', 'application/xml')
        expect(await unread.json()).toEqual({ read: false })
      })

      it('decodes no body as undefined', async () => {
        for (const type of ['application/json', 'text/plain', 'application/xml', undefined]) {
          for (const body of ['', undefined]) {
            const response = await post('/decode/anything', body, type)
            expect(await response.json()).toEqual({ type: 'undefined', data: null })
          }
        }
      })

      it('decodes JSON of any form, without a byte order mark', async () => {
        for (const [text, data] of [
          ['null', null],
          ['5', 5],
          ['"x"', 'x'],
          ['[1]', [1]],
          ['﻿{"a":"п"}', { a: 'п' }],
        ] as const) {
          const response = await post('/decode/anything', text, 'application/json')
          expect((await response.json()).data).toEqual(data)
        }
      })

      it('answers 400 for malformed JSON, and for keys that reach a prototype', async () => {
        events.length = 0
        for (const text of [
          '{"name": ',
          '{"__proto__":{"a":1}}',
          '{"a":[{"b":{"__proto__":null}}]}',
          '{"\\u005f_proto__":{"a":1}}',
          '{"constructor":{"prototype":{"a":1}}}',
        ]) {
          const response = await post('/decode/anything', text, 'application/json')
          expect(response.status).toBe(400)
          const problem = await response.json()
          expect(problem.source).toBe('body')
          // Nothing of the body, and nothing that differs between runtimes.
          expect(problem.errors[0].message.includes(text.slice(0, 5))).toBe(false)
        }
        expect(events).toEqual([])

        const allowed = await post(
          '/decode/anything',
          '{"constructor":"x","note":"__proto__"}',
          'application/json',
        )
        expect((await allowed.json()).data).toEqual({ constructor: 'x', note: '__proto__' })
      })

      it('answers 400 for a multipart body that cannot be parsed, 415 for another', async () => {
        await isProblem(
          await post('/decode/upload', 'garbage', 'multipart/form-data; boundary=x'),
          400,
        )
        await isProblem(await post('/decode/upload', '{"title":"x"}', 'application/json'), 415)
        await isProblem(await post('/decode/upload', 'x'), 415)
        const form = new FormData()
        form.append('name', 'ann')
        await isProblem(await post('/decode/object', form), 415)
      })

      it('gives text the form that the schema of a query describes', async () => {
        const query = async (search: string) => (await fetch(url(`/decode/query${search}`))).json()
        expect(await query('?tags=a&ids=1&page=2&flag=false&text=3&filter={"a":1}')).toEqual({
          tags: ['a'],
          ids: [1],
          page: 2,
          flag: false,
          text: '3',
          filter: { a: 1 },
        })
        expect(await query('?tags=a&tags=b&ids=1&ids=2.5&page=-1e2&flag=true')).toEqual({
          tags: ['a', 'b'],
          ids: [1, 2.5],
          page: -100,
          flag: true,
        })
        for (const search of [
          '?page=',
          '?page=1x',
          '?page=0x10',
          '?page=%201',
          '?page=007',
          '?page=1&page=2',
          '?page=90071992547409931',
          '?flag=1',
          '?flag=TRUE',
          '?ids=1&ids=x',
          '?filter=1',
          '?filter={"__proto__":{"a":1}}',
        ]) {
          expect((await query(search)).source).toBe('query')
        }
      })

      it('gives text the form that the schemas of url params and parts describe', async () => {
        const params = await fetch(url('/decode/params/7/true/8'))
        expect(await params.json()).toEqual({ id: 7, flag: true, name: '8' })
        expect((await fetch(url('/decode/params/x/true/8'))).status).toBe(400)

        const form = new FormData()
        form.append('title', '{"not":"parsed"}')
        form.append('tags', 'one')
        form.append('count', '5')
        form.append('flag', 'false')
        form.append('meta', '{"a":1}')
        expect(await (await post('/decode/upload', form)).json()).toEqual({
          title: '{"not":"parsed"}',
          tags: ['one'],
          count: 5,
          flag: false,
          meta: { a: 1 },
        })
      })

      it('takes names of members of every object as plain names', async () => {
        const response = await fetch(
          url('/decode/prototype?constructor=a&constructor=b&__proto__=c&toString=d'),
        )
        expect(await response.json()).toEqual({
          query: [
            ['constructor', ['a', 'b']],
            ['__proto__', 'c'],
            ['toString', 'd'],
          ],
          header: null,
          other: null,
          cookie: null,
        })
      })

      it('gives the bytes of a body before and after it is decoded', async () => {
        const text = '{ "name":"\\u0061nn" }\n'
        const raw = await post('/decode/raw', text, 'application/json')
        expect(await raw.json()).toEqual({ name: 'ann', text, isSame: true })

        const bytes = new Uint8Array([0, 255, 128, 10])
        const only = await post('/decode/raw-only', new Blob([bytes]), 'application/x-unknown')
        expect(await only.json()).toEqual({ bytes: [...bytes] })
        const none = await post('/decode/raw-only', undefined)
        expect(await none.json()).toEqual({ bytes: [] })

        const signed = (length: number) =>
          fetch(url('/decode/signed'), json({ name: 'ann' }, { 'x-signature': String(length) }))
        expect(await (await signed(14)).json()).toEqual({ name: 'ann' })
        expect((await signed(13)).status).toBe(403)
      })

      it('gives the bytes of a multipart body before it is decoded', async () => {
        const form = new FormData()
        form.append('title', 'report')
        form.append('file', new File(['hello'], 'a.txt', { type: 'text/plain' }))
        const built = new Response(form)
        const contentType = built.headers.get('content-type')!
        const bytes = new Uint8Array(await built.arrayBuffer())
        const send = (length: number) =>
          fetch(url('/decode/signed-upload'), {
            method: 'POST',
            headers: { 'content-type': contentType, 'x-signature': String(length) },
            body: bytes,
          })
        expect(await (await send(bytes.byteLength)).json()).toEqual({
          title: 'report',
          file: 'hello',
        })
        expect((await send(1)).status).toBe(403)
      })

      const { bodyLimit } = options
      if (bodyLimit !== undefined) {
        it('answers 413 for the raw bytes of a body over the limit', async () => {
          const chunks = (size: number) =>
            new ReadableStream({
              start(controller) {
                controller.enqueue(new Uint8Array(size))
                controller.close()
              },
            })
          const send = (size: number) =>
            fetch(url('/decode/raw-only'), {
              method: 'POST',
              headers: { 'content-type': 'application/x-unknown' },
              body: chunks(size),
              duplex: 'half',
            })
          await isProblem(await send(bodyLimit + 1), 413)
          expect((await send(16)).status).toBe(200)
        })
      }
    },
  }
}
