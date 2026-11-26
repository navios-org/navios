import { EventEmitter, on } from 'node:events'
import { Readable } from 'node:stream'

import { Injectable, InjectableScope } from '@navios/di'
import { describe, expect, it, vi } from 'vitest'

import { LiveRequests } from '../context/live-requests.mjs'
import { HttpException } from '../errors/index.mjs'
import { result } from '../responses/index.mjs'
import { sseStream } from '../sse/index.mjs'

import type { RequestContext } from '../context/index.mjs'
import type { ManagedBody } from '../responses/managed-body.mjs'
import type { Interceptor } from '../routing/http-contracts.mjs'
import type { RouteResult } from '../routing/index.mjs'
import type { SseMessage } from '../sse/index.mjs'

import { drain, input, setup, tick } from './pipeline-setup.mjs'

const stream = { response: 'stream' } as const

function intercept(
  run: (ctx: RequestContext, next: () => Promise<RouteResult>) => unknown,
): Interceptor {
  return { intercept: run as Interceptor['intercept'] }
}

/** Every kind of lazy body, and how to tell that it was closed. */
function bodies() {
  const closed: string[] = []
  const node = () => {
    const readable = new Readable({
      read() {
        this.push('x')
      },
    })
    readable.on('close', () => closed.push('node'))
    return readable
  }
  return {
    closed,
    kinds: {
      generator: async function* () {
        try {
          yield 'x'
          yield 'y'
        } finally {
          closed.push('generator')
        }
      },
      web: () =>
        new ReadableStream({
          pull(controller) {
            controller.enqueue('x')
          },
          cancel() {
            closed.push('web')
          },
        }),
      node,
      iterable: () => ({
        [Symbol.asyncIterator]: () => ({
          next: async () => ({ done: false, value: 'x' }),
          return: async () => {
            closed.push('iterable')
            return { done: true, value: undefined }
          },
        }),
      }),
      events: () =>
        sseStream({
          [Symbol.asyncIterator]: () => ({
            next: async () => ({ done: false, value: { data: 'x' } }),
            return: async () => {
              closed.push('events')
              return { done: true, value: undefined }
            },
          }),
        }),
    },
  }
}

const KINDS = ['generator', 'web', 'node', 'iterable', 'events'] as const

