import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import { NaviosError } from '../../shared/navios-error.mjs'
import { createWebSocketHandler, declareWebSocket } from '../declare-websocket.mjs'
import { socketBuilder } from '../socket-builder.mjs'

import type { SocketClient } from '../socket-client.mjs'

/** Behaves like the standard: `send` throws only while connecting, and loses the rest silently. */
class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  readyState = 1
  onopen: ((event: unknown) => void) | null = null
  onclose: ((event: unknown) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  sent: string[] = []

  constructor(
    readonly url: string,
    readonly protocols?: string[],
  ) {
    FakeWebSocket.instances.push(this)
  }

  send(data: string) {
    if (this.readyState === 0) throw new DOMException('CONNECTING', 'InvalidStateError')
    if (this.readyState === 1) this.sent.push(data)
  }

  close() {
    this.readyState = 2
  }

  drop(reason = '') {
    this.readyState = 3
    this.onclose?.({ code: 1006, reason })
  }

  receive(frame: unknown) {
    this.onmessage?.({ data: JSON.stringify(frame) })
  }
}

function connect(onError?: (error: unknown) => void) {
  const handle = createWebSocketHandler({ WebSocket: FakeWebSocket, onError })({ url: '/ws' })()
  return { handle, ws: FakeWebSocket.instances.at(-1)! }
}

/** With the class as the one of the platform, which the builder knows to lose frames. */
function connectPlatform(onError?: (error: unknown) => void) {
  vi.stubGlobal('WebSocket', FakeWebSocket)
  const handle = createWebSocketHandler({ onError })({ url: '/ws' })()
  return { handle, ws: FakeWebSocket.instances.at(-1)! }
}

function memoryClient() {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>()
  const client = {
    emit: vi.fn(),
    on: (event: string, handler: (...args: unknown[]) => void) => {
      listeners.set(event, (listeners.get(event) ?? new Set()).add(handler))
    },
    off: (event: string, handler?: (...args: unknown[]) => void) => {
      if (handler) listeners.get(event)?.delete(handler)
      else listeners.delete(event)
    },
    close: vi.fn(),
    deliver: (event: string, ...args: unknown[]) =>
      [...(listeners.get(event) ?? [])].forEach((handler) => handler(...args)),
    count: (event: string) => listeners.get(event)?.size ?? 0,
  }
  return client satisfies SocketClient
}

describe('a socket that cannot send', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([
    ['connecting', 0],
    ['closing', 2],
    ['closed', 3],
  ])('should throw from emit and sendRaw while %s', (_name, readyState) => {
    const onError = vi.fn()
    const { handle, ws } = connectPlatform(onError)
    ws.readyState = readyState

    const transport = expect.objectContaining({ kind: 'transport', topic: 'x' })
    expect(() => handle.emit('x', 1)).toThrow(transport)
    expect(() => handle.sendRaw('x', ['x', 1])).toThrow(transport)
    expect(onError).toHaveBeenCalledTimes(2)
  })

  it('should fail both kinds of send at once', async () => {
    const { handle, ws } = connectPlatform()
    ws.drop()
    const socket = socketBuilder()
    socket.provideClient(handle)

    expect(() => socket.defineSend({ topic: 'x' })(1)).toThrow(
      expect.objectContaining({ kind: 'transport' }),
    )
    await expect(socket.defineSend({ topic: 'x', ackSchema: z.any() })(1)).rejects.toMatchObject({
      kind: 'transport',
    })
  })
})

describe('a socket of a class of the caller', () => {
  it('should be given what is sent while it reconnects', () => {
    // Like `reconnecting-websocket`: keeps frames until it is open again
    class Reconnecting extends FakeWebSocket {
      queue: string[] = []
      override send(data: string) {
        if (this.readyState === 1) this.sent.push(data)
        else this.queue.push(data)
      }
    }
    const onError = vi.fn()
    const declare = createWebSocketHandler({ WebSocket: Reconnecting, onError })
    const handle = declare({ url: '/ws' })()
    const ws = FakeWebSocket.instances.at(-1) as Reconnecting
    const socket = socketBuilder({ onError })
    socket.provideClient(handle)
    const send = socket.defineSend({ topic: 'x' })

    for (const readyState of [0, 2, 3]) {
      ws.readyState = readyState
      send(readyState)
    }

    expect(ws.queue).toEqual(['["x",0]', '["x",2]', '["x",3]'])
    expect(onError).not.toHaveBeenCalled()
  })

  it('should report what it refuses', () => {
    const onError = vi.fn()
    const { handle, ws } = connect(onError)
    ws.readyState = 0

    expect(() => handle.emit('x', 1)).toThrow(
      expect.objectContaining({ kind: 'transport', topic: 'x' }),
    )
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('should report what it passes to a callback, like ws does once it is closed', () => {
    class Ws extends FakeWebSocket {
      override send(_data: string, done?: (error?: Error) => void) {
        done?.(this.readyState === 1 ? undefined : new Error('WebSocket is not open'))
      }
    }
    const onError = vi.fn()
    const handle = createWebSocketHandler({ WebSocket: Ws, onError })({ url: '/ws' })()
    handle.emit('x', 1)
    expect(onError).not.toHaveBeenCalled()

    FakeWebSocket.instances.at(-1)!.drop()
    handle.emit('x', 1)

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0]![0]).toMatchObject({ kind: 'transport', topic: 'x' })
    expect(onError.mock.calls[0]![0].cause.message).toBe('WebSocket is not open')
  })
})

