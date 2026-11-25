import { registerController } from '../controllers/controller.mjs'
import { handler } from '../handlers/handler.mjs'

import { s } from './schema.mjs'
import { endpoint } from './suite.mjs'

import type { ConformanceSuite } from './suite.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The application object: `inject()` and `close()`.
 * @internal
 */
export function defineApplicationTopic(suite: ConformanceSuite) {
  const { it, expect, url } = suite
  let slowStarted: (() => void) | null = null
  let releaseSlow: (() => void) | null = null

  class ApplicationController {
    slow = handler(
      endpoint({ method: 'GET', url: '/slow', responseSchema: s.object({ done: s.boolean() }) }),
      async () => {
        slowStarted?.()
        await new Promise<void>((resolve) => {
          releaseSlow = resolve
        })
        return { done: true }
      },
    )
  }
  registerController(ApplicationController, { attributes: [suite.Public()] })

  return {
    controllers: [ApplicationController],
    tests() {
      it('handles a request in process with inject()', async () => {
        const response = await suite.app.inject({ method: 'GET', url: '/api/simple' })
        expect(response.status).toBe(200)
        expect(response.body).toEqual({ message: 'ok' })
      })

      it('waits for in-flight requests when closing', async () => {
        const started = new Promise<void>((resolve) => {
          slowStarted = resolve
        })
        const pending = fetch(url('/slow'))
        await started
        const closing = suite.app.close()
        setTimeout(() => releaseSlow?.(), 30)
        const response = await pending
        expect(await response.json()).toEqual({ done: true })
        // The client keeps its connection open; that must not hold up closing.
        const answered = Date.now()
        await closing
        expect(Date.now() - answered < 1000).toBe(true)
      })
    },
  }
}
