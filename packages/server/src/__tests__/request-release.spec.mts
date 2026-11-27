import { Container, Injectable, InjectableScope, ScopedContainer } from '@navios/core'
import { enableAsyncContext } from '@navios/core/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { currentContext } from '../context/current-request-context.mjs'
import { RequestValue } from '../context/index.mjs'
import { LiveRequests } from '../context/live-requests.mjs'
import { HttpException, NotFoundException } from '../errors/index.mjs'
import { sseStream } from '../sse/index.mjs'

import type { RequestContext } from '../context/index.mjs'
import type { Interceptor } from '../routing/http-contracts.mjs'
import type { RouteResult } from '../routing/index.mjs'

import { drain, input, setup, tick } from './pipeline-setup.mjs'

function tracked() {
  const events: string[] = []

  @Injectable({ scope: InjectableScope.Request })
  class UnitOfWork {
    onServiceDestroy() {
      events.push('destroy')
    }
  }
  return { events, UnitOfWork }
}

describe('the release of a request', () => {
  it('needs no scope for a singleton, also once the response has finished', async () => {
    const { UnitOfWork } = tracked()

    @Injectable()
    class Clock {}

    const created = vi.spyOn(Container.prototype, 'createScope')
    let late: unknown
    const { execute, container } = setup({}, (_params, ctx: RequestContext) => {
      const clock = ctx.use(Clock)
      late = () => ctx.use(Clock)
      return { same: clock === container.getSync(Clock) }
    })
    const answer = await execute(input())
    expect(answer).toMatchObject({ status: 200, body: { same: true }, release: undefined })
    expect((late as () => unknown)()).toBe(container.getSync(Clock))
    expect(created).not.toHaveBeenCalled()

    const scoped = setup({}, (_params, ctx: RequestContext) => ctx.use(UnitOfWork) && {})
    await (
      await scoped.execute(input())
    ).release!()
    expect(created).toHaveBeenCalledTimes(1)
    created.mockRestore()
  })

  it('runs a callback that onFinish registered, and one a dispose hook registered', async () => {
    const { events, UnitOfWork } = tracked()

    @RequestValue()
    class Session {
      resolve() {
        return 1
      }
      dispose(_value: number, ctx: RequestContext) {
        events.push('dispose')
        ctx.onFinish(() => {
          events.push('third')
        })
      }
    }

    const { execute } = setup({}, (_params, ctx: RequestContext) => {
      ctx.use(UnitOfWork)
      ctx.get(Session)
      ctx.onFinish(async () => {
        events.push('first')
        await tick(1)
        ctx.onFinish(async () => {
          await tick(1)
          events.push('second')
        })
      })
      return {}
    })
    await (
      await execute(input())
    ).release!()
    expect(events).toEqual(['first', 'second', 'dispose', 'third', 'destroy'])
  })

  it('disposes a value that the dispose hook of another computed', async () => {
    const events: string[] = []

    @RequestValue()
    class Inner {
      resolve() {
        events.push('inner +')
        return 1
      }
      dispose() {
        events.push('inner -')
      }
    }

    @RequestValue()
    class Outer {
      resolve() {
        events.push('outer +')
        return 1
      }
      dispose(_value: number, ctx: RequestContext) {
        events.push('outer -')
        ctx.get(Inner)
      }
    }

    const { execute } = setup({}, (_params, ctx: RequestContext) => ctx.get(Outer))
    await (
      await execute(input())
    ).release!()
    expect(events).toEqual(['outer +', 'outer -', 'inner +', 'inner -'])
  })

  it('logs what an onFinish callback, a dispose hook and the scope throw, and goes on', async () => {
    const error = vi.fn()

    @Injectable({ scope: InjectableScope.Request })
    class Broken {
      onServiceDestroy() {
        throw new Error('destroy')
      }
    }

    @RequestValue()
    class Session {
      resolve() {
        return 1
      }
      dispose() {
        throw new Error('dispose')
      }
    }

    const { execute } = setup(
      {},
      (_params, ctx: RequestContext) => {
        ctx.use(Broken)
        ctx.get(Session)
        ctx.onFinish(() => {
          throw new Error('finish')
        })
        return {}
      },
      { logger: { error } },
    )
    await (
      await execute(input())
    ).release!()
    const logged = error.mock.calls.map(([message]) => message)
    expect(logged.slice(0, 2)).toEqual([
      'Error in an onFinish callback of GET /test',
      'Error in the dispose hook of Session of GET /test',
    ])
  })

  it('logs what a late onFinish callback throws', async () => {
    const error = vi.fn()
    let late: RequestContext | undefined
    const { execute } = setup(
      {},
      (_params, ctx: RequestContext) => {
        late = ctx
        return {}
      },
      { logger: { error } },
    )
    await execute(input())
    late!.onFinish(async () => {
      throw new Error('late')
    })
    await tick()
    expect(error).toHaveBeenCalledTimes(1)
  })

  it('does not call the dispose hook of a value that failed, nor report it', async () => {
    const error = vi.fn()
    const dispose = vi.fn()

    @RequestValue()
    class Session {
      async resolve() {
        throw new HttpException(401, 'no')
      }
      dispose() {
        dispose()
      }
    }

    const { execute } = setup({}, (_params, ctx: RequestContext) => ctx.get(Session), {
      logger: { error },
    })
    const answer = await execute(input())
    expect(answer.status).toBe(401)
    await answer.release!()
    expect(dispose).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })

  it('happens once, and a second call waits for the first', async () => {
    const { events, UnitOfWork } = tracked()
    const { execute } = setup({}, (_params, ctx: RequestContext) => {
      ctx.use(UnitOfWork)
      ctx.onFinish(async () => {
        await tick(5)
        events.push('finish')
      })
      return {}
    })
    const answer = await execute(input())
    void answer.release!()
    await answer.release!()
    expect(events).toEqual(['finish', 'destroy'])
  })

  it('takes a request out of the set of those that hold something', async () => {
    const { UnitOfWork } = tracked()
    const live = new LiveRequests()
    const { execute } = setup({}, (_params, ctx: RequestContext) => ctx.use(UnitOfWork) && 'ok', {
      live,
    })
    const answer = await execute(input())
    expect(live.size).toBe(1)
    await answer.release!()
    expect(live.size).toBe(0)

    const plain = setup({}, () => 'ok', { live })
    await plain.execute(input())
    expect(live.size).toBe(0)
  })

  it('takes requests out of the list the transport keeps, in any order', async () => {
    const { UnitOfWork } = tracked()
    const live = new LiveRequests()
    const { execute } = setup({}, (_params, ctx: RequestContext) => ctx.use(UnitOfWork) && 'ok', {
      live,
    })
    const answers = await Promise.all([execute(input()), execute(input()), execute(input())])
    expect(live.size).toBe(3)
    await answers[1].release!()
    expect(live.size).toBe(2)
    await Promise.all(answers.map((answer) => answer.release!()))
    expect(live.size).toBe(0)
    expect([...live]).toEqual([])
  })

  it('waits for an asynchronous destroy hook of a request-scoped service', async () => {
    const events: string[] = []

    @Injectable({ scope: InjectableScope.Request })
    class Connection {
      async onServiceDestroy() {
        await tick(5)
        events.push('closed')
      }
    }

    const live = new LiveRequests()
    const { execute } = setup({}, (_params, ctx: RequestContext) => ctx.use(Connection) && 'ok', {
      live,
    })
    const answer = await execute(input())
    const releasing = answer.release!()
    await tick(1)
    expect(events).toEqual([])
    expect(live.size).toBe(1)
    await releasing
    expect(events).toEqual(['closed'])
    expect(live.size).toBe(0)
  })

  it('does not dispose the scope before the adapter has returned', async () => {
    const { events, UnitOfWork } = tracked()
    const { execute } = setup({}, (_params, ctx: RequestContext) => ctx.use(UnitOfWork) && 'ok')
    const answer = await execute(input())
    const releasing = answer.release!()
    // A listener of `ctx.signal` that runs after the adapter's own hears of a
    // disconnect before the services it may use are gone.
    expect(events).toEqual([])
    await releasing
    expect(events).toEqual(['destroy'])
  })

  it('logs a disposal of the scope that fails, and still lets go of the request', async () => {
    const { UnitOfWork } = tracked()
    const error = vi.fn()
    const live = new LiveRequests()
    const failing = vi
      .spyOn(ScopedContainer.prototype, 'dispose')
      .mockImplementation(() => Promise.reject(new Error('stuck')))
    try {
      const { execute } = setup({}, (_params, ctx: RequestContext) => ctx.use(UnitOfWork) && 'ok', {
        live,
        logger: { error },
      })
      const answer = await execute(input())
      await answer.release!()
      expect(error).toHaveBeenCalledWith(
        'Error in the disposal of the request scope of GET /test',
        expect.objectContaining({ message: 'stuck' }),
      )
      expect(live.size).toBe(0)
    } finally {
      failing.mockRestore()
    }
  })
})

