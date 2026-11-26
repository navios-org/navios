import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import { compileBodyDecoder } from '../decoding/body-decoder.mjs'
import { isJsonType, mediaType } from '../decoding/media-type.mjs'
import { parseJson } from '../decoding/parse-json.mjs'
import { HttpException, ValidationError } from '../errors/index.mjs'

import type { BodySource } from '../adapter/route-input.mjs'
import type { RequestContext } from '../context/index.mjs'

import { body, input, setup } from './pipeline-setup.mjs'

describe('parseJson', () => {
  it('parses JSON and refuses keys that reach a prototype', () => {
    expect(parseJson('{"a":[1,{"b":null}],"constructor":{"x":1},"c":"__proto__"}')).toEqual({
      a: [1, { b: null }],
      constructor: { x: 1 },
      c: '__proto__',
    })
    for (const text of [
      '{"__proto__":1}',
      '[[{"a":{"__proto__":{}}}]]',
      '{"__proto\\u005f_":1}',
      '{"constructor":{"prototype":1}}',
      '{"const\\u0072uctor":{"prototype":{}}}',
    ]) {
      expect(() => parseJson(text), text).toThrow('The JSON body has a key that is not allowed')
    }
    // Hand-written, so that a deep body cannot exhaust the stack.
    const deep = `${'['.repeat(5000)}{"__proto__":1}${']'.repeat(5000)}`
    expect(() => parseJson(deep)).toThrow('not allowed')
  })

  it('says the same of any text that is not JSON', () => {
    for (const text of ['', '{', '{"a":undefined}', "{'a':1}"]) {
      expect(() => parseJson(text)).toThrow(/^Malformed JSON body$/)
    }
  })
})

describe('mediaType', () => {
  it.each([
    ['application/json', 'application/json', true],
    [' Application/JSON ; charset=utf-8', 'application/json', true],
    ['application/vnd.api+json', 'application/vnd.api+json', true],
    ['text/json', 'text/json', false],
    ['application/jsonx', 'application/jsonx', false],
    ['text/plain, application/json', undefined, false],
    ['application/json, text/plain', undefined, false],
    ['json', undefined, false],
    ['', undefined, false],
    [undefined, undefined, false],
  ])('%s', (header, type, isJson) => {
    expect(mediaType(header)).toBe(type)
    expect(type !== undefined && isJsonType(type)).toBe(isJson)
  })
})

describe('compileBodyDecoder', () => {
  const decode = (source: BodySource, config: object = {}) => {
    const ctx = { bodyBytes: () => source.bytes(), bodyParts: () => source.parts() }
    return compileBodyDecoder({ method: 'POST', url: '/', ...config })(
      ctx as unknown as RequestContext,
      source,
    )
  }
  const statusOf = (run: () => unknown) => {
    try {
      run()
      return 200
    } catch (error) {
      return error instanceof HttpException
        ? error.statusCode
        : error instanceof ValidationError
          ? 400
          : error
    }
  }

  it('reads nothing of a body whose type it does not take', () => {
    const bytes = vi.fn(() => new Uint8Array([1]))
    const parts = vi.fn(async function* () {})
    const source = { ...body('x', 'application/xml'), bytes, parts }
    expect(statusOf(() => decode(source))).toBe(415)
    expect(statusOf(() => decode(source, { body: 'multipart' }))).toBe(415)
    expect(bytes).not.toHaveBeenCalled()
    expect(parts).not.toHaveBeenCalled()
  })

  it('is synchronous for bytes that are there, and waits for those that are not', async () => {
    expect(decode(body('{"a":1}'))).toEqual({ a: 1 })
    const later = { ...body('{"a":1}'), bytes: async () => new TextEncoder().encode('{"a":2}') }
    expect(await decode(later)).toEqual({ a: 2 })
    const empty = { ...later, bytes: async () => new Uint8Array() }
    expect(await decode(empty)).toBeUndefined()
  })

  it('decodes text as UTF-8, without a byte order mark', () => {
    expect(decode(body('﻿привет', 'text/plain; charset=latin1'))).toBe('привет')
    expect(decode(body(new Uint8Array([0x61, 0xff]), 'text/html'))).toBe('a�')
  })

  it('takes what the native server has parsed as it is', () => {
    const value = { parsed: true }
    expect(decode(body(() => value, 'application/xml'))).toBe(value)
    expect(
      decode(
        body(() => value, 'application/xml'),
        { body: 'multipart' },
      ),
    ).toBe(value)
  })

  it('collects the parts of a multipart body into the fields of the schema', async () => {
    const file = new File(['x'], 'a.txt')
    const source: BodySource = {
      ...body('x', 'Multipart/Form-Data; boundary=x'),
      parts: async function* () {
        yield { name: 'tags', value: 'a' }
        yield { name: 'file', value: file }
        yield { name: 'twice', value: '1' }
        yield { name: 'twice', value: '2' }
      },
    }
    const requestSchema = z.object({
      tags: z.array(z.string()),
      file: z.instanceof(File),
      twice: z.string(),
    })
    expect(await decode(source, { body: 'multipart', requestSchema })).toEqual({
      tags: ['a'],
      file,
      twice: ['1', '2'],
    })
  })
})

