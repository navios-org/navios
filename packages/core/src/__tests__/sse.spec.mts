import { builder } from '@navios/builder'
import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import { Controller, encodeSse, handler, Module, NaviosFactory, sse, sseStream } from '../index.mjs'
import { createTestClient, defineInMemoryEnvironment } from '../testing/index.mjs'

const userJoined = {
  config: { eventName: 'user-joined', payloadSchema: z.object({ userId: z.string() }) },
} as const

const feed = builder().declareEndpoint({ method: 'GET', url: '/feed', response: 'stream' })

describe('server-sent events', () => {
  it('encodes events in the event-stream format', () => {
    expect(encodeSse({ event: 'tick', data: { n: 1 }, id: '7', retry: 500 })).toBe(
      'id: 7\nevent: tick\nretry: 500\ndata: {"n":1}\n\n',
    )
    expect(encodeSse({ data: 'line one\nline two' })).toBe('data: line one\ndata: line two\n\n')
  })

  it('types and validates the payload of a declared event', () => {
    expect(sse(userJoined, { userId: '1' })).toEqual({ event: 'user-joined', data: { userId: '1' } })
    // @ts-expect-error wrong payload type
    expect(() => sse(userJoined, { userId: 1 })).toThrow(/Validation failed/)
  })

  it('streams events from a handler', async () => {
    @Controller()
    class FeedController {
      feed = handler(feed, () =>
        sseStream(
          (async function* () {
            yield sse(userJoined, { userId: '1' })
            yield sse(userJoined, { userId: '2' })
          })(),
        ),
      )
    }

    @Module({ controllers: [FeedController] })
    class AppModule {}

    const app = await NaviosFactory.create(AppModule, {
      adapter: defineInMemoryEnvironment(),
      logger: false,
    })
    const response = await createTestClient(app)(feed)
    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toBe('text/event-stream')
    expect(response.headers['cache-control']).toBe('no-cache')
    expect(response.text).toBe(
      'event: user-joined\ndata: {"userId":"1"}\n\nevent: user-joined\ndata: {"userId":"2"}\n\n',
    )
    await app.close()
  })
})
