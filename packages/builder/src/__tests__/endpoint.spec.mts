import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import { builder } from '../http/builder.mjs'
import { getCookie } from '../http/response-headers.mjs'
import { EndpointError, isEndpointError, isHttpError, NaviosError } from '../index.mjs'

import type { AbstractRequestConfig, AbstractResponse, Client } from '../index.mjs'

type Reply = Partial<AbstractResponse<unknown>> | (() => never)

function makeClient(initial?: Reply) {
  const calls: AbstractRequestConfig[] = []
  let reply: Reply = initial ?? { data: { id: '1', name: 'Ada' } }
  const client: Client & { calls: AbstractRequestConfig[]; reply: (next: Reply) => void } = {
    calls,
    reply: (next) => {
      reply = next
    },
    request: async (config) => {
      calls.push(config)
      if (typeof reply === 'function') return reply()
      return { status: 200, statusText: 'OK', headers: {}, data: null, ...reply } as never
    },
  }
  return client
}

/** A rejection in the axios / @navios/http style: an Error carrying `response`. */
function httpRejection(status: number, data: unknown) {
  return Object.assign(new Error(`Request failed with status ${status}`), {
    response: { status, statusText: 'ERR', headers: { 'x-request-id': 'r1' }, data },
  })
}

const userSchema = z.object({ id: z.string(), name: z.string() })