describe('promises the framework hands out', () => {
  const unhandled: unknown[] = []
  const record = (reason: unknown) => {
    unhandled.push(reason)
  }
  let existing: NodeJS.UnhandledRejectionListener[] = []

  beforeEach(() => {
    unhandled.length = 0
    existing = process.listeners('unhandledRejection')
    process.removeAllListeners('unhandledRejection')
    process.on('unhandledRejection', record)
  })

  afterEach(() => {
    process.removeAllListeners('unhandledRejection')
    for (const listener of existing) {
      process.on('unhandledRejection', listener)
    }
  })

  it('are handled when a handler abandons ctx.resolve()', async () => {
    @Injectable({ scope: InjectableScope.Request })
    class Slow {
      async onServiceInit() {
        await tick(10)
      }
    }
    const { execute } = setup({}, (_params, ctx: RequestContext) => {
      void ctx.resolve(Slow)
      throw new NotFoundException('nope')
    })
    const answer = await execute(input())
    expect(answer.status).toBe(404)
    await answer.release!()
    await tick(30)
    expect(unhandled).toEqual([])
  })

  it('are handled when nobody awaits a request value', async () => {
    @RequestValue()
    class Session {
      async resolve() {
        await tick(1)
        throw new Error('async boom')
      }
    }
    const { execute } = setup({}, (_params, ctx: RequestContext) => {
      void ctx.get(Session)
      return 'ok'
    })
    expect((await execute(input())).status).toBe(200)
    await tick(20)
    expect(unhandled).toEqual([])
  })

  it('are handled when an interceptor does not wait for next(), and reported', async () => {
    const error = new Error('refresh failed')
    const stale: Interceptor = {
      async intercept(_ctx, next) {
        void next()
        return { status: 200, body: { cached: true }, kind: 'json' } as RouteResult
      },
    }
    const refreshing = setup(
      {},
      async () => {
        await tick(5)
        throw error
      },
      { interceptors: [stale] },
    )
    expect((await refreshing.execute(input())).body).toEqual({ cached: true })
    await tick(20)
    expect(unhandled).toEqual([])
    expect(refreshing.unhandled).toEqual([error])

    const missing = setup(
      {},
      async () => {
        await tick(5)
        throw new NotFoundException('nope')
      },
      { interceptors: [stale] },
    )
    await missing.execute(input())
    await tick(20)
    expect(unhandled).toEqual([])
    expect(missing.unhandled).toEqual([])
  })

  it('are not reported when an interceptor deals with the error of next()', async () => {
    const recover: Interceptor = {
      async intercept(_ctx, next) {
        try {
          return await next()
        } catch {
          return { status: 200, body: 'recovered', kind: 'text' } as RouteResult
        }
      },
    }
    const recovered = setup(
      {},
      async () => {
        throw new Error('boom')
      },
      { interceptors: [recover] },
    )
    expect((await recovered.execute(input())).body).toBe('recovered')
    await tick(5)
    expect(recovered.unhandled).toEqual([])

    const rethrown = setup(
      {},
      async () => {
        throw new Error('boom')
      },
      { interceptors: [{ intercept: (_ctx, next) => next() }] },
    )
    expect((await rethrown.execute(input())).status).toBe(500)
    await tick(5)
    expect(rethrown.unhandled).toHaveLength(1)
    expect(unhandled).toEqual([])
  })
})

