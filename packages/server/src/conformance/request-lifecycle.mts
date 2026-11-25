import { InjectableScope, registerInjectable } from '@navios/di'

import { registerController } from '../controllers/controller.mjs'
import { handler } from '../handlers/handler.mjs'
import { sseStream } from '../sse/sse-stream.mjs'

import type { RequestContext } from '../context/request-context.mjs'

import { s } from './schema.mjs'
import { endpoint } from './suite.mjs'

import type { ConformanceSuite } from './suite.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * What happens around a request: its DI scope, `ctx.signal` when the client
 * disconnects, and the release of what a stream acquired.
 * @internal
 */
export function defineRequestLifecycleTopic(suite: ConformanceSuite) {
  const { it, expect, url, json, waitFor, pause, events } = suite

  class UnitOfWork {
    readonly id = Math.random()
    onServiceDestroy() {
      events.push('uow:destroy')
    }
  }
  registerInjectable(UnitOfWork, { scope: InjectableScope.Request })

  class RequestLifecycleController {
    scoped = handler(
      endpoint({
        method: 'GET',
        url: '/scoped',
        responseSchema: s.object({ same: s.boolean() }),
      }),
      (_params: any, ctx: RequestContext) => ({
        same: ctx.use(UnitOfWork) === ctx.use(UnitOfWork),
      }),
    )

    abortable = handler(
      endpoint({
        method: 'GET',
        url: '/abortable',
        responseSchema: s.object({ done: s.boolean() }),
      }),
      async (_params: any, ctx: RequestContext) => {
        ctx.use(UnitOfWork)
        events.push('abortable:start')
        await new Promise<void>((resolve) => {
          ctx.signal.addEventListener('abort', () => {
            events.push('abortable:aborted')
            resolve()
          })
        })
        throw new Error('client went away')
      },
    )

    signal = handler(
      endpoint({
        method: 'POST',
        url: '/signal',
        requestSchema: s.object({ name: s.string() }),
        responseSchema: s.object({ aborted: s.boolean() }),
      }),
      async (_params: any, ctx: RequestContext) => {
        const { signal } = ctx
        await pause(50)
        return { aborted: signal.aborted }
      },
    )

    abortablePost = handler(
      endpoint({
        method: 'POST',
        url: '/abortable',
        requestSchema: s.object({ name: s.string() }),
      }),
      async (_params: any, ctx: RequestContext) => {
        // By now the request body has been read.
        await pause(20)
        events.push('post:start')
        ctx.signal.addEventListener('abort', () => events.push('post:aborted'))
        await waitFor(() => ctx.signal.aborted)
        throw new Error('client went away')
      },
    )

    lateSignal = handler(
      endpoint({ method: 'GET', url: '/late-signal' }),
      async (_params: any, ctx: RequestContext) => {
        events.push('late:start')
        await waitFor(() => events.includes('late:gone'))
        await pause(50)
        events.push(`late:aborted=${ctx.signal.aborted}`)
        return {}
      },
    )

    feed = handler(
      endpoint({ method: 'GET', url: '/feed', response: 'stream' }),
      (_params: any, ctx: RequestContext) =>
        sseStream(
          (async function* () {
            ctx.use(UnitOfWork)
            ctx.onFinish(() => {
              events.push('feed:finish')
            })
            yield { data: 'one' }
            await pause(10)
            yield { data: 'two' }
          })(),
        ),
    )

    feedUntilGone = handler(
      endpoint({ method: 'GET', url: '/feed-until-gone', response: 'stream' }),
      (_params: any, ctx: RequestContext) =>
        sseStream(
          (async function* () {
            ctx.use(UnitOfWork)
            events.push('feed:start')
            for (let i = 0; !ctx.signal.aborted; i++) {
              yield { data: String(i) }
              await pause(5)
            }
          })(),
        ),
    )
  }
  registerController(RequestLifecycleController, { attributes: [suite.Public()] })

  return {
    controllers: [RequestLifecycleController],
    tests() {
      it('disposes a request scope after the response', async () => {
        events.length = 0
        const response = await fetch(url('/scoped'))
        expect(await response.json()).toEqual({ same: true })
        await waitFor(() => events.includes('uow:destroy'))
        expect(events).toEqual(['uow:destroy'])
      })

      it('aborts ctx.signal and releases the scope when the client disconnects', async () => {
        events.length = 0
        const controller = new AbortController()
        const pending = fetch(url('/abortable'), { signal: controller.signal }).catch(() => null)
        await waitFor(() => events.includes('abortable:start'))
        controller.abort()
        await pending
        await waitFor(() => events.includes('uow:destroy'))
        expect(events).toEqual(['abortable:start', 'abortable:aborted', 'uow:destroy'])
      })

      it('does not abort ctx.signal of a request whose client is still connected', async () => {
        const response = await fetch(url('/signal'), json({ name: 'x' }))
        expect(await response.json()).toEqual({ aborted: false })
      })

      it('aborts ctx.signal of a request with a body when the client disconnects', async () => {
        events.length = 0
        const controller = new AbortController()
        const pending = fetch(url('/abortable'), {
          ...json({ name: 'x' }),
          signal: controller.signal,
        }).catch(() => null)
        await waitFor(() => events.includes('post:start'))
        controller.abort()
        await pending
        await waitFor(() => events.includes('post:aborted'))
        expect(events).toEqual(['post:start', 'post:aborted'])
      })

      it('reports a disconnect that happened before ctx.signal was first read', async () => {
        events.length = 0
        const controller = new AbortController()
        const pending = fetch(url('/late-signal'), { signal: controller.signal }).catch(() => null)
        await waitFor(() => events.includes('late:start'))
        controller.abort()
        await pending
        events.push('late:gone')
        await waitFor(() => events.includes('late:aborted=true'))
        expect(events).toEqual(['late:start', 'late:gone', 'late:aborted=true'])
      })

      it('releases what a stream acquires while it is being sent', async () => {
        events.length = 0
        const response = await fetch(url('/feed'))
        // The server may open the stream with a comment.
        const text = (await response.text()).replace(/^:\n\n/, '')
        expect(text).toBe('data: one\n\ndata: two\n\n')
        await waitFor(() => events.includes('uow:destroy'))
        expect(events).toEqual(['feed:finish', 'uow:destroy'])
      })

      it('releases what a stream acquired when the client disconnects', async () => {
        events.length = 0
        const controller = new AbortController()
        const response = await fetch(url('/feed-until-gone'), { signal: controller.signal })
        await response.body!.getReader().read()
        await waitFor(() => events.includes('feed:start'))
        controller.abort()
        await waitFor(() => events.includes('uow:destroy'))
        expect(events).toEqual(['feed:start', 'uow:destroy'])
      })
    },
  }
}
