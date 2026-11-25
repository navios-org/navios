import { connect } from 'node:net'

import { registerModule } from '@navios/core'

import { NaviosFactory } from '../application/navios-factory.mjs'
import { registerController } from '../controllers/controller.mjs'
import { handler } from '../handlers/handler.mjs'

import type { NaviosApplication } from '../application/navios-application.mjs'

import { s } from './schema.mjs'
import { endpoint } from './suite.mjs'

import type { ConformanceSuite } from './suite.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Closing an application: what it waits for, and what it does not wait for.
 * @internal
 */
export function defineShutdownTopic(suite: ConformanceSuite) {
  const { it, expect, pause } = suite

  let started: () => void = () => {}

  class ShutdownController {
    simple = handler(endpoint({ method: 'GET', url: '/simple' }), () => ({ ok: true }))

    slow = handler(
      endpoint({ method: 'GET', url: '/slow', responseSchema: s.object({ done: s.boolean() }) }),
      async () => {
        started()
        await pause(150)
        return { done: true }
      },
    )

    stream = handler(
      endpoint({ method: 'GET', url: '/stream', response: 'stream' }),
      async function* () {
        started()
        for (let i = 0; i < 5; i++) {
          yield `chunk ${i};`
          await pause(30)
        }
      },
    )

    endless = handler(
      endpoint({ method: 'GET', url: '/endless', response: 'stream' }),
      async function* () {
        started()
        for (;;) {
          yield 'x'
          await pause(10)
        }
      },
    )
  }
  registerController(ShutdownController)
  class ShutdownModule {}
  registerModule(ShutdownModule, { controllers: [ShutdownController] })

  const SHUTDOWN_TIMEOUT = 3000

  const withApp = async (
    test: (app: NaviosApplication<any>, base: string, start: Promise<void>) => Promise<void>,
    shutdownTimeout = SHUTDOWN_TIMEOUT,
  ) => {
    const start = new Promise<void>((resolve) => {
      started = resolve
    })
    const app = await NaviosFactory.create(ShutdownModule, {
      adapter: suite.options.adapter(),
      logger: false,
      shutdownTimeout,
    })
    try {
      await test(app, suite.local(await app.listen(suite.options.listenOptions)), start)
    } finally {
      await app.close()
    }
  }

  const timeToClose = async (app: NaviosApplication<any>) => {
    const from = Date.now()
    await app.close()
    return Date.now() - from
  }

  return {
    tests() {
      it('does not wait for a connection on which no request was sent', async () => {
        await withApp(async (app, base) => {
          const { hostname, port } = new URL(base)
          const socket = connect(Number(port), hostname)
          socket.on('error', () => {})
          const closed = new Promise<void>((resolve) => socket.once('close', () => resolve()))
          await new Promise<void>((resolve) => socket.once('connect', () => resolve()))
          // The server has accepted it by the time it answers another client.
          await (await fetch(`${base}/simple`)).text()
          expect((await timeToClose(app)) < SHUTDOWN_TIMEOUT / 2).toBe(true)
          await closed
        })
      })

      it('answers a request that is in flight, and takes no other', async () => {
        await withApp(async (app, base, start) => {
          const pending = fetch(`${base}/slow`)
          await start
          const closing = timeToClose(app)
          await pause(20)
          const late = await fetch(`${base}/simple`, { headers: { connection: 'close' } }).then(
            (response) => response.status,
            () => 'refused',
          )
          expect(late).toBe('refused')
          expect(await (await pending).json()).toEqual({ done: true })
          expect((await closing) < SHUTDOWN_TIMEOUT / 2).toBe(true)
        })
      })

      it('sends a stream that is open to its end', async () => {
        await withApp(async (app, base, start) => {
          const pending = fetch(`${base}/stream`).then((response) => response.text())
          await start
          const closing = timeToClose(app)
          expect(await pending).toBe('chunk 0;chunk 1;chunk 2;chunk 3;chunk 4;')
          expect((await closing) < SHUTDOWN_TIMEOUT / 2).toBe(true)
        })
      })

      it('cuts a stream that outlives the timeout', async () => {
        await withApp(async (app, base, start) => {
          const pending = fetch(`${base}/endless`)
            .then((response) => response.text())
            .catch(() => 'failed')
          await start
          const took = await timeToClose(app)
          expect(took >= 90 && took < 1500).toBe(true)
          expect(await pending).toBe('failed')
        }, 100)
      })

      it('closes once, however often it is asked to', async () => {
        await withApp(async (app, base, start) => {
          const pending = fetch(`${base}/slow`)
          await start
          const closing = [app.close(), app.close()]
          expect(await (await pending).json()).toEqual({ done: true })
          await Promise.all(closing)
          await app.close()
        })
      })

      it('takes no request once it is closed', async () => {
        await withApp(async (app) => {
          await app.close()
          for (const use of [
            () => app.inject({ method: 'GET', url: '/simple' }),
            () => app.listen(suite.options.listenOptions),
          ]) {
            const outcome = await use().then(
              () => '',
              (error: Error) => error.message,
            )
            expect(outcome).toContain('The application is closed')
          }
        })
      })
    },
  }
}
