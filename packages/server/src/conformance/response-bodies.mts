import { registerInjectable } from '@navios/core'

import { registerController } from '../controllers/controller.mjs'
import { handler } from '../handlers/handler.mjs'

import type { RequestContext } from '../context/request-context.mjs'
import type { Interceptor } from '../routing/http-contracts.mjs'
import type { RouteResult } from '../routing/route-result.mjs'

import { s } from './schema.mjs'
import { endpoint, user } from './suite.mjs'

import type { ConformanceSuite } from './suite.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Response bodies other than a JSON object: text, streams, a JSON null, none,
 * and one that cannot be sent.
 * @internal
 */
export function defineResponseBodiesTopic(suite: ConformanceSuite) {
  const { it, expect, url, fetch } = suite

  class NotModifiedInterceptor implements Interceptor {
    async intercept(_ctx: RequestContext, next: () => Promise<RouteResult>) {
      return { ...(await next()), status: 304 }
    }
  }
  registerInjectable(NotModifiedInterceptor)

  class ResponseBodiesController {
    text = handler(endpoint({ method: 'GET', url: '/text', response: 'text' }), () => 'plain text')

    stream = handler(
      endpoint({ method: 'GET', url: '/stream', response: 'stream' }),
      async function* () {
        yield 'chunk-1;'
        yield 'chunk-2;'
      },
    )

    webStream = handler(
      endpoint({ method: 'GET', url: '/web-stream', response: 'stream' }),
      () =>
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('web-stream'))
            controller.close()
          },
        }),
    )

    nullable = handler(
      endpoint({ method: 'GET', url: '/nullable', responseSchema: s.nullable(user) }),
      () => null,
    )

    nothing = handler(endpoint({ method: 'GET', url: '/nothing' }), () => undefined)

    notModified = handler(
      endpoint({ method: 'GET', url: '/not-modified' }),
      { interceptors: [NotModifiedInterceptor] },
      () => ({ a: 1 }),
    )

    unsupportedText = handler(
      endpoint({ method: 'GET', url: '/unsupported/number', response: 'text' }),
      () => 12 as any,
    )
  }
  registerController(ResponseBodiesController, { attributes: [suite.Public()] })

  return {
    controllers: [ResponseBodiesController],
    tests() {
      it('sends text and streams', async () => {
        const text = await fetch(url('/text'))
        expect(text.headers.get('content-type')).toContain('text/plain')
        expect(await text.text()).toBe('plain text')

        expect(await (await fetch(url('/stream'))).text()).toBe('chunk-1;chunk-2;')
        expect(await (await fetch(url('/web-stream'))).text()).toBe('web-stream')
      })

      it('sends a JSON null as a body', async () => {
        const response = await fetch(url('/nullable'))
        expect(response.status).toBe(200)
        expect(response.headers.get('content-type')).toContain('application/json')
        expect(await response.text()).toBe('null')
      })

      it('sends no body and no content type for an undefined JSON result', async () => {
        const response = await fetch(url('/nothing'))
        expect(response.status).toBe(200)
        expect(response.headers.has('content-type')).toBe(false)
        expect(await response.text()).toBe('')
      })

      it('sends no body and no content type with a status that has none', async () => {
        const response = await fetch(url('/not-modified'))
        expect(response.status).toBe(304)
        expect(response.headers.has('content-type')).toBe(false)
        expect(await response.text()).toBe('')
      })

      it('answers 500 problem+json for a body it cannot send', async () => {
        for (const path of ['/unsupported/number']) {
          const response = await fetch(url(path))
          expect(response.status).toBe(500)
          expect(response.headers.get('content-type')).toContain('application/problem+json')
        }
      })
    },
  }
}
