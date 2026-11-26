import { describe, expect, it } from 'vitest'

import { HttpException } from '../errors/http-exception.mjs'
import { Cors, injectRequest, limitBody, toWebHeaders } from '../web/index.mjs'

const stream = (text: string, chunk = 4) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      const bytes = new TextEncoder().encode(text)
      for (let at = 0; at < bytes.length; at += chunk) {
        controller.enqueue(bytes.subarray(at, at + chunk))
      }
      controller.close()
    },
  })

const post = (text: string) =>
  new Request('http://app.example/items?a=1', {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: stream(text),
    duplex: 'half',
  } as RequestInit)

describe('limitBody', () => {
  it('lets a body of the limit through, whichever way it is read', async () => {
    for (const read of ['text', 'bytes', 'arrayBuffer', 'blob'] as const) {
      const request = post('0123456789')
      limitBody(request, 10)
      const body = await request[read]()
      const size =
        typeof body === 'string' ? body.length : 'size' in body ? body.size : body.byteLength
      expect(size).toBe(10)
      expect(request.bodyUsed).toBe(true)
    }
  })

  it('fails with a 413 when the body is one byte over the limit', async () => {
    const request = post('0123456789')
    limitBody(request, 9)
    const error = await request.text().catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(HttpException)
    expect((error as HttpException).statusCode).toBe(413)
  })

  it('counts what is read through the stream, and keeps the request as it is', async () => {
    const request = post('0123456789')
    limitBody(request, 9)
    expect(request.url).toBe('http://app.example/items?a=1')
    expect(request.headers.get('content-type')).toBe('text/plain')
    const reader = request.body!.getReader()
    const read = async () => {
      for (;;) {
        if ((await reader.read()).done) {
          return
        }
      }
    }
    await expect(read()).rejects.toBeInstanceOf(HttpException)
  })

  it('does not read a body that nobody asks for', () => {
    const request = post('0123456789')
    limitBody(request, 1)
    expect(request.bodyUsed).toBe(false)
  })
})

describe('toWebHeaders', () => {
  it('writes a list as one line per value', () => {
    const headers = toWebHeaders({
      'content-type': 'text/plain',
      'set-cookie': ['a=1', 'b=2'],
    })
    expect(headers.get('content-type')).toBe('text/plain')
    expect(headers.getSetCookie()).toEqual(['a=1', 'b=2'])
  })
})

describe('injectRequest', () => {
  it('hands over a web request and reads the response', async () => {
    const response = await injectRequest(
      { method: 'post', url: '/items?a=1', body: { name: 'one' } },
      async (request, path) =>
        Response.json({
          path,
          method: request.method,
          type: request.headers.get('content-type'),
          body: await request.json(),
        }),
    )
    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      path: '/items',
      method: 'POST',
      type: 'application/json',
      body: { name: 'one' },
    })
  })

  it('has no body for a HEAD, and rejects when the response fails', async () => {
    const head = await injectRequest({ method: 'HEAD', url: '/' }, () => new Response('text'))
    expect(head.text).toBe('')
    const failing = new ReadableStream({
      pull(controller) {
        controller.error(new Error('the source failed'))
      },
    })
    await expect(
      injectRequest({ method: 'GET', url: '/' }, () => new Response(failing)),
    ).rejects.toThrow('The response failed while it was being sent.')
  })
})

describe('Cors', () => {
  const from = (origin: string, init: RequestInit = {}) =>
    new Request('http://app.example/', { ...init, headers: { origin, ...init.headers } })

  it('allows the origins of a list, and varies the response by origin', async () => {
    const cors = new Cors({ origin: ['https://a.example', /\.b\.example$/], credentials: true })
    expect(await cors.check(from('https://a.example'))).toBe('https://a.example')
    expect(await cors.check(from('https://x.b.example'))).toBe('https://x.b.example')
    expect(await cors.check(from('https://c.example'))).toBeNull()
    expect(await cors.check(new Request('http://app.example/'))).toBeNull()

    const allowed = new Headers({ vary: 'Accept' })
    cors.apply(allowed, 'https://a.example')
    expect(allowed.get('access-control-allow-origin')).toBe('https://a.example')
    expect(allowed.get('access-control-allow-credentials')).toBe('true')
    expect(allowed.get('vary')).toBe('Accept, Origin')

    const refused = new Headers()
    cors.apply(refused, null)
    expect(refused.get('access-control-allow-origin')).toBeNull()
    expect(refused.get('vary')).toBe('Origin')
  })

  it('asks a function, which answers with a callback or a promise', async () => {
    const byCallback = new Cors({
      origin: (origin, callback) => callback(null, origin === 'https://a.example'),
    })
    expect(await byCallback.check(from('https://a.example'))).toBe('https://a.example')
    expect(await byCallback.check(from('https://c.example'))).toBeNull()
    const byPromise = new Cors({ origin: async () => '*' })
    expect(await byPromise.check(from('https://c.example'))).toBe('*')
    const failing = new Cors({ origin: (_origin, callback) => callback(new Error('no')) })
    await expect(failing.check(from('https://a.example'))).rejects.toThrow('no')
  })

  it('answers a preflight request', () => {
    const cors = new Cors({ origin: true, methods: ['GET', 'POST'], maxAge: 600 })
    const request = from('https://a.example', {
      method: 'OPTIONS',
      headers: {
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'x-one',
      },
    })
    expect(Cors.isPreflight(request)).toBe(true)
    expect(Cors.isPreflight(from('https://a.example', { method: 'OPTIONS' }))).toBe(false)
    const response = cors.preflight(request, 'https://a.example')
    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-methods')).toBe('GET, POST')
    expect(response.headers.get('access-control-allow-headers')).toBe('x-one')
    expect(response.headers.get('access-control-max-age')).toBe('600')
  })

  it('refuses credentials for any origin', () => {
    expect(() => new Cors({ credentials: true })).toThrow('needs an explicit origin')
  })
})
