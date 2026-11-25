import { describe, expect, it } from 'vitest'

import { create } from '../client/create-navios.mjs'
import { HttpClientError } from '../http-client-error.mjs'

function clientFor(respond: () => Response) {
  return create({ baseURL: 'http://x.test', adapter: async () => respond() })
}

describe('navios::response body', () => {
  it('should resolve an empty 204 body as undefined for responseType json', async () => {
    const navios = clientFor(() => new Response(null, { status: 204 }))

    const response = await navios.delete('/items/1')

    expect(response.status).toBe(204)
    expect(response.data).toBeUndefined()
  })

  it('should resolve an empty 200 body as undefined for responseType json', async () => {
    const navios = clientFor(() => new Response('', { status: 200 }))

    const response = await navios.post('/items')

    expect(response.status).toBe(200)
    expect(response.data).toBeUndefined()
  })

  it('should still parse a JSON body', async () => {
    const navios = clientFor(() => Response.json({ a: 1 }))

    expect((await navios.get('/items')).data).toEqual({ a: 1 })
  })

  it('should reject a 2xx with an unparsable body with an error that carries the response', async () => {
    const navios = clientFor(
      () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    )

    const error = await navios.get('/items').catch((err) => err)

    expect(error).toBeInstanceOf(HttpClientError)
    expect(error.response.status).toBe(200)
    expect(error.response.data).toBe('<html>')
    expect(error.response.headers.get('content-type')).toBe('text/html')
    expect(error.cause).toBeInstanceOf(SyntaxError)
  })

  it('should keep the status of an error response with an empty JSON body', async () => {
    const navios = clientFor(
      () => new Response('', { status: 500, headers: { 'content-type': 'application/json' } }),
    )

    const error = await navios.get('/items').catch((err) => err)

    expect(error).toBeInstanceOf(HttpClientError)
    expect(error.response.status).toBe(500)
    expect(error.response.data).toBeUndefined()
  })

  it('should keep the raw text of an error response whose JSON body is malformed', async () => {
    const navios = clientFor(
      () => new Response('{oops', { status: 502, headers: { 'content-type': 'application/json' } }),
    )

    const error = await navios.get('/items').catch((err) => err)

    expect(error).toBeInstanceOf(HttpClientError)
    expect(error.response.status).toBe(502)
    expect(error.response.data).toBe('{oops')
  })

  it('should not fail a text response that claims to be JSON but is not', async () => {
    const navios = clientFor(
      () => new Response('', { status: 200, headers: { 'content-type': 'application/json' } }),
    )

    const response = await navios.get('/items', { responseType: 'text' })

    expect(response.data).toBe('')
  })

  it.each([
    'application/problem+json',
    'application/problem+json; charset=utf-8',
    'application/vnd.api+json',
    'Application/JSON',
  ])('should parse an error body sent as %s', async (contentType) => {
    const navios = clientFor(
      () =>
        new Response('{"title":"Not Found"}', {
          status: 404,
          headers: { 'content-type': contentType },
        }),
    )

    const error = await navios.get('/items').catch((err) => err)

    expect(error.response.data).toEqual({ title: 'Not Found' })
  })

  it.each(['text/plain', 'application/jsonlines', 'text/json-like'])(
    'should keep an error body sent as %s as text',
    async (contentType) => {
      const navios = clientFor(
        () => new Response('{"a":1}', { status: 400, headers: { 'content-type': contentType } }),
      )

      const error = await navios.get('/items').catch((err) => err)

      expect(error.response.data).toBe('{"a":1}')
    },
  )

  it('should not parse JSON for responseType text', async () => {
    const navios = clientFor(() => Response.json({ a: 1 }))

    expect((await navios.get('/items', { responseType: 'text' })).data).toBe('{"a":1}')
  })

  describe('a body that breaks off', () => {
    function brokenBody(reason: unknown, status: number) {
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"a":'))
            controller.error(reason)
          },
        }),
        { status, headers: { 'content-type': 'application/json' } },
      )
    }

    it.each([
      ['json', 200],
      ['text', 200],
      ['blob', 200],
      ['json', 500],
    ] as const)('should be a failure without a response (%s, %i)', async (responseType, status) => {
      const navios = clientFor(() => brokenBody(new TypeError('terminated'), status))

      const error = await navios.get('/items', { responseType }).catch((err) => err)

      expect(error).toBeInstanceOf(HttpClientError)
      expect(error.response).toBeNull()
      expect(error.message).toBe('terminated')
    })

    it.each([
      ['an Error', new Error('navigated away'), 'navigated away'],
      ['a string', 'navigated away', 'navigated away'],
    ])('should be ERR_CANCELED when aborted with %s', async (_name, reason, message) => {
      const controller = new AbortController()
      const navios = clientFor(() => {
        controller.abort(reason)
        return brokenBody(reason, 200)
      })

      const error = await navios
        .get('/items', { signal: controller.signal })
        .catch((err: unknown) => err)

      expect(error).toMatchObject({ response: null, code: 'ERR_CANCELED', message })
    })
  })

  it('should read responses of a fetch implementation that is not the global one', async () => {
    // Like undici's own Response: the same interface, another class
    const foreign = (response: Response) => ({
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      text: () => response.text(),
    })
    const navios = clientFor(
      () => foreign(Response.json({ code: 'X' }, { status: 409 })) as unknown as Response,
    )

    const error = await navios.get('/items').catch((err) => err)

    expect(error.response.data).toEqual({ code: 'X' })
  })
})
