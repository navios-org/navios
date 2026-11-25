import { connect } from 'node:net'

import multipart from '@fastify/multipart'
import { handler, NaviosFactory, registerController, registerModule } from '@navios/server'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import type { NaviosApplication, RequestContext } from '@navios/server'
import type { FastifyInstance } from 'fastify'

import { defineFastifyEnvironment } from '../src/index.mjs'

import type { FastifyAdapterOptions, FastifyEnvironment } from '../src/index.mjs'

const endpoint = (config: object) => ({ config }) as any

describe('fastify adapter: request bodies', () => {
  let app: NaviosApplication<FastifyEnvironment>

  afterEach(async () => {
    await app.close()
  })

  async function start(options: FastifyAdapterOptions) {
    class BodiesController {
      any = handler(
        endpoint({ method: 'POST', url: '/any', requestSchema: z.any() }),
        ({ data }: any) => ({ data: data ?? null }),
      )
      raw = handler(
        endpoint({ method: 'POST', url: '/raw' }),
        async (_params: any, ctx: RequestContext) => ({ length: (await ctx.rawBody()).byteLength }),
      )
      upload = handler(
        endpoint({ method: 'POST', url: '/upload', body: 'multipart', requestSchema: z.any() }),
        ({ data }: any) => ({
          keys: Object.keys(data),
          sizes: Object.values(data)
            .flat()
            .map((value: any) => value.size ?? value.length),
        }),
      )
      late = handler(
        endpoint({ method: 'POST', url: '/late', body: 'multipart', requestSchema: z.any() }),
        async (_params: any, ctx: RequestContext) =>
          ctx.rawBody().then(
            () => ({ error: null }),
            (error) => ({ error: error.message }),
          ),
      )
      where = handler(endpoint({ method: 'GET', url: '/where' }), (_params: any, ctx: any) => ({
        ip: ctx.ip ?? null,
        origin: ctx.url.origin,
      }))
    }
    registerController(BodiesController)
    class AppModule {}
    registerModule(AppModule, { controllers: [BodiesController] })
    app = await NaviosFactory.create(AppModule, {
      adapter: defineFastifyEnvironment({ multipart: true, ...options }),
      logger: false,
    })
    await app.init()
  }

  const post = (url: string, body: unknown, contentType?: string) =>
    app.inject({
      method: 'POST',
      url,
      body,
      headers: contentType === undefined ? {} : { 'content-type': contentType },
    })

  it('leaves a content type to a parser that configure has added', async () => {
    const parser = (_request: unknown, body: Buffer, done: any) => {
      done(null, { parsed: body.toString() })
    }
    const configure = (server: FastifyInstance) => {
      for (const type of ['application/json', 'application/x-thing']) {
        server.addContentTypeParser(type, { parseAs: 'buffer' }, parser)
      }
    }
    await start({ configure })
    expect((await post('/any', '[1]', 'application/json')).body).toEqual({
      data: { parsed: '[1]' },
    })
    expect((await post('/any', 'x', 'application/x-thing')).body).toEqual({ data: { parsed: 'x' } })
    expect((await post('/any', '{"a":1}', 'application/vnd.x+json')).body).toEqual({
      data: { a: 1 },
    })
    expect((await post('/any', 'x', 'application/xml')).status).toBe(415)

    // Its bytes are gone: that is said, and nothing else is taken for them.
    expect((await post('/raw', '[1]', 'application/json')).status).toBe(500)
    expect((await post('/raw', '[1]', 'application/xml')).body).toEqual({ length: 3 })
  })

  it('leaves it to a parser of a plugin that was not awaited, and to one for any type', async () => {
    await start({
      configure: (server) => {
        // As `fastify-plugin` marks it: for the instance itself.
        const plugin = Object.assign(
          async (instance: FastifyInstance) => {
            instance.addContentTypeParser('*', (_request, payload, done) => {
              payload.resume()
              done(null, 'anything')
            })
          },
          { [Symbol.for('skip-override')]: true },
        )
        void server.register(plugin)
      },
    })
    expect((await post('/any', 'x', 'application/xml')).body).toEqual({ data: 'anything' })
    expect((await post('/any', '{"a":1}', 'application/json')).body).toEqual({ data: { a: 1 } })
  })

  it('takes a body that a hook has set', async () => {
    await start({
      configure: (server) => {
        server.addHook('preHandler', async (request) => {
          // Until it is decoded, a body is its bytes.
          request.body = { hooked: Buffer.isBuffer(request.body) }
        })
      },
    })
    expect((await post('/any', '{"a":1}', 'application/json')).body).toEqual({
      data: { hooked: true },
    })
  })

  it('serves a multipart route with a plugin that was registered without awaiting it', async () => {
    await start({
      multipart: undefined,
      configure: (server) => {
        void server.register(multipart)
      },
    })
    const form = new FormData()
    form.append('title', 'x')
    expect((await post('/upload', form)).body).toEqual({ keys: ['title'], sizes: [1] })
  })

  it('refuses options that take the parts of a body from the adapter', async () => {
    for (const name of ['attachFieldsToBody', 'onFile', 'sharedSchemaId']) {
      await expect(start({ multipart: { [name]: true } as object })).rejects.toThrow(
        `The multipart option ${name} cannot be used`,
      )
    }
    // @ts-expect-error
    void ({ attachFieldsToBody: true } satisfies FastifyAdapterOptions['multipart'])
  })

  it('takes what such an option of a plugin of the application has made of a body', async () => {
    await start({
      multipart: undefined,
      configure: async (server) => {
        await server.register(multipart, { attachFieldsToBody: 'keyValues' })
      },
    })
    const form = new FormData()
    form.append('title', 'x')
    form.append('file', new File(['abc'], 'a.txt'))
    expect((await post('/upload', form)).body).toEqual({ keys: ['title', 'file'], sizes: [1, 3] })
  })

  it('takes a request without a body for one, whatever its content type says', async () => {
    await start({ multipart: true })
    const { port, hostname } = new URL(await app.listen({ port: 0, host: '127.0.0.1' }))
    const send = (...lines: string[]) =>
      new Promise<string>((resolve, reject) => {
        const socket = connect(Number(port), hostname)
        let text = ''
        socket.on('data', (chunk) => (text += chunk))
        socket.on('close', () => resolve(text))
        socket.on('error', reject)
        const head = ['Host: x', 'Connection: close', ...lines].join('\r\n')
        socket.write(`POST /any HTTP/1.1\r\n${head}\r\n\r\n`)
      })
    for (const type of ['multipart/form-data; boundary=x', 'application/json', 'text/plain']) {
      for (const length of [[], ['Content-Length: 0']]) {
        const text = await send(`Content-Type: ${type}`, ...length)
        expect(text, type).toContain(' 200 ')
        expect(text.endsWith('{"data":null}')).toBe(true)
      }
    }
  })

  const KB = 1024
  const form = (parts: number, size: number, asFiles = true) => {
    const data = new FormData()
    for (let i = 0; i < parts; i++) {
      const content = 'x'.repeat(size)
      data.append(`p${i}`, asFiles ? new File([content], `${i}.txt`) : content)
    }
    return data
  }

  it('limits all parts of a multipart body together', async () => {
    await start({ multipart: true, bodyLimit: 64 * KB })
    const base = await app.listen({ port: 0, host: '127.0.0.1' })
    const upload = (body: FormData) => fetch(`${base}/upload`, { method: 'POST', body })
    for (const asFiles of [true, false]) {
      expect((await upload(form(4, 16 * KB, asFiles))).status).toBe(200)
      const response = await upload(form(300, 16 * KB, asFiles))
      expect(response.status).toBe(413)
      expect(response.headers.get('content-type')).toContain('application/problem+json')
      // The connection goes on: what was left of the body has been dropped.
      expect((await upload(form(1, 1, asFiles))).status).toBe(200)
    }

    const raw = await fetch(`${base}/raw`, { method: 'POST', body: form(300, 16 * KB) })
    expect(raw.status).toBe(413)
    expect((await fetch(`${base}/raw`, { method: 'POST', body: form(1, KB) })).status).toBe(200)
  })

  it('counts a part that says it is JSON by its text', async () => {
    await start({ multipart: true, bodyLimit: 8 * KB })
    const part = `--x\r\ncontent-disposition: form-data; name="a"\r\ncontent-type: application/json\r\n\r\n`
    const send = (parts: number) =>
      post(
        '/upload',
        `${`${part}${JSON.stringify(['y'.repeat(KB)])}\r\n`.repeat(parts)}--x--\r\n`,
        'multipart/form-data; boundary=x',
      )
    expect((await send(2)).status).toBe(200)
    expect((await send(9)).status).toBe(413)
  })

  it('allows what the multipart limits allow on top', async () => {
    await start({
      multipart: { limits: { fileSize: 64 * KB, files: 3, fieldSize: 16 * KB, fields: 2 } },
      bodyLimit: 16 * KB,
    })
    expect((await post('/upload', form(3, 60 * KB))).status).toBe(200)
    expect((await post('/upload', form(2, 15 * KB, false))).status).toBe(200)
    // The limit of a JSON body stays what it is.
    expect((await post('/any', { a: 'x'.repeat(17 * KB) })).status).toBe(413)
  })

  it('says that the bytes of a multipart body are gone once it has been decoded', async () => {
    await start({ multipart: true })
    const response = await post('/late', form(1, 1))
    expect((response.body as any).error).toContain('POST /late has read the parts')
  })

  it('gives a test request the address that Fastify gives it, to hooks and plugins', async () => {
    const seen: string[] = []
    const configure = (server: FastifyInstance) => {
      server.addHook('onRequest', async (request) => {
        seen.push(request.ip)
      })
    }
    for (const trustProxy of [false, true, '127.0.0.1']) {
      await start({ configure, trustProxy })
      const ips = []
      for (const extra of [
        {},
        { remoteAddress: '127.0.0.1' },
        { headers: { 'x-forwarded-for': '203.0.113.7' } },
      ]) {
        const response = await app.inject({ method: 'GET', url: '/where', ...extra })
        ips.push((response.body as any).ip)
      }
      await app.inject({ method: 'POST', url: '/any', body: { a: 1 } })
      const forwarded = trustProxy === false ? '127.0.0.1' : '203.0.113.7'
      expect(seen).toEqual(['127.0.0.1', '127.0.0.1', forwarded, '127.0.0.1'])
      expect(ips).toEqual([null, '127.0.0.1', trustProxy === false ? null : '203.0.113.7'])
      seen.length = 0
      await app.close()
    }
  })

  it('knows the client and the origin as Fastify does', async () => {
    const forwarded = {
      method: 'GET',
      url: '/where',
      headers: {
        host: 'app.test:8080',
        'x-forwarded-for': '203.0.113.7',
        'x-forwarded-proto': 'https',
      },
    }
    await start({})
    expect((await app.inject({ ...forwarded, remoteAddress: '10.0.0.1' })).body).toEqual({
      ip: '10.0.0.1',
      origin: 'http://app.test:8080',
    })
    await app.close()
    await start({ trustProxy: true })
    expect((await app.inject(forwarded)).body).toEqual({
      ip: '203.0.113.7',
      origin: 'https://app.test:8080',
    })
  })
})