describe('a lazy body', () => {
  for (const kind of KINDS) {
    it(`is closed by release when it was not read: ${kind}`, async () => {
      const { closed, kinds } = bodies()
      const answer = await setup(stream, kinds[kind]).execute(input())
      expect(closed).toEqual([])
      await answer.release!()
      expect(closed).toEqual([kind])
    })

    it(`is closed by release when it was read in part: ${kind}`, async () => {
      const { closed, kinds } = bodies()
      const answer = await setup(stream, kinds[kind]).execute(input())
      const read = await (answer.sent as AsyncIterableIterator<unknown>).next()
      expect(String(read.value)).toContain('x')
      await answer.release!()
      expect(closed).toEqual([kind])
      expect(await drain(answer)).toEqual([])
    })

    it(`is closed when an interceptor throws after next(): ${kind}`, async () => {
      const { closed, kinds } = bodies()
      const late = intercept(async (_ctx, next) => {
        await next()
        throw new HttpException(409, 'late')
      })
      const answer = await setup(stream, kinds[kind], { interceptors: [late] }).execute(input())
      expect(answer.status).toBe(409)
      await answer.release!()
      expect(closed).toEqual([kind])
    })

    it(`is closed when an interceptor answers without it: ${kind}`, async () => {
      const { closed, kinds } = bodies()
      const replace = intercept(async (_ctx, next) => {
        await next()
        return { status: 304, body: undefined, kind: 'empty' }
      })
      const answer = await setup(stream, kinds[kind], { interceptors: [replace] }).execute(input())
      expect(answer.status).toBe(304)
      await answer.release!()
      expect(closed).toEqual([kind])
    })
  }

  it('is closed for every call of next()', async () => {
    const { closed, kinds } = bodies()
    const twice = intercept(async (_ctx, next) => {
      await next()
      return next()
    })
    const answer = await setup(stream, kinds.generator, { interceptors: [twice] }).execute(input())
    expect(await drain(answer)).toEqual(['x', 'y'])
    await answer.release!()
    expect(closed).toEqual(['generator', 'generator'])
  })

  it('is closed when it is produced after the response was decided', async () => {
    const { closed, kinds } = bodies()
    const timeout = intercept((_ctx, next) =>
      Promise.race([
        next(),
        tick(5).then(() => {
          throw new HttpException(504, 'late')
        }),
      ]),
    )
    const { execute } = setup(
      stream,
      async () => {
        await tick(20)
        return kinds.web()
      },
      { interceptors: [timeout] },
    )
    const answer = await execute(input())
    expect(answer.status).toBe(504)
    await answer.release?.()
    await tick(30)
    expect(closed).toEqual(['web'])
  })

  it('that an encoder made is closed when an interceptor answers without it', async () => {
    const { closed, kinds } = bodies()
    const replace = intercept(async (_ctx, next) => {
      await next()
      return { status: 304, body: undefined, kind: 'empty' }
    })
    const answer = await setup(stream, () => result('csv', [1]), {
      interceptors: [replace],
      encoders: { csv: () => ({ status: 200, body: kinds.web(), kind: 'stream' }) },
    }).execute(input())
    await answer.release!()
    expect(closed).toEqual(['web'])
  })

  it('that wraps another is closed with it, also when it was not read', async () => {
    const { closed, kinds } = bodies()
    const upper = intercept(async (_ctx, next) => {
      const inner = await next()
      return {
        ...inner,
        body: (async function* () {
          for await (const chunk of inner.body as AsyncIterable<string>) {
            yield chunk.toUpperCase()
          }
        })(),
      }
    })
    const read = await setup(stream, kinds.generator, { interceptors: [upper] }).execute(input())
    expect(await drain(read)).toEqual(['X', 'Y'])
    await read.release!()
    expect(closed).toEqual(['generator'])

    closed.length = 0
    const dropped = await setup(stream, kinds.iterable, { interceptors: [upper] }).execute(input())
    await dropped.release!()
    expect(closed).toContain('iterable')
  })

  it('is closed for a status that has no body', async () => {
    const { closed, kinds } = bodies()
    const noContent = intercept(async (_ctx, next) => ({ ...(await next()), status: 204 }))
    const answer = await setup(stream, kinds.web, { interceptors: [noContent] }).execute(input())
    expect(answer.sent).toBeNull()
    await answer.release!()
    expect(closed).toEqual(['web'])
  })

  it('is not closed again when it was read to its end', async () => {
    const returned = vi.fn()
    let left = 2
    const { execute } = setup(stream, () => ({
      [Symbol.asyncIterator]: () => ({
        next: async () => (left-- > 0 ? { done: false, value: 'x' } : { done: true }),
        return: returned,
      }),
    }))
    const answer = await execute(input())
    expect(await drain(answer)).toEqual(['x', 'x'])
    await answer.release!()
    expect(returned).not.toHaveBeenCalled()
  })

  it('may be an iterator without return() and throw()', async () => {
    let calls = 0
    const source = {
      [Symbol.asyncIterator]() {
        return this
      },
      next: async () => (++calls < 4 ? { done: false, value: `${calls}` } : { done: true }),
    }
    const early = intercept(async (_ctx, next) => {
      const answer = await next()
      const body = answer.body as AsyncIterableIterator<string>
      for await (const chunk of body) {
        expect(chunk).toBe('1')
        break
      }
      await expect(body.throw!(new Error('gone'))).rejects.toThrow('gone')
      return answer
    })
    const answer = await setup(stream, () => source, { interceptors: [early] }).execute(input())
    expect(answer.status).toBe(200)
    await answer.release!()
  })

  it('that subscribed to something when it was created is unsubscribed', async () => {
    const emitter = new EventEmitter()
    const { execute } = setup(stream, () =>
      sseStream(on(emitter, 'tick') as unknown as AsyncIterable<SseMessage>),
    )
    const answer = await execute(input())
    expect(emitter.listenerCount('tick')).toBe(1)
    await answer.release!()
    expect(emitter.listenerCount('tick')).toBe(0)
  })

  it('that is a Node stream may fail before it is read', async () => {
    const { execute } = setup(stream, async () => {
      const readable = new Readable({ read() {} })
      readable.destroy(new HttpException(404, 'no such file'))
      return readable
    })
    expect((await execute(input())).status).toBe(404)
  })
})