describe('endpoint handler', () => {
  let client: ReturnType<typeof makeClient>
  let onError: ReturnType<typeof vi.fn<(error: EndpointError) => void>>
  let api: ReturnType<typeof builder>

  beforeEach(() => {
    client = makeClient()
    onError = vi.fn<(error: EndpointError) => void>()
    api = builder({ client, onError })
  })

  describe('success', () => {
    it('returns parsed data from the throwing call', async () => {
      const getUser = api.declareEndpoint({
        method: 'GET',
        url: '/users/$userId',
        responseSchema: userSchema,
      })

      await expect(getUser({ urlParams: { userId: 7 } })).resolves.toEqual({
        id: '1',
        name: 'Ada',
      })
      expect(client.calls[0]).toMatchObject({ method: 'GET', url: '/users/7' })
      expect(onError).not.toHaveBeenCalled()
    })

    it('returns a SafeResult with response metadata from safe()', async () => {
      client.reply({ data: { id: '1', name: 'Ada' }, headers: { etag: 'abc' } })
      const getUser = api.declareEndpoint({
        method: 'GET',
        url: '/users',
        responseSchema: userSchema,
      })

      const res = await getUser.safe()

      expect(res.ok).toBe(true)
      expect(res.data).toEqual({ id: '1', name: 'Ada' })
      expect(res.error).toBeNull()
      expect(res.response?.status).toBe(200)
      expect(res.response?.headers).toBeInstanceOf(Headers)
      expect(res.response?.headers.get('etag')).toBe('abc')
    })

    it('can be called without arguments when nothing is required', async () => {
      const list = api.declareEndpoint({ method: 'GET', url: '/users', responseSchema: z.any() })
      await expect(list()).resolves.toBeDefined()
    })

    it('skips response validation when validateResponse is false', async () => {
      client.reply({ data: { unexpected: true } })
      const ep = api.declareEndpoint({
        method: 'GET',
        url: '/users',
        responseSchema: userSchema,
        validateResponse: false,
      })
      await expect(ep()).resolves.toEqual({ unexpected: true })
    })
  })

  describe('response kinds', () => {
    it('blob: sets responseType and returns the body untouched', async () => {
      const blob = new Blob(['x'])
      client.reply({ data: blob })
      const download = api.declareEndpoint({ method: 'GET', url: '/f/$id', response: 'blob' })

      await expect(download({ urlParams: { id: 1 } })).resolves.toBe(blob)
      expect(client.calls[0]?.responseType).toBe('blob')
    })

    it('text and stream set their responseType', async () => {
      client.reply({ data: 'hello' })
      const text = api.declareEndpoint({ method: 'GET', url: '/t', response: 'text' })
      await expect(text()).resolves.toBe('hello')
      expect(client.calls[0]?.responseType).toBe('text')

      const stream = api.declareEndpoint({ method: 'GET', url: '/s', response: 'stream' })
      await stream()
      expect(client.calls[1]?.responseType).toBe('stream')
    })

    it('void: resolves to undefined whatever the body is', async () => {
      client.reply({ status: 204, data: '' })
      const remove = api.declareEndpoint({ method: 'DELETE', url: '/f/$id', response: 'void' })

      await expect(remove({ urlParams: { id: 1 } })).resolves.toBeUndefined()
      const res = await remove.safe({ urlParams: { id: 1 } })
      expect(res).toMatchObject({ ok: true, data: undefined })
      expect(res.response?.status).toBe(204)
    })

    it('json: does not set responseType', async () => {
      const ep = api.declareEndpoint({ method: 'GET', url: '/u', responseSchema: z.any() })
      await ep()
      expect(client.calls[0]).not.toHaveProperty('responseType')
    })
  })

  describe('multipart body', () => {
    it('converts data to FormData', async () => {
      const upload = api.declareEndpoint({
        method: 'POST',
        url: '/files',
        body: 'multipart',
        requestSchema: z.object({ file: z.instanceof(File), tags: z.array(z.string()) }),
        responseSchema: z.any(),
      })
      const file = new File(['content'], 'a.txt')

      await upload({ data: { file, tags: ['x', 'y'] } })

      const sent = client.calls[0]?.data as FormData
      expect(sent).toBeInstanceOf(FormData)
      expect((sent.get('file') as File).name).toBe('a.txt')
      expect(sent.getAll('tags')).toEqual(['x', 'y'])
    })
  })

  describe('http errors', () => {
    const errorSchema = {
      400: z.object({ status: z.string(), message: z.string() }),
      409: z.string(),
      422: z.array(z.string()),
    }
    function declare() {
      return api.declareEndpoint({
        method: 'GET',
        url: '/users/$userId',
        responseSchema: userSchema,
        errorSchema,
      })
    }

    it('throws an EndpointError of kind http with the parsed body', async () => {
      client.reply(() => {
        throw httpRejection(400, { status: 'failed', message: 'nope', extra: 1 })
      })
      const error = await declare()({ urlParams: { userId: 1 } }).catch((e: unknown) => e)

      expect(error).toBeInstanceOf(EndpointError)
      expect(error).toBeInstanceOf(NaviosError)
      expect(error).toBeInstanceOf(Error)
      expect(isEndpointError(error)).toBe(true)
      expect(isHttpError(error, 400)).toBe(true)
      expect(isHttpError(error, 404)).toBe(false)
      const e = error as EndpointError
      expect(e.kind).toBe('http')
      expect(e.status).toBe(400)
      expect(e.endpoint).toEqual({ method: 'GET', url: '/users/$userId' })
      expect(e.response?.headers.get('x-request-id')).toBe('r1')
      expect(e.message).toBe('GET /users/$userId failed with status 400')
    })

    it('never rewrites the body: a `status` field keeps its own value', async () => {
      client.reply(() => {
        throw httpRejection(400, { status: 'failed', message: 'nope' })
      })
      const res = await declare().safe({ urlParams: { userId: 1 } })

      expect(res.error?.body).toEqual({ status: 'failed', message: 'nope' })
    })

    it('keeps array and string bodies as they are', async () => {
      client.reply(() => {
        throw httpRejection(422, ['a', 'b'])
      })
      expect((await declare().safe({ urlParams: { userId: 1 } })).error?.body).toEqual(['a', 'b'])

      client.reply(() => {
        throw httpRejection(409, 'conflict')
      })
      expect((await declare().safe({ urlParams: { userId: 1 } })).error?.body).toBe('conflict')
    })

    it('reports a status without a schema as http-unknown with the raw body', async () => {
      client.reply(() => {
        throw httpRejection(500, { boom: true })
      })
      const res = await declare().safe({ urlParams: { userId: 1 } })

      expect(res.ok).toBe(false)
      expect(res.error).toMatchObject({ kind: 'http-unknown', status: 500, body: { boom: true } })
      expect(res.response?.status).toBe(500)
    })

    it('reports an error body that fails its schema as response-validation', async () => {
      client.reply(() => {
        throw httpRejection(400, { unexpected: true })
      })
      const res = await declare().safe({ urlParams: { userId: 1 } })

      expect(res.error?.kind).toBe('response-validation')
      expect(res.error?.status).toBe(400)
      expect(res.error?.body).toEqual({ unexpected: true })
      expect(res.error?.issues?.length).toBeGreaterThan(0)
    })

    it('treats a resolved non-2xx response as an error (fetch-style clients)', async () => {
      client.reply({ status: 400, data: { status: 'failed', message: 'nope' } })
      const res = await declare().safe({ urlParams: { userId: 1 } })

      expect(res.error).toMatchObject({ kind: 'http', status: 400 })

      client.reply({ status: 404, data: 'gone' })
      await expect(declare()({ urlParams: { userId: 1 } })).rejects.toMatchObject({
        kind: 'http-unknown',
        status: 404,
        body: 'gone',
      })
    })

    it('applies errorSchema in the throwing call as well', async () => {
      client.reply(() => {
        throw httpRejection(400, { status: 'failed', message: 'nope', extra: 1 })
      })
      await expect(declare()({ urlParams: { userId: 1 } })).rejects.toMatchObject({
        kind: 'http',
        // `extra` is stripped by the schema, proving the body was parsed.
        body: { status: 'failed', message: 'nope' },
      })
    })
  })

  describe('validation', () => {
    it('reports a 2xx body that fails responseSchema as response-validation', async () => {
      client.reply({ data: { id: 1 } })
      const ep = api.declareEndpoint({ method: 'GET', url: '/u', responseSchema: userSchema })

      const res = await ep.safe()

      expect(res.error?.kind).toBe('response-validation')
      expect(res.error?.status).toBe(200)
      expect(res.error?.body).toEqual({ id: 1 })
      expect(res.response?.status).toBe(200)
      await expect(ep()).rejects.toBeInstanceOf(EndpointError)
    })

    it('reports invalid input as request-validation and sends nothing', async () => {
      const ep = api.declareEndpoint({
        method: 'POST',
        url: '/users/$id',
        requestSchema: z.object({ n: z.number() }),
        querySchema: z.object({ page: z.number() }),
        urlParamsSchema: z.object({ id: z.uuid() }),
        responseSchema: z.any(),
      })
      const id = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90'

      const badBody = await ep.safe({
        urlParams: { id },
        params: { page: 1 },
        data: { n: 'x' as never },
      })
      const badQuery = await ep.safe({
        urlParams: { id },
        params: { page: 'x' as never },
        data: { n: 1 },
      })
      const badUrl = await ep.safe({
        urlParams: { id: 'nope' },
        params: { page: 1 },
        data: { n: 1 },
      })

      for (const res of [badBody, badQuery, badUrl]) {
        expect(res.ok).toBe(false)
        expect(res.error?.kind).toBe('request-validation')
        expect(res.error?.issues?.length).toBeGreaterThan(0)
        expect(res.response).toBeNull()
      }
      expect(client.calls).toHaveLength(0)
      expect(onError).toHaveBeenCalledTimes(3)
      await expect(
        ep({ urlParams: { id }, params: { page: 1 }, data: { n: 'x' as never } }),
      ).rejects.toMatchObject({ kind: 'request-validation' })
    })
  })

  describe('transport failures', () => {
    const declare = () => api.declareEndpoint({ method: 'GET', url: '/u', responseSchema: z.any() })

    it('network: a rejection without a response', async () => {
      const cause = new TypeError('fetch failed')
      client.reply(() => {
        throw cause
      })
      const res = await declare().safe()

      expect(res.error?.kind).toBe('network')
      expect(res.error?.cause).toBe(cause)
      expect(res.response).toBeNull()
    })

    it('aborted: by error name or by the call signal', async () => {
      client.reply(() => {
        throw new DOMException('The operation was aborted', 'AbortError')
      })
      expect((await declare().safe()).error?.kind).toBe('aborted')

      const controller = new AbortController()
      controller.abort()
      client.reply(() => {
        throw new Error('socket hang up')
      })
      expect((await declare().safe({ signal: controller.signal })).error?.kind).toBe('aborted')
    })

    it('timeout: TimeoutError, AbortSignal.timeout reason, or an axios code', async () => {
      client.reply(() => {
        throw new DOMException('timed out', 'TimeoutError')
      })
      expect((await declare().safe()).error?.kind).toBe('timeout')

      client.reply(() => {
        throw Object.assign(new Error('timeout of 5ms exceeded'), { code: 'ECONNABORTED' })
      })
      expect((await declare().safe()).error?.kind).toBe('timeout')

      const signal = AbortSignal.timeout(1)
      await new Promise((resolve) => setTimeout(resolve, 10))
      client.reply(() => {
        throw new Error('aborted')
      })
      expect((await declare().safe({ signal })).error?.kind).toBe('timeout')
    })
  })

  describe('config failures', () => {
    it('safe() does not throw when no client was provided', async () => {
      const bare = builder({ onError })
      const ep = bare.declareEndpoint({ method: 'GET', url: '/u', responseSchema: z.any() })

      const res = await ep.safe()

      expect(res.error?.kind).toBe('config')
      expect(res.error?.message).toContain('Client was not provided')
      expect(onError).toHaveBeenCalledTimes(1)
      await expect(ep()).rejects.toMatchObject({ kind: 'config' })
    })

    it('reports missing URL params as config', async () => {
      const ep = api.declareEndpoint({ method: 'GET', url: '/u/$id', responseSchema: z.any() })

      const res = await ep.safe({} as never)

      expect(res.error?.kind).toBe('config')
      expect(res.error?.message).toContain('id')
      expect(client.calls).toHaveLength(0)
    })

    it('rejects a urlParamsSchema that does not match the URL at declaration', () => {
      expect(() =>
        api.declareEndpoint({
          method: 'GET',
          url: '/users/$userId',
          urlParamsSchema: z.object({ id: z.string() }),
          responseSchema: z.any(),
        }),
      ).toThrow(/missing in schema: userId; not in URL: id/)
    })
  })

  describe('onError hook', () => {
    it('receives the same instance the caller gets, once', async () => {
      client.reply(() => {
        throw httpRejection(500, null)
      })
      const ep = api.declareEndpoint({ method: 'GET', url: '/u', responseSchema: z.any() })

      const thrown = await ep().catch((e: unknown) => e)

      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError.mock.calls[0]?.[0]).toBe(thrown)
    })

    it('cannot change the outcome by throwing', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const noisy = builder({
        client,
        onError: () => {
          throw new Error('hook bug')
        },
      })
      client.reply({ status: 500 })
      const ep = noisy.declareEndpoint({ method: 'GET', url: '/u', responseSchema: z.any() })

      const res = await ep.safe()

      expect(res.error?.kind).toBe('http-unknown')
      expect(consoleError).toHaveBeenCalled()
      consoleError.mockRestore()
    })
  })

  describe('request config', () => {
    it('forwards only builder-owned keys plus clientOptions', async () => {
      const ep = api.declareEndpoint({
        method: 'GET',
        url: '/a/$id',
        responseSchema: z.any(),
        clientOptions: { withCredentials: true, url: '/hijack', method: 'DELETE' },
      })

      await ep({ urlParams: { id: 1 } })

      expect(client.calls[0]).toEqual({
        withCredentials: true,
        method: 'GET',
        url: '/a/1',
        params: {},
        data: undefined,
      })
      expect(client.calls[0]).not.toHaveProperty('urlParams')
    })

    it('merges headers and timeout: call over endpoint', async () => {
      const ep = api.declareEndpoint({
        method: 'GET',
        url: '/a',
        responseSchema: z.any(),
        headers: { a: 'endpoint', b: 'endpoint' },
        timeout: 1000,
      })

      await ep({ headers: { b: 'call' } })
      await ep({ timeout: 5 })

      expect(client.calls[0]).toMatchObject({
        headers: { a: 'endpoint', b: 'call' },
        timeout: 1000,
      })
      expect(client.calls[1]?.timeout).toBe(5)
    })
  })

  describe('client binding', () => {
    it('uses a per-call client without touching the shared one', async () => {
      const other = makeClient({ data: { id: '2', name: 'Per call' } })
      const ep = api.declareEndpoint({ method: 'GET', url: '/u', responseSchema: userSchema })

      await expect(ep({}, { client: other })).resolves.toEqual({ id: '2', name: 'Per call' })
      expect(other.calls).toHaveLength(1)
      expect(client.calls).toHaveLength(0)
      expect(api.getClient()).toBe(client)
    })

    it('withClient returns an independent builder', async () => {
      const other = makeClient()
      const scoped = api.withClient(other)
      const ep = scoped.declareEndpoint({ method: 'GET', url: '/u', responseSchema: z.any() })

      await ep()

      expect(other.calls).toHaveLength(1)
      expect(scoped.getClient()).toBe(other)
      expect(api.getClient()).toBe(client)
    })

    it('provideClient replaces the client', () => {
      const bare = builder()
      expect(() => bare.getClient()).toThrow(NaviosError)
      bare.provideClient(client)
      expect(bare.getClient()).toBe(client)
    })
  })

  describe('review regressions', () => {
    it('accepts an omitted body when the request schema has no required fields', async () => {
      const ep = api.declareEndpoint({
        method: 'POST',
        url: '/things',
        requestSchema: z.object({ note: z.string().optional() }),
        responseSchema: z.any(),
      })

      expect((await ep.safe()).ok).toBe(true)
      expect((await ep.safe({})).ok).toBe(true)
      await expect(ep()).resolves.toBeDefined()
      expect(client.calls).toHaveLength(3)

      const optionalBody = api.declareEndpoint({
        method: 'POST',
        url: '/maybe',
        requestSchema: z.string().optional(),
        responseSchema: z.any(),
      })
      await optionalBody()
      expect(client.calls[3]?.data).toBeUndefined()
    })

    it('still rejects an omitted body when the schema requires fields', async () => {
      const ep = api.declareEndpoint({
        method: 'POST',
        url: '/things',
        requestSchema: z.object({ note: z.string() }),
        responseSchema: z.any(),
      })

      const res = await ep.safe({} as never)

      expect(res.error?.kind).toBe('request-validation')
      // The reported issue is for the value that was actually passed.
      expect(res.error?.issues?.[0]?.path).toEqual([])
    })

    it('safe() never rejects on header bags that Headers refuses', async () => {
      const ep = api.declareEndpoint({ method: 'GET', url: '/u', responseSchema: z.any() })

      client.reply({
        data: { ok: true },
        headers: { 'x-name': 'Zoë — ☃', 'bad header': 'x', etag: 'e' },
      })
      const ok = await ep.safe()
      expect(ok.ok).toBe(true)
      expect(ok.response?.headers.get('etag')).toBe('e')
      expect(ok.response?.headers.has('x-name')).toBe(false)

      client.reply(() => {
        throw Object.assign(new Error('http'), {
          response: { status: 500, statusText: '', data: null, headers: { 'x-msg': 'ошибка' } },
        })
      })
      const failed = await ep.safe()
      expect(failed.error).toMatchObject({ kind: 'http-unknown', status: 500 })
    })

    it('keeps every set-cookie value when the client reports an array', async () => {
      client.reply({ headers: { 'set-cookie': ['a=1; Path=/', 'b=2; Path=/'] } as never })
      const ep = api.declareEndpoint({ method: 'GET', url: '/u', response: 'void' })

      const res = await ep.safe()

      expect(res.response?.headers.getSetCookie()).toEqual(['a=1; Path=/', 'b=2; Path=/'])
      expect(getCookie(res.response, 'b')).toBe('2')
    })

    it('safe() never rejects on null args or a client that resolves with nothing', async () => {
      const ep = api.declareEndpoint({ method: 'GET', url: '/u', responseSchema: z.any() })

      expect((await ep.safe(null as never)).ok).toBe(true)

      const empty = { request: async () => undefined as never }
      const res = await ep.safe({}, { client: empty })
      expect(res.ok).toBe(false)
      expect(res.error?.kind).toBe('network')
      expect(res.error?.message).toContain('resolved without a response')

      const hostile = {
        request: async () =>
          ({
            get status(): number {
              throw new Error('boom')
            },
          }) as never,
      }
      const thrown = await ep.safe({}, { client: hostile })
      expect(thrown.ok).toBe(false)
      expect(thrown.error).toBeInstanceOf(EndpointError)
      await expect(ep({}, { client: hostile })).rejects.toBeInstanceOf(EndpointError)
    })

    it('treats an empty-string URL parameter as missing', async () => {
      const ep = api.declareEndpoint({ method: 'DELETE', url: '/users/$userId', response: 'void' })

      const res = await ep.safe({ urlParams: { userId: '' } })

      expect(res.error?.kind).toBe('config')
      expect(res.error?.message).toContain('userId')
      expect(client.calls).toHaveLength(0)
    })

    it('multipart: sends Blob parts, passes FormData through, omits undefined', async () => {
      const upload = api.declareEndpoint({
        method: 'POST',
        url: '/files',
        body: 'multipart',
        requestSchema: z.object({
          file: z.instanceof(Blob),
          caption: z.string().optional(),
          tags: z.array(z.string()),
        }),
        response: 'void',
      })
      await upload({ data: { file: new Blob(['hello']), caption: undefined, tags: [] } })
      const sent = client.calls[0]?.data as FormData
      expect(sent.get('file')).toBeInstanceOf(Blob)
      expect(sent.has('caption')).toBe(false)

      const raw = api.declareEndpoint({
        method: 'POST',
        url: '/raw',
        body: 'multipart',
        requestSchema: z.instanceof(FormData),
        response: 'void',
      })
      const input = new FormData()
      input.append('a', '1')
      await raw({ data: input })
      const passedThrough = client.calls[1]?.data
      expect(passedThrough).toBeInstanceOf(FormData)
      expect([...(passedThrough as FormData).keys()]).toEqual(['a'])
    })
  })

  describe('EndpointError', () => {
    it('has no own property for fields that do not apply', async () => {
      client.reply(() => {
        throw new TypeError('fetch failed')
      })
      const ep = api.declareEndpoint({ method: 'GET', url: '/u', responseSchema: z.any() })
      const res = await ep.safe()

      expect(res.error?.kind).toBe('network')
      expect('body' in res.error!).toBe(false)
      expect('status' in res.error!).toBe(false)
      expect('issues' in res.error!).toBe(false)
      expect(Object.keys(JSON.parse(JSON.stringify(res.error))).sort()).toEqual([
        'endpoint',
        'kind',
        'message',
        'name',
        'response',
      ])
    })

    it('serializes without cause and with plain headers', async () => {
      client.reply(() => {
        throw httpRejection(500, { boom: true })
      })
      const ep = api.declareEndpoint({ method: 'GET', url: '/u', responseSchema: z.any() })
      const res = await ep.safe()

      expect(JSON.parse(JSON.stringify(res.error))).toEqual({
        name: 'EndpointError',
        message: 'GET /u failed with status 500',
        kind: 'http-unknown',
        endpoint: { method: 'GET', url: '/u' },
        status: 500,
        body: { boom: true },
        response: { status: 500, statusText: 'ERR', headers: { 'x-request-id': 'r1' } },
      })
    })
  })
})
