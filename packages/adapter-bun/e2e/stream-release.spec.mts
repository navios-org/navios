import { afterAll, beforeAll, describe, expect, it } from 'bun:test'

import { handler, NaviosFactory, registerController, registerModule } from '@navios/server'

import type { NaviosApplication } from '@navios/server'

import { defineBunEnvironment } from '../src/index.mjs'
import { toResponse } from '../src/send-result.mjs'

import type { BunEnvironment } from '../src/index.mjs'

describe('bun adapter: a stream result that cannot be written', () => {
  let app: NaviosApplication<BunEnvironment>
  let base: string
  let returned = 0
  let started = 0
  let finished = 0

  class FromIterable extends Error {}
  class FromGenerator extends Error {}

  beforeAll(async () => {
    class StreamController {
      iterable = handler({ config: { method: 'GET', url: '/iterable' } } as any, () => {
        throw new FromIterable()
      })
      generator = handler({ config: { method: 'GET', url: '/generator' } } as any, () => {
        throw new FromGenerator()
      })
    }
    registerController(StreamController)
    class AppModule {}
    registerModule(AppModule, { controllers: [StreamController] })

    app = await NaviosFactory.create(AppModule, { adapter: defineBunEnvironment(), logger: false })
    // A status that `Response` rejects.
    app.mapError(FromIterable, () => ({
      status: 99,
      kind: 'stream',
      body: {
        [Symbol.asyncIterator]: () => ({
          next: async () => ({ done: false, value: 'chunk' }),
          return: async () => {
            returned++
            return { done: true, value: undefined }
          },
        }),
      },
    }))
    app.mapError(FromGenerator, () => ({
      status: 99,
      kind: 'stream',
      body: (async function* () {
        started++
        try {
          yield 'chunk'
        } finally {
          finished++
        }
      })(),
    }))
    base = await app.listen({ port: 0, hostname: '127.0.0.1' })
  })

  afterAll(async () => {
    await app.close()
  })

  it('closes the iterator', async () => {
    const response = await fetch(`${base}/iterable`)
    expect(response.status).toBe(500)
    await Bun.sleep(10)
    expect(returned).toBe(1)
  })

  it('leaves the release of the result to the caller', async () => {
    let released = 0
    const result = {
      status: 99,
      kind: 'stream' as const,
      body: (async function* () {
        yield 'chunk'
      })(),
      release: () => {
        released++
      },
    }
    expect(() => toResponse(result, new Request('http://localhost/'))).toThrow(RangeError)
    await Bun.sleep(10)
    expect(released).toBe(0)
  })

  it('does not leave a generator suspended before its finally block', async () => {
    const response = await fetch(`${base}/generator`)
    expect(response.status).toBe(500)
    await Bun.sleep(10)
    expect(finished).toBe(started)
  })
})
