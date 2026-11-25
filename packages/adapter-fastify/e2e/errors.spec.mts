import { connect } from 'node:net'
import { setTimeout as wait } from 'node:timers/promises'

import {
  Controller,
  handler,
  HttpException,
  Module,
  NaviosFactory,
  ValidationError,
} from '@navios/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import type { NaviosApplication, RequestContext } from '@navios/server'

import { defineFastifyEnvironment } from '../src/index.mjs'

import type { FastifyEnvironment } from '../src/index.mjs'

class HtmlError extends Error {}
class VendorJsonError extends Error {}

describe('fastify adapter: errors', () => {
  let app: NaviosApplication<FastifyEnvironment>
  let address: string
  const logger = { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }

  beforeAll(async () => {
    @Controller()
    class ErrorsController {
      html = handler({ config: { method: 'GET', url: '/html' } } as never, () => {
        throw new HtmlError()
      })
      vendorJson = handler({ config: { method: 'GET', url: '/vendor-json' } } as never, () => {
        throw new VendorJsonError()
      })
      notText = handler(
        { config: { method: 'GET', url: '/not-text', response: 'text' } } as never,
        () => 123 as never,
      )
      waiting = handler(
        { config: { method: 'GET', url: '/waiting' } } as never,
        (async (_params: unknown, ctx: RequestContext) => {
          await wait(5000, undefined, { signal: ctx.signal })
          return {}
        }) as never,
      )
      user = handler({ config: { method: 'GET', url: '/users/$id' } } as never, (input: any) => ({
        id: input.urlParams.id,
      }))
      upload = handler(
        {
          config: {
            method: 'POST',
            url: '/upload',
            body: 'multipart',
            requestSchema: z.object({ title: z.string().optional() }),
          },
        } as never,
        ({ data }: any) => ({ title: data.title ?? null }),
      )
    }

    @Module({ controllers: [ErrorsController] })
    class AppModule {}

    app = await NaviosFactory.create(AppModule, {
      adapter: defineFastifyEnvironment({ multipart: true }),
      exposeErrorDetails: true,
      logger,
    })
    app.mapError(HtmlError, () => ({
      status: 200,
      headers: { 'Content-Type': 'text/html' },
      body: '<b>hi</b>',
      kind: 'text',
    }))
    app.mapError(VendorJsonError, () => ({
      status: 409,
      headers: { 'Content-Type': 'application/vnd.api+json' },
      body: { errors: [] },
      kind: 'json',
    }))
    address = await app.listen({ port: 0, host: '127.0.0.1' })
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    logger.error.mockClear()
  })

  it('keeps a Content-Type header of a result whatever its case', async () => {
    const html = await app.inject({ method: 'GET', url: '/html' })
    expect(html.headers['content-type']).toBe('text/html')
    expect(html.text).toBe('<b>hi</b>')

    const json = await app.inject({ method: 'GET', url: '/vendor-json' })
    expect(json.status).toBe(409)
    expect(json.headers['content-type']).toContain('application/vnd.api+json')
  })

  it('answers a result that cannot be written through the error pipeline', async () => {
    const response = await app.inject({ method: 'GET', url: '/not-text' })
    expect(response.status).toBe(500)
    expect(response.headers['content-type']).toContain('application/problem+json')
    // `exposeErrorDetails` is an option of the pipeline.
    expect((response.body as any).detail).toContain('its body is a value of type number')
    expect(logger.error).toHaveBeenCalledTimes(1)
    expect(logger.error.mock.calls[0][0]).toBe('Unhandled error in GET /not-text')
  })

  it('answers 400 for a multipart body that cannot be parsed', async () => {
    const upload = (contentType: string, body: string) =>
      app.inject({ method: 'POST', url: '/upload', headers: { 'content-type': contentType }, body })
    for (const response of [
      await upload('multipart/form-data; boundary=xx', 'garbage'),
      await upload('multipart/form-data; boundary=xx', '--xx\r\ncontent-disposition: form-data'),
      await upload('multipart/form-data', 'garbage'),
    ]) {
      expect(response.status).toBe(400)
      expect(response.headers['content-type']).toContain('application/problem+json')
      expect(JSON.stringify(response.body)).toContain('Malformed multipart body')
    }
    expect(logger.error).not.toHaveBeenCalled()

    const form = new FormData()
    form.append('title', 'a')
    const accepted = await app.inject({ method: 'POST', url: '/upload', body: form })
    expect(accepted.body).toEqual({ title: 'a' })
  })

  const rawRequest = (path: string) =>
    new Promise<string>((resolve, reject) => {
      const { port, hostname } = new URL(address)
      const socket = connect(Number(port), hostname)
      let text = ''
      socket.on('data', (chunk) => (text += chunk))
      socket.on('close', () => resolve(text))
      socket.on('error', reject)
      socket.write(`GET ${path} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`)
    })

  it('does not report a handler that was stopped because its client had gone', async () => {
    const controller = new AbortController()
    const pending = fetch(`${address}/waiting`, { signal: controller.signal }).catch(() => null)
    await wait(50)
    controller.abort()
    await pending
    await wait(50)
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('answers the errors of the router as problem responses', async () => {
    const badUrl = await rawRequest('/users/%E0%A4%A')
    expect(badUrl).toMatch(/^HTTP\/1\.1 400 /)
    expect(badUrl.toLowerCase()).toContain('content-type: application/problem+json')
    expect(JSON.parse(badUrl.slice(badUrl.indexOf('\r\n\r\n') + 4))).toEqual({
      type: 'about:blank',
      title: 'Bad Request',
      status: 400,
      detail: "'/users/%E0%A4%A' is not a valid url component",
    })

    const longParam = await app.inject({ method: 'GET', url: `/users/${'a'.repeat(150)}` })
    expect(longParam.status).toBe(414)
    expect(longParam.headers['content-type']).toContain('application/problem+json')
    expect((longParam.body as any).status).toBe(414)
    expect(logger.error).not.toHaveBeenCalled()
  })
})

describe('fastify adapter: errors outside the pipeline', () => {
  let app: NaviosApplication<FastifyEnvironment>
  let address: URL
  const logger = { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }

  const raw = (request: string) =>
    new Promise<{ head: string; body: any }>((resolve, reject) => {
      const socket = connect(Number(address.port), address.hostname)
      let text = ''
      socket.on('data', (chunk) => (text += chunk))
      socket.on('close', () => {
        const [head, body] = text.split('\r\n\r\n')
        resolve({ head: head.toLowerCase(), body: JSON.parse(body) })
      })
      socket.on('error', reject)
      socket.write(request)
    })

  beforeAll(async () => {
    @Controller()
    class UserController {
      user = handler({ config: { method: 'GET', url: '/users/$id' } } as never, () => ({}))
    }
    @Module({ controllers: [UserController] })
    class AppModule {}

    app = await NaviosFactory.create(AppModule, {
      adapter: defineFastifyEnvironment({
        cors: {
          origin: async (origin?: string) => {
            if (origin === 'https://broken.test') {
              throw new Error('the origin check failed')
            }
            return ['https://a.test']
          },
          credentials: true,
        },
        configure: (server) => {
          server.addHook('onRequest', async (request) => {
            switch (request.headers['x-fail']) {
              case 'denied':
                throw new HttpException(403, { reason: 'blocked' })
              case 'busy':
                throw new HttpException(503, { retryAfter: 5 })
              case 'invalid':
                throw new ValidationError('headers', [{ message: 'no such header' }])
              case 'plugin':
                throw Object.assign(new Error('rate limited'), { statusCode: 429 })
              case 'overloaded':
                throw Object.assign(new Error('event loop'), { statusCode: 503 })
              case 'defect':
                throw new Error('a secret')
            }
          })
        },
      }),
      logger,
    })
    address = new URL(await app.listen({ port: 0, host: '127.0.0.1' }))
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    logger.error.mockClear()
  })

  it('keeps the status and the fields of an error that a hook throws', async () => {
    const fail = async (name: string) => {
      const { status, headers, body } = await app.inject({
        method: 'GET',
        url: '/users/1',
        headers: { 'x-fail': name },
      })
      expect(headers['content-type']).toContain('application/problem+json')
      return { ...(body as object), status }
    }
    expect(await fail('denied')).toMatchObject({ status: 403, reason: 'blocked' })
    expect(await fail('invalid')).toMatchObject({ status: 400, source: 'headers' })
    expect(await fail('plugin')).toMatchObject({ status: 429, detail: 'rate limited' })
    expect(logger.error).not.toHaveBeenCalled()

    expect(await fail('busy')).toMatchObject({ status: 503, retryAfter: 5 })
    const overloaded = await fail('overloaded')
    expect(overloaded).toMatchObject({ status: 503, title: 'Service Unavailable' })
    const defect = await fail('defect')
    expect(defect).toMatchObject({ status: 500, title: 'Internal Server Error' })
    expect(JSON.stringify([overloaded, defect])).not.toMatch(/event loop|secret/)
    expect(logger.error.mock.calls.map(([message]) => message)).toEqual(
      Array(3).fill('Unhandled error in GET /users/1'),
    )
  })

  it('sends CORS headers with an error of the router', async () => {
    for (const [path, status] of [
      ['/users/%E0%A4%A', 400],
      [`/users/${'a'.repeat(150)}`, 414],
    ] as const) {
      const request = (origin: string) =>
        raw(`GET ${path} HTTP/1.1\r\nhost: x\r\norigin: ${origin}\r\nconnection: close\r\n\r\n`)
      const allowed = await request('https://a.test')
      expect(allowed.body.status).toBe(status)
      expect(allowed.head).toContain('access-control-allow-origin: https://a.test')
      expect(allowed.head).toContain('access-control-allow-credentials: true')
      expect(allowed.head).toContain('vary: origin')
      const refused = await request('https://b.test')
      expect(refused.body.status).toBe(status)
      expect(refused.head).not.toContain('access-control-allow-origin')
      const broken = await request('https://broken.test')
      expect(broken.body.status).toBe(status)
      expect(broken.head).not.toContain('access-control-allow-origin')
    }
  })

  it('answers a request that Node cannot read with a problem response', async () => {
    const garbage = await raw('GARBAGE\r\n\r\n')
    expect(garbage.head).toMatch(/^http\/1.1 400 bad request/)
    expect(garbage.head).toContain('content-type: application/problem+json')
    expect(garbage.body).toEqual({ type: 'about:blank', title: 'Bad Request', status: 400 })

    const large = await raw(`GET / HTTP/1.1\r\nhost: x\r\nx-a: ${'a'.repeat(20_000)}\r\n\r\n`)
    expect(large.head).toMatch(/^http\/1.1 431 /)
    expect(large.body.status).toBe(431)
  })
})

describe('fastify adapter: a multipart part that is not complete', () => {
  it('leaves out a part without a name, and names a file without one', async () => {
    @Controller()
    class UploadController {
      upload = handler(
        {
          config: { method: 'POST', url: '/upload', body: 'multipart', requestSchema: z.any() },
        } as never,
        ({ data }: any) =>
          Object.entries(data).map(([key, value]) => [
            key,
            value instanceof File ? value.name : value,
          ]),
      )
    }
    @Module({ controllers: [UploadController] })
    class AppModule {}
    const app = await NaviosFactory.create(AppModule, {
      adapter: defineFastifyEnvironment({ multipart: true }),
      logger: false,
    })
    const part = (headers: string, value: string) => `--xx\r\n${headers}\r\n\r\n${value}\r\n`
    const response = await app.inject({
      method: 'POST',
      url: '/upload',
      headers: { 'content-type': 'multipart/form-data; boundary=xx' },
      body:
        part('content-disposition: form-data', 'a') +
        part('content-disposition: form-data; filename="a.txt"', 'b') +
        part('content-disposition: form-data; name="c"', 'c') +
        part('content-disposition: form-data; name="d"\r\ncontent-type: image/png', 'd') +
        part('content-disposition: form-data; name="e"; filename=""', 'e') +
        '--xx--\r\n',
    })
    expect(response.body).toEqual([
      ['c', 'c'],
      ['d', 'd'],
      ['e', ''],
    ])
    await app.close()
  })
})

describe('fastify adapter: a multipart route without the multipart option', () => {
  const create = async (options: Parameters<typeof defineFastifyEnvironment>[0]) => {
    @Controller()
    class UploadController {
      upload = handler(
        { config: { method: 'POST', url: '/files/upload', body: 'multipart' } } as never,
        () => ({ ok: true }),
      )
    }
    @Module({ controllers: [UploadController] })
    class AppModule {}
    const app = await NaviosFactory.create(AppModule, {
      adapter: defineFastifyEnvironment(options),
      logger: false,
    })
    try {
      await app.init()
    } finally {
      await app.close()
    }
  }

  it('fails at startup, naming the route and the option', async () => {
    await expect(create({})).rejects.toThrow(
      /\[Navios\] POST \/files\/upload has a multipart body.*multipart: true/s,
    )
  })

  it('accepts the option, and @fastify/multipart registered in configure', async () => {
    await create({ multipart: true })
    await create({
      configure: async (server) => {
        await server.register((await import('@fastify/multipart')).default)
      },
    })
  })
})