describe('acknowledgements', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should leave nothing behind for a topic without listeners', async () => {
    const sizes: number[] = []
    const set = vi.spyOn(Map.prototype, 'set')
    try {
      const { handle, ws } = connect()
      const socket = socketBuilder()
      socket.provideClient(handle)
      const send = socket.defineSend({ topic: 'x', ackSchema: z.any() })
      for (let i = 0; i < 3; i++) {
        const pending = send(i)
        const [, , ackId] = JSON.parse(ws.sent.at(-1) as string) as [string, unknown, string]
        ws.receive([`__navios_ack:${ackId}`, 'ok'])
        await pending
        const registry = set.mock.contexts.find((_map, call) =>
          String(set.mock.calls[call]![0]).startsWith('__navios_ack:'),
        )
        sizes.push((registry as Map<unknown, unknown>).size)
      }
      const off = handle.onTopic('topic', () => {})
      off()
      const registry = set.mock.contexts[set.mock.calls.findIndex(([key]) => key === 'topic')]
      sizes.push((registry as Map<unknown, unknown>).size)
    } finally {
      set.mockRestore()
    }

    expect(sizes).toEqual([0, 0, 0, 0])
  })

  it.each([Infinity, 2 ** 31])(
    'should be awaited without limit for ackTimeout %d',
    async (ackTimeout) => {
      const { handle, ws } = connect()
      const socket = socketBuilder({ ackTimeout })
      socket.provideClient(handle)

      const pending = socket.defineSend({ topic: 'x', ackSchema: z.any() })(1)
      await vi.advanceTimersByTimeAsync(60_000)
      const [, , ackId] = JSON.parse(ws.sent.at(-1) as string) as [string, unknown, string]
      ws.receive([`__navios_ack:${ackId}`, 'ok'])

      expect(await pending).toBe('ok')
      expect(vi.getTimerCount()).toBe(0)
    },
  )

  it('should be given up when the socket closes', async () => {
    const onError = vi.fn()
    const { handle, ws } = connect()
    const socket = socketBuilder({ onError })
    socket.provideClient(handle)

    const pending = socket.defineSend({ topic: 'x', ackSchema: z.any() })(1)
    ws.drop()

    await expect(pending).rejects.toMatchObject({
      kind: 'transport',
      topic: 'x',
      message: expect.stringContaining('closed'),
    })
    expect(onError).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('should reject, not throw, when the payload is invalid or there is no client', async () => {
    const socket = socketBuilder()
    const send = socket.defineSend({
      topic: 'x',
      payloadSchema: z.object({ a: z.string() }),
      ackSchema: z.any(),
    })

    await expect(send({ a: 'x' })).rejects.toBeInstanceOf(NaviosError)
    socket.provideClient(memoryClient())
    await expect(send({ a: 1 as never })).rejects.toMatchObject({ kind: 'validation' })
  })

  it('should not be a function passed to emit', () => {
    const { handle, ws } = connect()

    expect(() => handle.emit('x', 1, () => {})).toThrow(/ackSchema/)
    expect(ws.sent).toEqual([])
  })
})

describe('listeners that change while a message is delivered', () => {
  it('should let a subscriber subscribe itself again', () => {
    const client = memoryClient()
    const socket = socketBuilder()
    socket.provideClient(client)
    const onTopic = socket.defineSubscribe({ topic: 't' })
    let calls = 0
    onTopic(() => {}) // keeps the set of subscribers alive
    const again = () => {
      if (++calls > 10) throw new Error('runaway')
      stop()
      stop = onTopic(again)
    }
    let stop = onTopic(again)

    client.deliver('message', ['t', 1])
    expect(calls).toBe(1)
    client.deliver('message', ['t', 2])
    expect(calls).toBe(2)
  })

  it('should not call a subscriber that was removed before its turn', () => {
    const client = memoryClient()
    const socket = socketBuilder()
    socket.provideClient(client)
    const onTopic = socket.defineSubscribe({ topic: 't' })
    const second = vi.fn()
    onTopic(() => stopSecond())
    const stopSecond = onTopic(second)

    client.deliver('message', ['t', 1])

    expect(second).not.toHaveBeenCalled()
  })

  it('should let a listener of a handle register itself again', () => {
    const { handle, ws } = connect()
    let calls = 0
    const again = () => {
      if (++calls > 10) throw new Error('runaway')
      handle.off('t', again)
      handle.on('t', again)
    }
    const removed = vi.fn()
    handle.on('t', again)
    handle.on('t', () => handle.off('u'))
    handle.on('u', () => handle.off('u'))
    handle.on('u', removed)

    ws.receive(['t', 1])
    expect(calls).toBe(1)

    handle.on('u', () => handle.off('u'))
    handle.on('u', removed)
    ws.receive(['u', 1])
    expect(removed).not.toHaveBeenCalled()
  })
})