describe('the body of a request', () => {
  const config = { method: 'POST', requestSchema: z.object({ name: z.string() }) }

  it('is not read when a guard refuses the request, or the query is not valid', async () => {
    const bytes = vi.fn(() => new TextEncoder().encode('{"name":"a"}'))
    const source = { ...body('{"name":"a"}'), bytes }
    const denied = setup(config, () => ({}), { guards: [{ canActivate: () => false }] })
    expect((await denied.execute(input({ body: source }))).status).toBe(403)
    const query = setup({ ...config, querySchema: z.object({ q: z.string() }) }, () => ({}))
    expect((await query.execute(input({ body: source }))).status).toBe(400)
    expect(bytes).not.toHaveBeenCalled()

    const accepted = setup(config, ({ data }) => data)
    expect((await accepted.execute(input({ body: source }))).body).toEqual({ name: 'a' })
    expect(bytes).toHaveBeenCalledTimes(1)
  })

  it('is read once for ctx.rawBody() and for decoding it', async () => {
    const bytes = vi.fn(async () => new TextEncoder().encode('{"name":"a"}'))
    const seen: unknown[] = []
    const { execute } = setup(
      config,
      async ({ data }, ctx) => {
        seen.push(await ctx.rawBody())
        return data
      },
      {
        guards: [
          {
            async canActivate(ctx) {
              seen.push(await ctx.rawBody())
              return true
            },
          },
        ],
      },
    )
    const answer = await execute(input({ body: { ...body('x'), bytes } }))
    expect(answer.body).toEqual({ name: 'a' })
    expect(bytes).toHaveBeenCalledTimes(1)
    expect(seen[0]).toBe(seen[1])
  })

  it('is not an unhandled rejection when nobody waits for it', async () => {
    const refused = new HttpException(413, 'too large')
    const { execute } = setup({ method: 'POST' }, (_params, ctx) => {
      void ctx.rawBody()
      return {}
    })
    for (const bytes of [
      () => Promise.reject(refused),
      () => {
        throw refused
      },
    ]) {
      expect((await execute(input({ body: { ...body('x'), bytes } }))).status).toBe(200)
    }
    // Vitest fails the run for an unhandled rejection.
    await new Promise((resolve) => setTimeout(resolve, 5))
  })

  it('has no raw bytes any more once the parts of a multipart body were read', async () => {
    const { execute, unhandled } = setup(
      { method: 'POST', body: 'multipart', requestSchema: z.any() },
      async (_params, ctx) => ({ bytes: (await ctx.rawBody()).byteLength }),
    )
    const answer = await execute(input({ body: body('x', 'multipart/form-data; boundary=x') }))
    expect(answer.status).toBe(500)
    expect((unhandled[0] as Error).message).toContain('in a guard')
  })
})

describe('the url of a request', () => {
  it('has the path that was matched, whatever the target and the host', async () => {
    const { execute } = setup(
      { url: '/items/$id' },
      (_params, ctx) => ({ path: ctx.path, href: ctx.url.href, same: ctx.url === ctx.url }),
      {},
    )
    for (const [url, href] of [
      ['https://app.test:8443/%69tems/7?a=1#x', 'https://app.test:8443/items/7?a=1'],
      ['/items/7?a=1', 'http://localhost/items/7?a=1'],
      ['http://a b/items/7?a=1', 'http://localhost/items/7?a=1'],
      ['http://a b/items/7', 'http://localhost/items/7'],
    ]) {
      const answer = await execute(input({ url: () => url, urlParams: { id: '7' } }))
      expect(answer.body).toEqual({ path: '/items/7', href, same: true })
    }
  })
})
