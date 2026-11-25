import { builder } from '@navios/builder'
import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import { Controller, handler, Module, NaviosFactory, sse, sseStream } from '../index.mjs'
import { encodeSse } from '../sse/sse-message.mjs'
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

  it('starts a data line at every kind of line break', () => {
    expect(encodeSse({ data: 'one\r\ntwo\rthree\nfour' })).toBe(
      'data: one\ndata: two\ndata: three\ndata: four\n\n',
    )
    // A carriage return must not let the data start a field of its own.
    expect(encodeSse({ data: 'x\revent: admin' })).toBe('data: x\ndata: event: admin\n\n')
  })

  it('rejects a line break in the id and in the event name', () => {
    expect(() => encodeSse({ data: 'x', id: '1\ndata: forged' })).toThrow(/line break/)
    expect(() => encodeSse({ data: 'x', id: '1\r' })).toThrow(/line break/)
    expect(() => encodeSse({ data: 'x', event: 'tick\nid: 9' })).toThrow(/line break/)
    expect(() => encodeSse({ data: 'x', event: 'tick\rid: 9' })).toThrow(/line break/)
  })

  it('rejects a retry that is not a whole number of milliseconds', () => {
    for (const retry of [Number.NaN, -1, 1.5, Number.POSITIVE_INFINITY, '1\ndata: x' as never]) {
      expect(() => encodeSse({ data: 'x', retry })).toThrow(/retry/)
    }
    expect(encodeSse({ data: 'x', retry: 0 })).toBe('retry: 0\ndata: x\n\n')
  })

  it('sends no text for data that has no JSON', () => {
    expect(encodeSse({ event: 'ping', data: undefined })).toBe('event: ping\ndata: \n\n')
  })

  it('types and validates the payload of a declared event', () => {
    expect(sse(userJoined, { userId: '1' })).toEqual({
      event: 'user-joined',
      data: { userId: '1' },
    })
    // @ts-expect-error wrong payload type
    expect(() => sse(userJoined, { userId: 1 })).toThrow(/Validation failed/)
  })

  it('sends the payload of a declared event as JSON, also when it is a string', () => {
    const note = { config: { eventName: 'note', payloadSchema: z.union([z.number(), z.string()]) } }

    expect(encodeSse(sse(note, '42'))).toBe('event: note\ndata: "42"\n\n')
    expect(encodeSse(sse(note, 42))).toBe('event: note\ndata: 42\n\n')
    expect(encodeSse(sse({ config: { eventName: 'raw' } }, 'two\nlines'))).toBe(
      'event: raw\ndata: "two\\nlines"\n\n',
    )
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