describe('a response the handler wrote itself', () => {
  it('keeps the request open until the adapter releases it, with the real status', async () => {
    const { events, UnitOfWork } = tracked()
    let status = 200
    let late: RequestContext | undefined
    const { execute } = setup({}, (_params, ctx: RequestContext) => {
      late = ctx
    })
    const answer = await execute(
      input({ responded: () => true, respondedStatus: () => status, body: () => undefined }),
    )
    expect(answer.sent).toBeNull()
    expect(answer.release).toBeDefined()
    late!.use(UnitOfWork)
    late!.onFinish(() => {
      events.push(`finish ${late!.responseStatus}`)
    })
    status = 201
    await answer.release!()
    expect(events).toEqual(['finish 201', 'destroy'])
  })

  it('may have a status that only the native server can send', async () => {
    let request: RequestContext | undefined
    const { execute, unhandled } = setup({}, (_params, ctx: RequestContext) => {
      request = ctx
    })
    const answer = await execute(input({ responded: () => true, respondedStatus: () => 101 }))
    expect(answer.sent).toBeNull()
    await answer.release!()
    expect(request!.responseStatus).toBe(101)
    expect(unhandled).toEqual([])
  })

  it('is a result that an interceptor may change', async () => {
    const mutate: Interceptor = {
      async intercept(_ctx, next) {
        const result = await next()
        result.headers = { ...result.headers, 'x-a': '1' }
        return result
      },
    }
    const { execute, unhandled } = setup({}, () => undefined, { interceptors: [mutate] })
    expect((await execute(input({ responded: () => true }))).status).toBe(200)
    expect(unhandled).toEqual([])
  })
})

