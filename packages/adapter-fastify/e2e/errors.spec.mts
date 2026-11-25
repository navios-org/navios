import { connect } from 'node:net'

import { Controller, handler, Module, NaviosFactory } from '@navios/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import type { NaviosApplication } from '@navios/server'

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
    expect((response.body as any).detail).toContain('payload of invalid type')
    expect(logger.error).toHaveBeenCalledTimes(1)
    expect(logger.error.mock.calls[0][0]).toBe('Unhandled error')
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
