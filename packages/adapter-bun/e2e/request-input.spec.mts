import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test'

import { handler, NaviosFactory, registerController, registerModule } from '@navios/server'

import type { NaviosApplication } from '@navios/server'

import { defineBunEnvironment } from '../src/index.mjs'

import type { BunEnvironment } from '../src/index.mjs'

const anything = {
  '~standard': {
    version: 1 as const,
    vendor: 'test',
    validate: (value: unknown) => ({ value }),
  },
}

describe('bun adapter: request input', () => {
  let app: NaviosApplication<BunEnvironment>
  let base: string
  const logger = { log: mock(), error: mock(), warn: mock(), debug: mock() }

  beforeAll(async () => {
    class InputController {
      query = handler({ config: { method: 'GET', url: '/query' } } as any, (_: any, ctx: any) => ({
        entries: Object.entries(ctx.query),
        inherited: typeof ctx.query.toString,
      }))
      upload = handler(
        {
          config: { method: 'POST', url: '/upload', body: 'multipart', requestSchema: anything },
        } as any,
        ({ data }: any) => ({ keys: Object.keys(data) }),
      )
      user = handler({ config: { method: 'GET', url: '/users/$id' } } as any, (input: any) => ({
        id: input.urlParams.id,
      }))
    }
    registerController(InputController)
    class AppModule {}
    registerModule(AppModule, { controllers: [InputController] })

    app = await NaviosFactory.create(AppModule, { adapter: defineBunEnvironment(), logger })
    base = await app.listen({ port: 0, hostname: '127.0.0.1' })
  })

  afterAll(async () => {
    await app.close()
  })

  it('keeps query keys that are properties of Object.prototype as plain strings', async () => {
    const response = await fetch(
      `${base}/query?constructor=x&__proto__=y&toString=z&a=1&a=2&hasOwnProperty=1`,
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      entries: [
        ['constructor', 'x'],
        ['__proto__', 'y'],
        ['toString', 'z'],
        ['a', ['1', '2']],
        ['hasOwnProperty', '1'],
      ],
      inherited: 'string',
    })
    const plain = await fetch(`${base}/query?a=1`)
    expect(await plain.json()).toEqual({ entries: [['a', '1']], inherited: 'undefined' })
  })

  const upload = (contentType: string, body: string) =>
    fetch(`${base}/upload`, { method: 'POST', headers: { 'content-type': contentType }, body })

  it('answers 400 for a multipart body that cannot be parsed', async () => {
    logger.error.mockClear()
    for (const response of [
      await upload('multipart/form-data; boundary=xx', 'garbage'),
      await upload('multipart/form-data', 'garbage'),
      await upload('application/json', '{"a":1}'),
    ]) {
      expect(response.status).toBe(400)
      expect(response.headers.get('content-type')).toContain('application/problem+json')
      const body = (await response.json()) as any
      expect(JSON.stringify(body)).toContain('Malformed multipart body')
    }
    expect(logger.error).not.toHaveBeenCalled()

    const form = new FormData()
    form.append('title', 'a')
    const accepted = await fetch(`${base}/upload`, { method: 'POST', body: form })
    expect(await accepted.json()).toEqual({ keys: ['title'] })
  })

  it('inject() serves a url with malformed percent-encoding, as over HTTP', async () => {
    const overHttp = await fetch(`${base}/users/%E0%A4%A`)
    expect(overHttp.status).toBe(200)
    const injected = await app.inject({ method: 'GET', url: '/users/%E0%A4%A' })
    expect(injected.status).toBe(200)
    expect(typeof (injected.body as any).id).toBe('string')

    const decoded = await app.inject({ method: 'GET', url: '/users/a%20b%2Fc' })
    expect(decoded.body).toEqual({ id: 'a b/c' })
  })
})
