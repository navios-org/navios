import { afterAll, beforeAll, describe, expect, it } from 'bun:test'

import { handler, NaviosFactory, registerController, registerModule } from '@navios/server'

import type { NaviosApplication, RequestContext } from '@navios/server'

import { defineBunEnvironment } from '../src/index.mjs'

import type { BunEnvironment } from '../src/index.mjs'

describe('bun adapter: a stream that cannot be sent', () => {
  let app: NaviosApplication<BunEnvironment>
  let base: string
  const events: unknown[] = []

  class FromIterable extends Error {}
  class FromGenerator extends Error {}

  const source = async function* () {
    try {
      yield 'chunk'
    } finally {
      events.push('finally')
    }
  }

  beforeAll(async () => {
    class StreamController {
      iterable = handler({ config: { method: 'GET', url: '/iterable' } } as any, () => {
        throw new FromIterable()
      })
      generator = handler({ config: { method: 'GET', url: '/generator' } } as any, () => {
        throw new FromGenerator()
      })
      late = handler(
        { config: { method: 'GET', url: '/late', response: 'stream' } } as any,
        async function* (_params: unknown, ctx: RequestContext) {
          ctx.onFinish(() => {
            events.push(ctx.path, ctx.query, ctx.headers.get('x-late'))
          })
          yield 'chunk'
        } as any,
      )
    }
    registerController(StreamController)
    class AppModule {}
    registerModule(AppModule, { controllers: [StreamController] })

    app = await NaviosFactory.create(AppModule, {
      adapter: defineBunEnvironment(),
      logger: false,
    })
    // A status that `Response` rejects.
    app.mapError(FromIterable, () => ({
      status: 99,
      kind: 'stream',
      body: {
        [Symbol.asyncIterator]: () => ({
          next: async () => ({ done: false, value: 'chunk' }),
          return: async () => {
            events.push('return')
            return { done: true, value: undefined }
          },
        }),
      },
    }))
    app.mapError(FromGenerator, async () => {
      const body = source()
      await body.next()
      return { status: 99, kind: 'stream', body }
    })
    base = await app.listen({ port: 0, hostname: '127.0.0.1' })
  })

  afterAll(async () => {
    await app.close()
  })

  it('closes the iterator', async () => {
    events.length = 0
    const response = await fetch(`${base}/iterable`)
    expect(response.status).toBe(500)
    await Bun.sleep(10)
    expect(events).toEqual(['return'])
  })

  it('does not leave a generator suspended before its finally block', async () => {
    events.length = 0
    const response = await fetch(`${base}/generator`)
    expect(response.status).toBe(500)
    await Bun.sleep(10)
    expect(events).toEqual(['finally'])
  })

  it('reads the request after the response, also for a HEAD of a stream', async () => {
    for (const method of ['GET', 'HEAD']) {
      events.length = 0
      await fetch(`${base}/late?a=1`, { method, headers: { 'x-late': 'yes' } }).then((response) =>
        response.text(),
      )
      await Bun.sleep(50)
      expect(events).toEqual(['/late', { a: '1' }, 'yes'])
    }
  })
})
