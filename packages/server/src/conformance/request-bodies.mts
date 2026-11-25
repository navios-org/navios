import { registerController } from '../controllers/controller.mjs'
import { handler } from '../handlers/handler.mjs'

import { s } from './schema.mjs'
import { endpoint } from './suite.mjs'

import type { ConformanceSuite } from './suite.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Request bodies: multipart, and the size limit of a JSON, a text and a
 * multipart body.
 * @internal
 */
export function defineRequestBodiesTopic(suite: ConformanceSuite) {
  const { it, expect, url, json, options } = suite

  class RequestBodiesController {
    upload = handler(
      endpoint({
        method: 'POST',
        url: '/upload',
        body: 'multipart',
        requestSchema: s.object({ title: s.string(), file: s.file() }),
        responseSchema: s.object({ title: s.string(), filename: s.string(), size: s.number() }),
      }),
      async ({ data }: any) => ({
        title: data.title,
        filename: data.file.name,
        size: (await data.file.arrayBuffer()).byteLength,
      }),
    )

    echoText = handler(
      endpoint({
        method: 'POST',
        url: '/echo-text',
        requestSchema: s.string(),
        responseSchema: s.object({ length: s.number() }),
      }),
      ({ data }: any) => ({ length: data.length }),
    )
  }
  registerController(RequestBodiesController, { attributes: [suite.Public()] })

  return {
    controllers: [RequestBodiesController],
    tests() {
      it('parses multipart bodies into fields and files', async () => {
        const form = new FormData()
        form.append('title', 'report')
        form.append('file', new File(['hello world'], 'hello.txt', { type: 'text/plain' }))
        const response = await fetch(url('/upload'), { method: 'POST', body: form })
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ title: 'report', filename: 'hello.txt', size: 11 })
      })

      const { bodyLimit } = options
      if (bodyLimit !== undefined) {
        const tooLarge = async (response: Response) => {
          expect(response.status).toBe(413)
          expect(response.headers.get('content-type')).toContain('application/problem+json')
          const body = await response.json()
          expect(body.status).toBe(413)
          expect(body.title).toBe('Payload Too Large')
        }
        const text = (body: BodyInit, init: Record<string, unknown> = {}) =>
          fetch(url('/echo-text'), {
            method: 'POST',
            headers: { 'content-type': 'text/plain' },
            body,
            ...init,
          })
        const upload = (size: number) => {
          const form = new FormData()
          form.append('title', 'report')
          form.append('file', new File(['x'.repeat(size)], 'big.txt', { type: 'text/plain' }))
          return fetch(url('/upload'), { method: 'POST', body: form })
        }

        it('answers 413 problem+json for a JSON, a text and a multipart body over the limit', async () => {
          await tooLarge(await fetch(url('/users'), json({ name: 'x'.repeat(bodyLimit) })))
          await tooLarge(await text('x'.repeat(bodyLimit + 1)))
          await tooLarge(await upload(bodyLimit + 1))

          // A body within the limit is accepted.
          const half = Math.floor(bodyLimit / 2)
          expect((await fetch(url('/users'), json({ name: 'x'.repeat(half) }))).status).toBe(201)
          expect(await (await text('x'.repeat(bodyLimit))).json()).toEqual({ length: bodyLimit })
          expect((await upload(half)).status).toBe(200)
        })

        it('answers 413 problem+json for a body over the limit that declares no length', async () => {
          // A stream is sent with chunked transfer encoding, without content-length.
          const chunks = (size: number) =>
            new ReadableStream({
              start(controller) {
                const chunk = new TextEncoder().encode('x'.repeat(1024))
                for (let sent = 0; sent < size; sent += chunk.byteLength) {
                  controller.enqueue(chunk.subarray(0, Math.min(chunk.byteLength, size - sent)))
                }
                controller.close()
              },
            })
          await tooLarge(await text(chunks(bodyLimit + 1), { duplex: 'half' }))
          const accepted = await text(chunks(bodyLimit), { duplex: 'half' })
          expect(await accepted.json()).toEqual({ length: bodyLimit })
        })

        it('answers 413 problem+json for a body over the limit sent with inject()', async () => {
          const response = await suite.app.inject({
            method: 'POST',
            url: '/api/users',
            body: { name: 'x'.repeat(bodyLimit) },
          })
          expect(response.status).toBe(413)
          expect(response.headers['content-type']).toContain('application/problem+json')
          expect((response.body as { status: number }).status).toBe(413)
        })
      }
    },
  }
}