describe('provideClient', () => {
  it('should ignore the client it already has', async () => {
    const client = memoryClient()
    const socket = socketBuilder()
    socket.provideClient(client)
    const subscriber = vi.fn()
    socket.defineSubscribe({ topic: 't' })(subscriber)
    const pending = socket.defineSend({ topic: 'x', ackSchema: z.any() })(1)
    const [, frame] = client.emit.mock.calls[0]!

    socket.provideClient(client, { closePrevious: true })
    client.deliver('message', ['t', 1])
    client.deliver(`__navios_ack:${(frame as unknown[])[2] as string}`, 'ok')

    expect(client.close).not.toHaveBeenCalled()
    expect(subscriber).toHaveBeenCalledTimes(1)
    await expect(pending).resolves.toBe('ok')
  })

  it('should close the previous client only when asked to', () => {
    const [first, second, third] = [memoryClient(), memoryClient(), memoryClient()]
    const socket = socketBuilder()
    socket.provideClient(first)
    socket.provideClient(second)
    expect(first.close).not.toHaveBeenCalled()

    socket.provideClient(third, { closePrevious: true })
    expect(second.close).toHaveBeenCalledTimes(1)
  })

  it('should attach subscriptions made before there was a client', () => {
    const client = memoryClient()
    const socket = socketBuilder()
    const subscriber = vi.fn()
    socket.defineSubscribe({ topic: 't' })(subscriber)

    socket.provideClient(client)
    client.deliver('message', ['t', 1])

    expect(subscriber).toHaveBeenCalledWith(1)
  })

  it('should leave no listener on the previous client', () => {
    const [first, second] = [memoryClient(), memoryClient()]
    const socket = socketBuilder()
    socket.provideClient(first)
    socket.defineSubscribe({ topic: 't' })(() => {})

    socket.provideClient(second)

    expect([first.count('message'), first.count('disconnect')]).toEqual([0, 0])
    expect([second.count('message'), second.count('disconnect')]).toEqual([1, 1])
  })
})

describe('parseMessage', () => {
  it('should not let what it throws reach the client', () => {
    const client = memoryClient()
    const onError = vi.fn()
    const cause = new Error('cannot parse')
    const socket = socketBuilder({
      onError,
      parseMessage: () => {
        throw cause
      },
    })
    socket.provideClient(client)
    socket.defineSubscribe({ topic: 't' })(() => {})

    expect(() => client.deliver('message', 'bad')).not.toThrow()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0]![0]).toMatchObject({
      kind: 'transport',
      topic: 'message',
      rawData: 'bad',
      cause,
    })
  })
})

describe('connecting', () => {
  it.each([
    ['an optional schema', z.object({ room: z.string() }).optional(), '/ws'],
    ['a default', z.object({ room: z.string() }).default({ room: 'lobby' }), '/ws?room=lobby'],
  ])('should accept an omitted query: %s', (_name, querySchema, url) => {
    const declare = createWebSocketHandler({ WebSocket: FakeWebSocket })

    expect(declare({ url: '/ws', querySchema })().url).toBe(url)
  })

  it('should validate an omitted query', () => {
    const declare = createWebSocketHandler({ WebSocket: FakeWebSocket })
    const withDefault = declare({
      url: '/ws',
      querySchema: z.object({ room: z.string().default('lobby') }),
    })
    const required = declare({ url: '/ws', querySchema: z.object({ room: z.string() }) })

    expect(withDefault().url).toBe('/ws?room=lobby')
    expect(withDefault({}).url).toBe('/ws?room=lobby')
    expect(() => (required as unknown as () => void)()).toThrow(z.ZodError)
  })

  it('should use the given constructor, with protocols, where there is no global one', () => {
    vi.stubGlobal('WebSocket', undefined)
    try {
      const { handle, ws } = connect()
      expect(handle.connected).toBe(true)
      expect(handle.state).toBe('open')
      ws.readyState = 0
      expect(handle.state).toBe('connecting')

      createWebSocketHandler({ WebSocket: FakeWebSocket })({ url: '/p', protocols: ['v1'] })()
      expect(FakeWebSocket.instances.at(-1)).toMatchObject({ url: '/p', protocols: ['v1'] })

      expect(() => declareWebSocket({ url: '/ws' })()).toThrow(/createWebSocketHandler/)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