describe('the first chunk of a lazy body', () => {
  it('is not waited for with the signal of the request when it is there', async () => {
    for (const make of [
      async function* () {
        yield 'a'
        yield 'b'
      },
      () =>
        new ReadableStream({
          start(controller) {
            controller.enqueue('a')
            controller.enqueue('b')
            controller.close()
          },
        }),
    ]) {
      const signal = vi.fn(() => new AbortController().signal)
      const answer = await setup(stream, make).execute(input({ signal }))
      expect((answer.sent as ManagedBody).isStarted).toBe(true)
      expect(await drain(answer)).toEqual(['a', 'b'])
      expect(signal).not.toHaveBeenCalled()
      await answer.release!()
    }
  })

  it('is read once, whoever reads it', async () => {
    const first = intercept(async (_ctx, next) => {
      const answer = await next()
      const body = answer.body as AsyncIterableIterator<string>
      expect((await body.next()).value).toBe('a')
      return answer
    })
    const answer = await setup(
      stream,
      async function* () {
        yield 'a'
        yield 'b'
        yield 'c'
      },
      { interceptors: [first] },
    ).execute(input())
    expect(await drain(answer)).toEqual(['b', 'c'])
    await answer.release!()
  })

  it('is not waited for in an event stream, whoever writes it', async () => {
    const event = { 'content-type': 'text/event-stream; charset=utf-8' }
    const idle = () => new Promise<never>(() => {})
    for (const make of [
      () => sseStream({ [Symbol.asyncIterator]: () => ({ next: idle }) }),
      async function* (_params: unknown, ctx: RequestContext) {
        ctx.reply.header('Content-Type', 'text/event-stream')
        ctx.reply.header('x-set', 'yes')
        await idle()
        yield ''
      },
      (_params: unknown, ctx: RequestContext) => {
        ctx.reply.header('content-type', ['Text/Event-Stream;charset=utf-8'])
        return new ReadableStream({ pull: idle })
      },
      () => result('feed', null),
    ]) {
      const { execute } = setup(stream, make, {
        encoders: {
          feed: () => ({
            status: 200,
            headers: event,
            body: new ReadableStream({ pull: idle }),
            kind: 'stream',
          }),
        },
      })
      const answer = await Promise.race([execute(input()), tick(100)])
      expect(answer?.status).toBe(200)
      expect(answer!.headers['x-set']).toBe(
        (make as () => unknown).constructor.name === 'AsyncGeneratorFunction' ? 'yes' : undefined,
      )
    }
  })

  it('that fails in an event stream is reported, and is no unhandled rejection', async () => {
    const { execute, unhandled } = setup(
      stream,
      // oxlint-disable-next-line require-yield
      async function* (_params: unknown, ctx: RequestContext) {
        ctx.reply.header('content-type', 'text/event-stream')
        await tick(1)
        throw new Error('failed')
      },
    )
    const answer = await execute(input())
    expect(answer.status).toBe(200)
    await tick(5)
    await expect(drain(answer)).rejects.toThrow('failed')
    await answer.release!()
    expect(unhandled).toHaveLength(1)
  })

  it('may be preceded by a comment in a stream of the server, for a server that needs one', async () => {
    const events = await setup(stream, () =>
      sseStream(
        (async function* () {
          yield { data: 'x' }
        })(),
      ),
    ).execute(input())
    expect((events.sent as ManagedBody).opening).toBe(':\n\n')
    expect(await drain(events)).toEqual(['data: x\n\n'])
    await events.release!()
    // Also for a stream that says itself that it is an event stream.
    const own = await setup(stream, async function* (_params: unknown, ctx: RequestContext) {
      ctx.reply.header('content-type', 'text/event-stream')
      yield 'data: x\n\n'
    }).execute(input())
    expect((own.sent as ManagedBody).opening).toBe(':\n\n')
    await own.release!()
    const other = await setup(stream, async function* () {
      yield 'x'
    }).execute(input())
    expect((other.sent as ManagedBody).opening).toBeNull()
    await other.release!()
  })
})

