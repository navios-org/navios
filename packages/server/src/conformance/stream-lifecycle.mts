import { connect } from 'node:net'

import { registerModule } from '@navios/core'
import { inject, InjectableScope, registerInjectable } from '@navios/di'

import { NaviosFactory } from '../application/navios-factory.mjs'
import { registerController } from '../controllers/controller.mjs'
import { NotFoundException } from '../errors/http-exception.mjs'
import { handler } from '../handlers/handler.mjs'
import { sseStream } from '../sse/sse-stream.mjs'

import type { RequestContext } from '../context/request-context.mjs'

import { endpoint } from './suite.mjs'

import type { ConformanceSuite } from './suite.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/** More than the buffers of a connection hold. */
const UNREAD_TOTAL = 64 * 1024 * 1024
const UNREAD_CHUNK = 64 * 1024

/**
 * Bodies that are produced while they are sent: whatever becomes of the
 * response, what produces them is closed, and before the request scope is.
 * @internal
 */
export function defineStreamLifecycleTopic(suite: ConformanceSuite) {
  const { it, expect, url, waitFor, pause, events } = suite

  class Transaction {
    open = true
    onServiceDestroy() {
      this.open = false
      events.push('transaction:destroy')
    }
  }
  registerInjectable(Transaction, { scope: InjectableScope.Request })

  /** What the handler of `/unread` has produced. */
  let unreadBytes = 0
  let gone = false
  /** Lets the client go away before the handler answers. */
  const afterClientLeft = async () => {
    events.push('late:start')
    await waitFor(() => gone)
    await pause(20)
  }
  const endless = async function* (name: string, value: unknown): AsyncGenerator<any> {
    try {
      for (;;) {
        events.push(`${name}:pull`)
        yield value
        await pause(5)
      }
    } finally {
      events.push(`${name}:finally`)
    }
  }

  class StreamLifecycleController {
    lateGenerator = handler(
      endpoint({ method: 'GET', url: '/late/generator', response: 'stream' }),
      async function* () {
        try {
          await afterClientLeft()
          yield 'a'
          yield 'b'
        } finally {
          events.push('late:closed')
        }
      },
    )

    lateWebStream = handler(
      endpoint({ method: 'GET', url: '/late/web-stream', response: 'stream' }),
      async () => {
        await afterClientLeft()
        return new ReadableStream({
          pull(controller) {
            controller.enqueue(new TextEncoder().encode('a'))
          },
          cancel() {
            events.push('late:closed')
          },
        })
      },
    )

    lateEvents = handler(
      endpoint({ method: 'GET', url: '/late/events', response: 'stream' }),
      async () => {
        await afterClientLeft()
        // A source that has subscribed to something when it is created.
        return sseStream({
          [Symbol.asyncIterator]() {
            return this
          },
          next: async () => ({ done: false, value: { data: 'a' } }),
          return: async () => {
            events.push('late:closed')
            return { done: true, value: undefined }
          },
        } as AsyncIterableIterator<{ data: string }>)
      },
    )

    endlessGenerator = handler(
      endpoint({ method: 'GET', url: '/endless/generator', response: 'stream' }),
      () => endless('generator', 'x'.repeat(1000)),
    )

    endlessEvents = handler(
      endpoint({ method: 'GET', url: '/endless/events', response: 'stream' }),
      (_params: any, ctx: RequestContext) => {
        ctx.use(Transaction)
        return sseStream(endless('events', { data: 'x' }))
      },
    )

    endlessWebStream = handler(
      endpoint({ method: 'GET', url: '/endless/web-stream', response: 'stream' }),
      () =>
        new ReadableStream(
          {
            async pull(controller) {
              events.push('web-stream:pull')
              await pause(5)
              controller.enqueue(new TextEncoder().encode('x'))
            },
            cancel() {
              events.push('web-stream:finally')
            },
          },
          { highWaterMark: 0 },
        ),
    )

    sequential = handler(
      endpoint({ method: 'GET', url: '/sequential', response: 'stream' }),
      () => {
        let left = 60
        let pending = 0
        return {
          [Symbol.asyncIterator]() {
            return this
          },
          async next() {
            pending++
            events.push(`pending:${pending}`)
            // Some are there at once, others are waited for. Together they are
            // more than is sent at once.
            await (left % 3 === 0 ? pause(2) : undefined)
            pending--
            return left-- > 0
              ? { done: false, value: 'x'.repeat(5000) }
              : { done: true, value: undefined }
          },
        }
      },
    )

    unread = handler(
      endpoint({ method: 'GET', url: '/unread', response: 'stream' }),
      async function* () {
        const chunk = new Uint8Array(UNREAD_CHUNK)
        try {
          for (let sent = 0; sent < UNREAD_TOTAL; sent += UNREAD_CHUNK) {
            unreadBytes += UNREAD_CHUNK
            yield chunk
          }
        } finally {
          events.push('unread:finally')
        }
      },
    )

    halting = handler(
      endpoint({ method: 'GET', url: '/halting', response: 'stream' }),
      async function* () {
        yield 'one'
        await waitFor(() => events.includes('halting:go'))
        yield 'two'
      },
    )

    idleEvents = handler(endpoint({ method: 'GET', url: '/idle/events', response: 'stream' }), () =>
      sseStream(
        (async function* () {
          await waitFor(() => events.includes('idle:go'))
          yield { data: 'x' }
        })(),
      ),
    )

    /** A generator that says itself that it is an event stream. */
    idleOwnEvents = handler(
      endpoint({ method: 'GET', url: '/idle/own-events', response: 'stream' }),
      async function* (_params: any, ctx: RequestContext) {
        ctx.reply.header('content-type', 'text/event-stream')
        await waitFor(() => events.includes('idle:go'))
        yield 'data: x\n\n'
      },
    )

    rollback = handler(
      endpoint({ method: 'GET', url: '/rollback', response: 'stream' }),
      async function* (_params: any, ctx: RequestContext) {
        const transaction = ctx.use(Transaction)
        ctx.onFinish(() => {
          events.push('finish')
        })
        try {
          for (;;) {
            yield 'x'
            await pause(5)
          }
        } finally {
          await pause(10)
          events.push(`rollback:open=${transaction.open}`)
        }
      },
    )

    missing = handler(
      endpoint({ method: 'GET', url: '/missing-stream', response: 'stream' }),
      () =>
        new ReadableStream(
          {
            async pull() {
              await pause(5)
              throw new NotFoundException('no such file')
            },
          },
          { highWaterMark: 0 },
        ),
    )

    failing = handler(
      endpoint({ method: 'GET', url: '/failing-stream', response: 'stream' }),
      async function* () {
        yield 'one'
        await pause(20)
        throw new Error('the source failed')
      },
    )

    failingEvents = handler(
      endpoint({ method: 'GET', url: '/failing-events', response: 'stream' }),
      () =>
        sseStream(
          // oxlint-disable-next-line require-yield
          (async function* (): AsyncGenerator<{ data: string }> {
            throw new Error('the source failed')
          })(),
        ),
    )
  }
  registerController(StreamLifecycleController, { attributes: [suite.Public()] })

  return {
    controllers: [StreamLifecycleController],
    tests() {
      for (const name of ['generator', 'web-stream', 'events']) {
        it(`closes a stream whose client left before its first chunk: ${name}`, async () => {
          events.length = 0
          gone = false
          const controller = new AbortController()
          const pending = fetch(url(`/late/${name}`), { signal: controller.signal }).catch(
            () => null,
          )
          await waitFor(() => events.includes('late:start'))
          controller.abort()
          await pending
          await pause(20)
          gone = true
          await waitFor(() => events.includes('late:closed'))
          expect(events).toEqual(['late:start', 'late:closed'])
        })
      }

      for (const name of ['generator', 'events', 'web-stream']) {
        it(`answers HEAD on an endless stream and closes it: ${name}`, async () => {
          events.length = 0
          const response = await fetch(url(`/endless/${name}`), { method: 'HEAD' })
          expect(response.status).toBe(200)
          expect(response.headers.get('content-type')).toContain(
            name === 'events' ? 'text/event-stream' : 'application/octet-stream',
          )
          expect(await response.text()).toBe('')
          // Events that nobody reads are not produced at all.
          await waitFor(() => name === 'events' || events.includes(`${name}:finally`))
          await pause(50)
          const pulls = events.filter((event) => event.endsWith(':pull')).length
          await pause(50)
          expect(events.filter((event) => event.endsWith(':pull')).length).toBe(pulls)
          expect(pulls < 5).toBe(true)
        })
      }

      it('asks for a chunk once it has the one before', async () => {
        events.length = 0
        const response = await fetch(url('/sequential'))
        expect(await response.text()).toBe('x'.repeat(60 * 5000))
        expect([...new Set(events)]).toEqual(['pending:1'])
      })

      it('sends a chunk when it has been produced', async () => {
        events.length = 0
        const response = await fetch(url('/halting'))
        const reader = response.body!.getReader()
        const first = await Promise.race([reader.read(), pause(500)])
        events.push('halting:go')
        expect(new TextDecoder().decode(first?.value)).toBe('one')
        expect(new TextDecoder().decode((await reader.read()).value)).toBe('two')
        expect((await reader.read()).done).toBe(true)
      })

      if (suite.isServed) {
        it('produces no more than a client that does not read has room for', async () => {
          events.length = 0
          unreadBytes = 0
          // Not `fetch`, which may read ahead of whoever reads its response.
          const { hostname, port, pathname, host } = new URL(url('/unread'))
          const socket = connect(Number(port), hostname)
          try {
            socket.on('error', () => {})
            socket.pause()
            socket.write(`GET ${pathname} HTTP/1.1\r\nHost: ${host}\r\n\r\n`)
            await waitFor(() => unreadBytes > 0)
            let before: number
            do {
              before = unreadBytes
              await pause(100)
            } while (unreadBytes !== before)
            expect(unreadBytes > 0).toBe(true)
            // The connection has buffers of some megabytes.
            expect(unreadBytes < UNREAD_TOTAL / 2).toBe(true)
            expect(events).toEqual([])
          } finally {
            socket.destroy()
          }
          await waitFor(() => events.includes('unread:finally'))
          expect(events).toEqual(['unread:finally'])
        })
      }

      it('sends the headers of an event stream before its first event', async () => {
        events.length = 0
        const response = await Promise.race([fetch(url('/idle/events')), pause(500)])
        events.push('idle:go')
        expect(response?.status).toBe(200)
        expect(response!.headers.get('content-type')).toBe('text/event-stream')
        // A server may have to send a comment for it.
        expect((await response!.text()).replace(/^:\n\n/, '')).toBe('data: x\n\n')
      })

      it('sends the headers of a stream that declares itself an event stream at once', async () => {
        events.length = 0
        const response = await Promise.race([fetch(url('/idle/own-events')), pause(500)])
        events.push('idle:go')
        expect(response?.status).toBe(200)
        expect(response!.headers.get('content-type')).toBe('text/event-stream')
        expect((await response!.text()).replace(/^:\n\n/, '')).toBe('data: x\n\n')
      })

      it('keeps the scope of a request until its stream has been closed', async () => {
        events.length = 0
        const controller = new AbortController()
        const response = await fetch(url('/rollback'), { signal: controller.signal })
        await response.body!.getReader().read()
        controller.abort()
        await waitFor(() => events.includes('transaction:destroy'))
        expect(events).toEqual(['rollback:open=true', 'finish', 'transaction:destroy'])
      })

      it('answers an error of a stream before its first chunk with an error response', async () => {
        const response = await fetch(url('/missing-stream'))
        expect(response.status).toBe(404)
        expect(response.headers.get('content-type')).toContain('application/problem+json')
        expect((await response.json()).detail).toBe('no such file')
      })

      it('ends a stream that fails so that the client sees a failure', async () => {
        const outcome = await fetch(url('/failing-stream'))
          .then((response) => response.text())
          .catch(() => 'failed')
        expect(outcome).toBe('failed')
      })

      it('does not answer an error of an event source with an error response', async () => {
        const outcome = await fetch(url('/failing-events')).then(
          async (response) => {
            expect(response.status).toBe(200)
            return response.text().catch(() => 'failed')
          },
          () => 'failed',
        )
        expect(outcome).toBe('failed')
      })

      it('releases a request before the container when closing is forced', async () => {
        events.length = 0
        const order: string[] = []
        class Pool {
          onServiceDestroy() {
            order.push('container')
          }
        }
        registerInjectable(Pool)
        class Lease {
          readonly pool = inject(Pool)
          onServiceDestroy() {
            order.push('scope')
          }
        }
        registerInjectable(Lease, { scope: InjectableScope.Request })
        let held = 0
        class ForcedCloseController {
          stream = handler(
            endpoint({ method: 'GET', url: '/stream', response: 'stream' }),
            async function* (_params: any, ctx: RequestContext) {
              ctx.use(Lease)
              ctx.onFinish(() => {
                order.push('finish')
              })
              held++
              try {
                for (;;) {
                  yield 'x'
                  await pause(5)
                }
              } finally {
                order.push('stream')
              }
            },
          )
        }
        registerController(ForcedCloseController)
        class ForcedCloseModule {}
        registerModule(ForcedCloseModule, { controllers: [ForcedCloseController] })

        const app = await NaviosFactory.create(ForcedCloseModule, {
          adapter: suite.options.adapter(),
          logger: false,
          requestScopedServices: 'allow',
          shutdownTimeout: 100,
        })
        const address = suite.local(await app.listen(suite.options.listenOptions))
        const response = await fetch(`${address}/stream`)
        const reader = response.body!.getReader()
        await reader.read()
        const ended = (async () => {
          while (!(await reader.read()).done) {
            // Reads until the connection is closed.
          }
        })().catch(() => {})
        expect(held).toBe(1)
        await app.close()
        order.push('closed')
        await ended
        expect(order).toEqual(['stream', 'finish', 'scope', 'container', 'closed'])
      })
    },
  }
}
