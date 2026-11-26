import { registerModule } from '@navios/core'

import { NaviosFactory } from '../application/navios-factory.mjs'
import { registerController } from '../controllers/controller.mjs'
import { ConflictException, ForbiddenException } from '../errors/http-exception.mjs'
import { handler } from '../handlers/handler.mjs'
import { sseStream } from '../sse/sse-stream.mjs'

import type { RequestContext } from '../context/request-context.mjs'

import { s } from './schema.mjs'
import { endpoint } from './suite.mjs'

import type { ConformanceCors } from './conformance-options.mjs'
import type { ConformanceSuite } from './suite.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

const ORIGINS = ['https://a.test', 'https://b.test']
const METHODS = ['GET', 'POST', 'PUT', 'DELETE']

/**
 * CORS for a list of origins, with credentials: what adapters have in common,
 * although each takes the options of its runtime.
 * @internal
 */
export function defineCorsTopic(suite: ConformanceSuite) {
  const { it, expect } = suite

  class CorsController {
    json = handler(endpoint({ method: 'GET', url: '/json' }), () => ({ ok: true }))

    put = handler(endpoint({ method: 'PUT', url: '/json' }), () => ({ ok: true }))

    body = handler(
      endpoint({ method: 'POST', url: '/body', requestSchema: s.object({ a: s.string() }) }),
      () => ({ ok: true }),
    )

    nothing = handler(endpoint({ method: 'GET', url: '/nothing', response: 'void' }), () => {})

    conflict = handler(endpoint({ method: 'GET', url: '/conflict' }), () => {
      throw new ConflictException('taken')
    })

    crash = handler(endpoint({ method: 'GET', url: '/crash' }), () => {
      throw new Error('unexpected')
    })

    stream = handler(
      endpoint({ method: 'GET', url: '/stream', response: 'stream' }),
      async function* () {
        yield 'a'
        yield 'b'
      },
    )

    events = handler(endpoint({ method: 'GET', url: '/events', response: 'stream' }), () =>
      sseStream(
        (async function* () {
          yield { data: 'a' }
        })(),
      ),
    )

    varied = handler(
      endpoint({ method: 'GET', url: '/varied' }),
      (_params: any, ctx: RequestContext) => {
        ctx.reply.header('vary', 'accept-language')
        return {}
      },
    )
  }
  registerController(CorsController)
  class CorsModule {}
  registerModule(CorsModule, { controllers: [CorsController] })

  const varies = (response: Response) =>
    (response.headers.get('vary') ?? '').split(',').map((name) => name.trim().toLowerCase())

  /** Runs `test` with a function that calls an application with CORS. */
  const withApp = async (
    test: (call: (path: string, init?: RequestInit) => Promise<Response>) => Promise<void>,
    origin: ConformanceCors['origin'] = ORIGINS,
  ) => {
    const app = await NaviosFactory.create(CorsModule, {
      adapter: suite.options.cors!({ origin, methods: METHODS, credentials: true }),
      logger: false,
    })
    try {
      const base = suite.local(await app.listen(suite.options.listenOptions))
      await test((path, init) => fetch(`${base}${path}`, init))
    } finally {
      await app.close()
    }
  }

  const preflight = (origin: string, method: string): RequestInit => ({
    method: 'OPTIONS',
    headers: {
      origin,
      'access-control-request-method': method,
      'access-control-request-headers': 'content-type,x-a',
    },
  })

  return {
    tests() {
      it('answers a preflight request of an allowed origin', async () => {
        await withApp(async (call) => {
          // Whether the path is served for the method is for the request itself.
          for (const path of ['/json', '/nowhere']) {
            for (const origin of ORIGINS) {
              const response = await call(path, preflight(origin, 'PUT'))
              expect(response.status).toBe(204)
              expect(await response.text()).toBe('')
              const { headers } = response
              expect(headers.get('access-control-allow-origin')).toBe(origin)
              expect(headers.get('access-control-allow-credentials')).toBe('true')
              const methods = headers.get('access-control-allow-methods')!
              expect(methods.split(',').map((name) => name.trim())).toEqual(METHODS)
              expect(headers.get('access-control-allow-headers')).toBe('content-type,x-a')
              expect(varies(response)).toContain('origin')
            }
          }
        })
      })

      it('does not allow a preflight request of another origin', async () => {
        await withApp(async (call) => {
          for (const origin of ['https://c.test', 'https://a.test.evil', 'http://a.test', 'null']) {
            const response = await call('/json', preflight(origin, 'PUT'))
            expect(response.headers.has('access-control-allow-origin')).toBe(false)
            expect(varies(response)).toContain('origin')
          }
        })
      })

      it('sends CORS headers with every response to an allowed origin', async () => {
        await withApp(async (call) => {
          const json = { 'content-type': 'application/json' }
          const cases: Array<[path: string, status: number, init?: RequestInit]> = [
            ['/json', 200],
            ['/json', 200, { method: 'PUT' }],
            ['/json', 200, { method: 'HEAD' }],
            ['/nothing', 204],
            ['/stream', 200],
            ['/stream', 200, { method: 'HEAD' }],
            ['/events', 200],
            ['/conflict', 409],
            ['/crash', 500],
            ['/nowhere', 404],
            ['/json', 405, { method: 'DELETE' }],
            ['/body', 400, { method: 'POST', headers: json, body: '{' }],
            ['/body', 415, { method: 'POST', headers: { 'content-type': 'image/png' }, body: 'x' }],
          ]
          for (const [path, status, init] of cases) {
            const headers = { ...(init?.headers as object), origin: 'https://b.test' }
            const response = await call(path, { ...init, headers })
            await response.text()
            expect(response.status).toBe(status)
            expect(response.headers.get('access-control-allow-origin')).toBe('https://b.test')
            expect(response.headers.get('access-control-allow-credentials')).toBe('true')
            expect(varies(response)).toContain('origin')
          }
        })
      })

      it('answers another origin, and a request without one, without allowing it', async () => {
        await withApp(async (call) => {
          for (const headers of [{ origin: 'https://c.test' }, {}] as HeadersInit[]) {
            for (const [path, status] of [
              ['/json', 200],
              ['/stream', 200],
              ['/crash', 500],
              ['/nowhere', 404],
            ] as const) {
              const response = await call(path, { headers })
              await response.text()
              expect(response.status).toBe(status)
              expect(response.headers.has('access-control-allow-origin')).toBe(false)
              // A cache must not serve it to an allowed origin.
              expect(varies(response)).toContain('origin')
            }
          }
        })
      })

      it('answers an HttpException that an origin function fails with as it is', async () => {
        await withApp(
          async (call) => {
            for (const init of [{}, preflight('https://banned.test', 'PUT')]) {
              const headers = { ...(init as RequestInit).headers, origin: 'https://banned.test' }
              const response = await call('/json', { ...init, headers })
              expect(response.status).toBe(403)
              expect(response.headers.get('content-type')).toContain('application/problem+json')
              expect((await response.json()).detail).toBe('banned')
            }
            const allowed = await call('/json', { headers: { origin: 'https://a.test' } })
            expect(allowed.status).toBe(200)
            expect(allowed.headers.get('access-control-allow-origin')).toBe('https://a.test')
          },
          (origin, callback) => {
            if (origin === 'https://banned.test') {
              callback(new ForbiddenException('banned'), false)
            } else {
              callback(null, origin !== undefined && ORIGINS.includes(origin))
            }
          },
        )
      })

      it('keeps what a handler says the response varies by', async () => {
        await withApp(async (call) => {
          const response = await call('/varied', { headers: { origin: 'https://a.test' } })
          expect(varies(response)).toContain('accept-language')
          expect(varies(response)).toContain('origin')
        })
      })
    },
  }
}
