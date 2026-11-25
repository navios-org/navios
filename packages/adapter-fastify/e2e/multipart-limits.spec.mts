import { Controller, handler, Module, NaviosFactory } from '@navios/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import type { NaviosApplication } from '@navios/server'

import { defineFastifyEnvironment } from '../src/index.mjs'

import type { FastifyEnvironment } from '../src/index.mjs'

describe('fastify adapter: multipart limits', () => {
  let app: NaviosApplication<FastifyEnvironment>
  const logger = { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }

  beforeAll(async () => {
    @Controller()
    class UploadController {
      upload = handler(
        {
          config: {
            method: 'POST',
            url: '/upload',
            body: 'multipart',
            requestSchema: z.object({
              title: z.string().optional(),
              note: z.string().optional(),
              file: z.instanceof(File).optional(),
              other: z.instanceof(File).optional(),
            }),
            responseSchema: z.object({ size: z.number() }),
          },
        } as never,
        ({ data }: any) => ({ size: data.file?.size ?? 0 }),
      )
    }

    @Module({ controllers: [UploadController] })
    class AppModule {}

    app = await NaviosFactory.create(AppModule, {
      adapter: defineFastifyEnvironment({
        multipart: { limits: { fileSize: 16, files: 1, fields: 1, parts: 2, fieldSize: 8 } },
      }),
      logger,
    })
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    logger.error.mockClear()
  })

  const file = (size: number, name = 'a.txt') =>
    new File(['x'.repeat(size)], name, { type: 'text/plain' })

  const post = (fill: (form: FormData) => void) => {
    const form = new FormData()
    fill(form)
    return app.inject({ method: 'POST', url: '/upload', body: form })
  }

  const expectTooLarge = (response: Awaited<ReturnType<typeof post>>, detail: string): void => {
    expect(response.status).toBe(413)
    expect(response.headers['content-type']).toContain('application/problem+json')
    expect(response.body).toEqual({
      type: 'about:blank',
      title: 'Payload Too Large',
      status: 413,
      detail,
    })
    expect(logger.error).not.toHaveBeenCalled()
  }

  it('accepts an upload within the limits', async () => {
    const response = await post((form) => form.append('file', file(16)))
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ size: 16 })
  })

  it('answers 413 for a file over limits.fileSize', async () => {
    expectTooLarge(await post((form) => form.append('file', file(17))), 'request file too large')
  })

  it('answers 413 for more files than limits.files', async () => {
    expectTooLarge(
      await post((form) => {
        form.append('file', file(1))
        form.append('other', file(1, 'b.txt'))
      }),
      'reach files limit',
    )
  })

  it('answers 413 for more fields than limits.fields', async () => {
    expectTooLarge(
      await post((form) => {
        form.append('title', 'a')
        form.append('note', 'b')
      }),
      'reach fields limit',
    )
  })

  it('answers 413 for more parts than limits.parts', async () => {
    expectTooLarge(
      await post((form) => {
        form.append('title', 'a')
        form.append('file', file(1))
        form.append('other', file(1, 'b.txt'))
      }),
      'reach parts limit',
    )
  })

  it('answers 413 for a field value over limits.fieldSize', async () => {
    expectTooLarge(
      await post((form) => form.append('title', 'x'.repeat(9))),
      'request field too large',
    )
  })

  it('answers the 4xx status of other @fastify/multipart errors', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/upload',
      headers: { 'content-type': 'multipart/form-data; boundary=x' },
      body: '--x\r\ncontent-disposition: form-data; name="__proto__"\r\n\r\nv\r\n--x--\r\n',
    })
    expect(response.status).toBe(400)
    expect(response.headers['content-type']).toContain('application/problem+json')
  })
})
