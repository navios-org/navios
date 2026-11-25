import { registerController } from '../controllers/controller.mjs'
import { handler } from '../handlers/handler.mjs'

import { s } from './schema.mjs'
import { endpoint, user } from './suite.mjs'

import type { ConformanceSuite } from './suite.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Response bodies other than a JSON object: text, streams and a JSON null.
 * @internal
 */
export function defineResponseBodiesTopic(suite: ConformanceSuite) {
  const { it, expect, url } = suite

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
    },
  }
}