describe('the release of a request with a lazy body', () => {
  function tracked() {
    const events: string[] = []

    @Injectable({ scope: InjectableScope.Request })
    class UnitOfWork {
      dead = false
      onServiceDestroy() {
        this.dead = true
        events.push('destroy')
      }
    }
    return { events, UnitOfWork }
  }

  it('closes the body, runs onFinish, then disposes the scope', async () => {
    const { events, UnitOfWork } = tracked()
    const { execute } = setup(stream, async function* (_params, ctx: RequestContext) {
      const uow = ctx.use(UnitOfWork)
      ctx.onFinish(() => {
        events.push('finish')
      })
      try {
        yield 'a'
        yield 'b'
      } finally {
        await tick(5)
        events.push(`finally dead=${uow.dead}`)
        ctx.onFinish(() => {
          events.push('finish of finally')
        })
      }
    })
    const answer = await execute(input())
    await answer.release!()
    expect(events).toEqual(['finally dead=false', 'finish of finally', 'finish', 'destroy'])
  })

  it('does not wait for ever for a body that cannot be closed', async () => {
    const { events, UnitOfWork } = tracked()
    const { execute } = setup(stream, async function* (_params, ctx: RequestContext) {
      ctx.use(UnitOfWork)
      yield 'a'
      await new Promise(() => {})
    })
    const answer = await execute(input())
    const body = answer.sent as AsyncIterableIterator<unknown>
    await body.next()
    void body.next()
    const started = Date.now()
    await answer.release!()
    expect(events).toEqual(['destroy'])
    expect(Date.now() - started).toBeLessThan(1500)
  })

  it('may be asked for while a generator waits for its first chunk', async () => {
    const { events, UnitOfWork } = tracked()
    const controller = new AbortController()
    const { execute } = setup(stream, async function* (_params, ctx: RequestContext) {
      ctx.use(UnitOfWork)
      await new Promise(() => {})
      yield 'a'
    })
    const pending = execute(input({ signal: () => controller.signal }))
    await tick(5)
    controller.abort()
    await (
      await pending
    ).release!()
    expect(events).toEqual(['destroy'])
  })

  it('closes a generator that waits for its first chunk once', async () => {
    const controller = new AbortController()
    const live = new LiveRequests()
    const { execute } = setup(
      stream,
      async function* () {
        await new Promise(() => {})
        yield 'a'
      },
      { live },
    )
    const pending = execute(input({ signal: () => controller.signal }))
    await tick(5)
    // What an application that is being closed does.
    const started = Date.now()
    const released = Array.from(live, (ctx) => ctx.release())
    controller.abort()
    await pending
    await Promise.all(released)
    expect(released).toHaveLength(1)
    expect(Date.now() - started).toBeLessThan(1500)
  })

  it('calls nothing of the application before it returns', async () => {
    const { events, UnitOfWork } = tracked()
    const { execute } = setup({}, (_params, ctx: RequestContext) => {
      ctx.use(UnitOfWork)
      ctx.onFinish(() => {
        events.push('finish')
      })
      return 'ok'
    })
    const released = (await execute(input())).release!()
    // What else listens to the same event of the connection, such as
    // `ctx.signal`, comes first.
    expect(events).toEqual([])
    await released
    expect(events).toEqual(['finish', 'destroy'])
  })
})

