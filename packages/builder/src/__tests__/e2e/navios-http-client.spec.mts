import navios, { create } from '@navios/http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import { builder } from '../../index.mjs'

import type { BuilderInstance, Schema } from '../../index.mjs'

/**
 * The other e2e tests run against a mock client. These run against the real
 * `@navios/http` client with only `fetch` stubbed, so what the builder asks
 * for and what the client does with it are tested together.
 */
describe('endpoints over the real @navios/http client', () => {
  const fetchMock = vi.fn<typeof fetch>()
  let api: BuilderInstance

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    api = builder({ client: create({ baseURL: 'http://api.test' }) })
  })

  afterEach(() => {
    fetchMock.mockReset()
    vi.unstubAllGlobals()
  })

  function lastCall() {
    const [url, init] = fetchMock.mock.calls.at(-1)!
    return { url: String(url), init: init! }
  }

  it('should parse a JSON 200', async () => {
    fetchMock.mockResolvedValue(Response.json({ id: '1', name: 'Ada' }))
    const getUser = api.declareEndpoint({
      method: 'GET',
      url: '/users/$id',
      querySchema: z.object({ expand: z.string() }),
      responseSchema: z.object({ id: z.string(), name: z.string() }),
    })

    const user = await getUser({ urlParams: { id: 1 }, params: { expand: 'team' } })

    expect(user).toEqual({ id: '1', name: 'Ada' })
    expect(lastCall().url).toBe('http://api.test/users/1?expand=team')
    expect(lastCall().init.method).toBe('GET')
  })

  it("should resolve undefined for response: 'void' on a 204", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    const deleteUser = api.declareEndpoint({
      method: 'DELETE',
      url: '/users/$id',
      response: 'void',
    })

    const result = await deleteUser.safe({ urlParams: { id: 1 } })

    expect(result.error).toBeNull()
    expect(result.ok).toBe(true)
    expect(result.data).toBeUndefined()
    expect(result.response?.status).toBe(204)
  })

  it("should resolve undefined for response: 'void' on a 200 with a body that is not JSON", async () => {
    fetchMock.mockResolvedValue(new Response('OK', { status: 200 }))
    const ping = api.declareEndpoint({ method: 'POST', url: '/ping', response: 'void' })

    const result = await ping.safe()

    expect(result.error).toBeNull()
    expect(result.data).toBeUndefined()
  })

  it('should resolve undefined for a status declared as null in `responses`', async () => {
    const createUser = api.declareEndpoint({
      method: 'POST',
      url: '/users',
      requestSchema: z.object({ name: z.string() }),
      responses: { 200: z.object({ id: z.string() }), 204: null },
    })

    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    const empty = await createUser.safe({ data: { name: 'Ada' } })
    expect(empty.error).toBeNull()
    expect(empty.data).toBeUndefined()
    expect(empty.response?.status).toBe(204)
    expect(lastCall().init.body).toBe('{"name":"Ada"}')

    fetchMock.mockResolvedValue(Response.json({ id: '1' }))
    expect(await createUser({ data: { name: 'Ada' } })).toEqual({ id: '1' })
  })

  it('should report an error status declared in errorSchema as `http` with the parsed body', async () => {
    fetchMock.mockResolvedValue(Response.json({ message: 'no such user' }, { status: 404 }))
    const getUser = api.declareEndpoint({
      method: 'GET',
      url: '/users/$id',
      responseSchema: z.object({ id: z.string() }),
      errorSchema: { 404: z.object({ message: z.string() }) },
    })

    const result = await getUser.safe({ urlParams: { id: 1 } })

    expect(result.ok).toBe(false)
    expect(result.error).toMatchObject({
      kind: 'http',
      status: 404,
      body: { message: 'no such user' },
    })
    expect(result.response?.status).toBe(404)
  })

  describe('problem details, the error bodies of a Navios server', () => {
    const problem = (status: number, detail: object) =>
      new Response(JSON.stringify({ type: 'about:blank', status, ...detail }), {
        status,
        headers: { 'content-type': 'application/problem+json; charset=utf-8' },
      })

    it('should match an errorSchema entry', async () => {
      fetchMock.mockResolvedValue(problem(404, { title: 'Not Found' }))
      const getUser = api.declareEndpoint({
        method: 'GET',
        url: '/users/$id',
        responseSchema: z.object({ id: z.string() }),
        errorSchema: { 404: z.object({ title: z.string() }) },
      })

      const result = await getUser.safe({ urlParams: { id: 1 } })

      expect(result.error).toMatchObject({
        kind: 'http',
        status: 404,
        body: { title: 'Not Found' },
      })
    })

    it.each(['blob', 'text', 'stream', 'void'] as const)(
      'should match an errorSchema entry of an endpoint with response %s',
      async (response) => {
        fetchMock.mockResolvedValue(problem(403, { title: 'Forbidden' }))
        const ep = api.declareEndpoint({
          method: 'GET',
          url: '/x',
          response,
          errorSchema: { 403: z.object({ title: z.string() }) },
        })

        const result = await ep.safe()

        expect(result.error).toMatchObject({ kind: 'http', body: { title: 'Forbidden' } })
      },
    )

    it('should be the parsed body of http-unknown', async () => {
      fetchMock.mockResolvedValue(problem(403, { title: 'Forbidden' }))
      const ep = api.declareEndpoint({ method: 'GET', url: '/x', responseSchema: z.any() })

      const result = await ep.safe()

      expect(result.error).toMatchObject({
        kind: 'http-unknown',
        body: { type: 'about:blank', status: 403, title: 'Forbidden' },
      })
    })
  })

  describe('request bodies', () => {
    function declare(requestSchema: Schema) {
      fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
      return api.declareEndpoint({ method: 'POST', url: '/x', requestSchema, response: 'void' })
    }

    it.each([
      ['a string', z.string(), '42', '"42"'],
      ['an empty string', z.string(), '', '""'],
      ['zero', z.number(), 0, '0'],
      ['false', z.boolean(), false, 'false'],
      ['null', z.null(), null, 'null'],
      ['an array', z.array(z.number()), [1], '[1]'],
      [
        'an object',
        z.object({ a: z.date() }),
        { a: new Date(5) },
        '{"a":"1970-01-01T00:00:00.005Z"}',
      ],
    ])('should send %s as JSON', async (_name, schema, data, body) => {
      const result = await declare(schema as Schema).safe({ data })

      expect(result.error).toBeNull()
      expect(lastCall().init.body).toBe(body)
      expect(new Headers(lastCall().init.headers).get('content-type')).toBe('application/json')
    })

    it('should send the caller input, which the server parses', async () => {
      const result = await declare(
        z.object({ ids: z.string().transform((s) => s.split(',')) }),
      ).safe({ data: { ids: 'a,b' } })

      expect(result.error).toBeNull()
      expect(lastCall().init.body).toBe('{"ids":"a,b"}')
    })

    it('should leave the content type of a multipart body to fetch', async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
      const upload = builder({
        client: create({
          baseURL: 'http://api.test',
          headers: { 'Content-Type': 'application/json' },
        }),
      }).declareEndpoint({
        method: 'POST',
        url: '/x',
        body: 'multipart',
        requestSchema: z.object({ a: z.string() }),
        response: 'void',
      })

      await upload({ data: { a: 'x' } })

      expect(lastCall().init.body).toBeInstanceOf(FormData)
      expect(new Headers(lastCall().init.headers).has('content-type')).toBe(false)
    })

    it('should report a body that cannot be serialised as config', async () => {
      const result = await declare(z.object({ n: z.bigint() })).safe({ data: { n: 1n } })

      expect(result.error?.kind).toBe('config')
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  it('should send the query of params, with dates and repeated keys', async () => {
    fetchMock.mockResolvedValue(Response.json([]))
    const list = api.declareEndpoint({
      method: 'GET',
      url: '/users',
      querySchema: z.object({
        page: z.number().default(1),
        tag: z.array(z.string()),
        since: z.date(),
        deleted: z.boolean().optional(),
        filter: z.object({ a: z.number() }),
      }),
      responseSchema: z.array(z.any()),
    })

    await list({
      params: { tag: ['x', 'y'], since: new Date(5), deleted: false, filter: { a: 1 } },
    })

    expect([...new URL(lastCall().url).searchParams]).toEqual([
      ['tag', 'x'],
      ['tag', 'y'],
      ['since', '1970-01-01T00:00:00.005Z'],
      ['deleted', 'false'],
      ['filter', '{"a":1}'],
    ])
  })

  it('should let a header of the call replace a default of the client', async () => {
    fetchMock.mockResolvedValue(Response.json({}))
    const ep = builder({
      client: create({ baseURL: 'http://api.test', headers: { authorization: 'Bearer default' } }),
    }).declareEndpoint({ method: 'GET', url: '/x', responseSchema: z.any() })

    await ep({ headers: { Authorization: 'Bearer per-call' } })

    expect(new Headers(lastCall().init.headers).get('authorization')).toBe('Bearer per-call')
  })

  describe('a body that breaks off', () => {
    const broken = (reason: unknown) =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"a":'))
            controller.error(reason)
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    const getUser = () =>
      api.declareEndpoint({ method: 'GET', url: '/users', responseSchema: z.any() })

    it('should be `network` when the connection was lost', async () => {
      fetchMock.mockResolvedValue(broken(new TypeError('terminated')))

      const result = await getUser().safe()

      expect(result.error?.kind).toBe('network')
      expect(result.response).toBeNull()
    })

    it.each([
      ['an Error', new Error('navigated away')],
      ['a string', 'bye'],
    ])('should be `aborted` when aborted with %s', async (_name, reason) => {
      const controller = new AbortController()
      fetchMock.mockImplementation(async () => {
        controller.abort(reason)
        return broken(reason)
      })

      const result = await getUser().safe({ signal: controller.signal })

      expect(result.error?.kind).toBe('aborted')
    })
  })

  describe('unparsable bodies', () => {
    const getUser = () =>
      api.declareEndpoint({
        method: 'GET',
        url: '/users/$id',
        responseSchema: z.object({ id: z.string() }),
      })

    it('should report a 500 with an empty JSON body as `http-unknown` with its status', async () => {
      fetchMock.mockResolvedValue(
        new Response('', { status: 500, headers: { 'content-type': 'application/json' } }),
      )

      const result = await getUser().safe({ urlParams: { id: 1 } })

      expect(result.error).toMatchObject({ kind: 'http-unknown', status: 500 })
      expect(result.response?.status).toBe(500)
    })

    it('should report a 502 HTML page as `http-unknown` with its status and text', async () => {
      fetchMock.mockResolvedValue(
        new Response('<html>', { status: 502, headers: { 'content-type': 'text/html' } }),
      )

      const result = await getUser().safe({ urlParams: { id: 1 } })

      expect(result.error).toMatchObject({ kind: 'http-unknown', status: 502, body: '<html>' })
    })

    it('should report a 200 HTML page as `response-validation`, not `network`', async () => {
      fetchMock.mockResolvedValue(
        new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } }),
      )

      const result = await getUser().safe({ urlParams: { id: 1 } })

      expect(result.error).toMatchObject({
        kind: 'response-validation',
        status: 200,
        body: '<html>',
      })
      expect(result.error?.issues?.[0]?.message).toMatch(/could not be parsed/)
      expect(result.response?.status).toBe(200)
      expect(result.response?.headers.get('content-type')).toBe('text/html')
    })
  })

  it('should report a timeout as `timeout`', async () => {
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason))
        }),
    )
    const slow = api.declareEndpoint({ method: 'GET', url: '/slow', response: 'void', timeout: 10 })

    const result = await slow.safe()

    expect(result.error?.kind).toBe('timeout')
  })

  it('should accept the default export as a client', async () => {
    fetchMock.mockResolvedValue(Response.json({ ok: true }))
    const ep = builder({ client: navios }).declareEndpoint({
      method: 'GET',
      url: 'http://api.test/x',
      responseSchema: z.object({ ok: z.boolean() }),
    })

    expect(await ep()).toEqual({ ok: true })
  })
})
