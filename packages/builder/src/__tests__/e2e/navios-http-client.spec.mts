import { create } from '@navios/http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import { builder } from '../../index.mjs'

import type { BuilderInstance } from '../../index.mjs'

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
    // The client picks up `fetch` when it is created
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
})