describe('an error while a response streams', () => {
  it('is reported once, with the route, and ends the stream', async () => {
    const error = new Error('db failure')
    const { execute, unhandled } = setup(stream, async function* () {
      yield 'one'
      throw error
    })
    const answer = await execute(input())
    await expect(drain(answer)).rejects.toBe(error)
    await answer.release!()
    expect(unhandled).toEqual([error])
  })

  it('is reported for an event stream, a web stream and a Node stream', async () => {
    for (const make of [
      () =>
        sseStream(
          // oxlint-disable-next-line require-yield
          (async function* (): AsyncGenerator<SseMessage> {
            throw new Error('failed')
          })(),
        ),
      () => {
        let first = true
        return new ReadableStream({
          pull(controller) {
            if (!first) {
              throw new Error('failed')
            }
            first = false
            controller.enqueue('x')
          },
        })
      },
      () => {
        let first = true
        return new Readable({
          read() {
            if (first) {
              first = false
              this.push('x')
            } else {
              setTimeout(() => this.destroy(new Error('failed')), 1)
            }
          },
        })
      },
    ]) {
      const { execute, unhandled } = setup(stream, make)
      const answer = await execute(input())
      await expect(drain(answer)).rejects.toThrow('failed')
      await answer.release!()
      expect(unhandled.map((error) => (error as Error).message)).toEqual(['failed'])
    }
  })

  it('is not reported when the client is gone', async () => {
    const controller = new AbortController()
    const { execute, unhandled } = setup(stream, async function* (_params, ctx: RequestContext) {
      yield 'one'
      controller.abort()
      ctx.signal.throwIfAborted()
    })
    const answer = await execute(input({ signal: () => controller.signal }))
    await expect(drain(answer)).rejects.toThrow()
    await answer.release!()
    expect(unhandled).toEqual([])
  })

  it('is reported when closing the body fails', async () => {
    const error = new Error('rollback failed')
    const rollback = async () => {
      throw error
    }
    const { execute, unhandled } = setup(stream, async function* () {
      try {
        yield 'one'
        yield 'two'
      } finally {
        await rollback()
      }
    })
    const answer = await execute(input())
    await answer.release!()
    expect(unhandled).toEqual([error])
  })

  it('names a chunk that cannot be sent', async () => {
    for (const [chunk, name] of [
      [{ a: 1 }, 'a plain object'],
      [[1], 'an array'],
      [null, 'null'],
      [undefined, 'a value of type undefined'],
      [12, 'a value of type number'],
      [new Map(), 'an object of class Map'],
    ] as const) {
      const { execute, unhandled } = setup(stream, async function* () {
        yield 'one'
        yield chunk
      })
      const answer = await execute(input())
      await expect(drain(answer)).rejects.toThrow(`GET /test yielded ${name} as a chunk`)
      await answer.release!()
      expect(unhandled).toHaveLength(1)
    }
  })

  it('answers a first chunk that cannot be sent with an error response', async () => {
    const { execute, unhandled } = setup(stream, async function* () {
      yield { a: 1 }
    })
    const answer = await execute(input())
    expect(answer.status).toBe(500)
    await answer.release!()
    expect(unhandled).toHaveLength(1)
    expect(String(unhandled[0])).toContain('yielded a plain object')
  })

  it('is an ordinary error when it comes before the first chunk', async () => {
    for (const make of [
      // oxlint-disable-next-line require-yield
      async function* () {
        throw new HttpException(404, 'no such log')
      },
      () =>
        new ReadableStream({
          pull() {
            throw new HttpException(404, 'no such log')
          },
        }),
      () => ({
        [Symbol.asyncIterator]: () => ({
          next: async () => {
            throw new HttpException(404, 'no such log')
          },
        }),
      }),
    ]) {
      const { execute, unhandled } = setup(stream, make)
      const answer = await execute(input())
      expect(answer.status).toBe(404)
      expect(answer.body.detail).toBe('no such log')
      await answer.release!()
      expect(unhandled).toEqual([])
    }
  })

  it('does not change the response of an event stream', async () => {
    const pulled = vi.fn()
    const { execute } = setup(stream, () =>
      sseStream({
        [Symbol.asyncIterator]: () => ({ next: pulled }),
      }),
    )
    const answer = await execute(input())
    expect(answer.status).toBe(200)
    expect(pulled).not.toHaveBeenCalled()
  })
})