describe('currentContext()', () => {
  it('is the request in everything that runs for it', async () => {
    await enableAsyncContext()
    const seen: Record<string, boolean> = {}
    let request: RequestContext | undefined
    const see = (name: string) => {
      seen[name] = currentContext() === request
    }

    @Injectable({ scope: InjectableScope.Request })
    class UnitOfWork {
      onServiceDestroy() {
        see('destroy')
      }
    }

    @RequestValue()
    class Session {
      resolve() {
        return 1
      }
      dispose() {
        see('dispose')
      }
    }

    const prepare = (ctx: RequestContext) => {
      request = ctx
      ctx.use(UnitOfWork)
      ctx.get(Session)
      ctx.onFinish(() => see('finish'))
    }

    const generator = setup(
      { response: 'stream' },
      async function* (_params, ctx: RequestContext) {
        prepare(ctx)
        try {
          yield 'a'
          see('after the first chunk')
          yield 'b'
        } finally {
          see('finally')
        }
      },
      { asyncContext: true },
    )
    const answer = await generator.execute(input())
    const body = answer.sent as AsyncIterableIterator<unknown>
    await body.next()
    await body.next()
    await answer.release!()

    const events = setup(
      { response: 'stream' },
      (_params, ctx: RequestContext) => {
        prepare(ctx)
        return sseStream(
          (async function* () {
            see('event source')
            yield { data: 'a' }
          })(),
        )
      },
      { asyncContext: true },
    )
    const feed = await events.execute(input())
    await drain(feed)
    await feed.release!()

    class Mapped extends Error {}
    const failing = setup(
      {},
      async (_params, ctx: RequestContext) => {
        request = ctx
        await tick(1)
        throw new Mapped()
      },
      { asyncContext: true, onUnhandled: () => see('report') },
    )
    failing.errors.add(Mapped, () => {
      see('mapper')
      return { status: 500, body: {}, kind: 'json' }
    })
    await failing.execute(input())

    expect(seen).toEqual({
      'after the first chunk': true,
      finally: true,
      finish: true,
      dispose: true,
      destroy: true,
      'event source': true,
      mapper: true,
      report: true,
    })
    expect(currentContext()).toBeUndefined()
  })
})
