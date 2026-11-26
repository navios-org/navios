import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import { socketBuilder } from '../socket-builder.mjs'

import type { SocketClient } from '../socket-client.mjs'
import type { SocketError } from '../socket-error.mjs'

type Listener = (...args: unknown[]) => void

/**
 * Behaves like a Socket.IO client: named events, any number of listeners per
 * event, and an acknowledgement as the callback that ends `emit`'s arguments.
 */
function fakeSocketIo() {
  const listeners = new Map<string, Set<Listener>>()
  const sent: { event: string; args: unknown[] }[] = []
  const client: SocketClient = {
    emit(event, ...args) {
      sent.push({ event, args })
    },
    on(event, listener) {
      let set = listeners.get(event)
      if (!set) listeners.set(event, (set = new Set()))
      set.add(listener)
    },
    off(event, listener) {
      if (listener) listeners.get(event)?.delete(listener)
      else listeners.delete(event)
    },
  }
  return {
    client,
    sent,
    /** The server emits an event to this client. */
    receive(event: string, ...args: unknown[]) {
      for (const listener of listeners.get(event) ?? []) listener(...args)
    },
    listenerCount: (event: string) => listeners.get(event)?.size ?? 0,
    /** Calls the acknowledgement callback of the last emit, as the server would. */
    acknowledge(...args: unknown[]) {
      const callback = sent.at(-1)?.args.at(-1)
      if (typeof callback !== 'function') throw new Error('the last emit has no callback')
      callback(...args)
    },
  }
}

const camel = (value: unknown) =>
  Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, v]) => [
      key.replace(/_(\w)/g, (_, c: string) => c.toUpperCase()),
      v,
    ]),
  )
const snake = (value: unknown) =>
  Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, v]) => [
      key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`),
      v,
    ]),
  )

describe("socketBuilder({ topics: 'events' })", () => {
  it('delivers each topic from its own event, without an envelope', () => {
    const io = fakeSocketIo()
    const socket = socketBuilder({ topics: 'events' })
    socket.provideClient(io.client)
    const onMessage = socket.defineSubscribe({
      topic: 'chat.message',
      payloadSchema: z.object({ text: z.string() }),
    })
    const handler = vi.fn()

    onMessage(handler)
    io.receive('chat.message', { text: 'hi' })
    io.receive('message', ['chat.message', { text: 'envelope' }])

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith({ text: 'hi' })
    expect(io.listenerCount('message')).toBe(0)
  })

  it('listens once per topic and stops when its last subscriber leaves', () => {
    const io = fakeSocketIo()
    const socket = socketBuilder({ topics: 'events' })
    socket.provideClient(io.client)
    const onTyping = socket.defineSubscribe({ topic: 'typing' })

    const first = onTyping(() => {})
    const second = onTyping(() => {})
    expect(io.listenerCount('typing')).toBe(1)

    first()
    expect(io.listenerCount('typing')).toBe(1)
    second()
    expect(io.listenerCount('typing')).toBe(0)
  })

  it('sends a payload as the argument of the topic event', () => {
    const io = fakeSocketIo()
    const socket = socketBuilder({ topics: 'events' })
    socket.provideClient(io.client)
    const send = socket.defineSend({
      topic: 'chat.message',
      payloadSchema: z.object({ text: z.string() }),
    })

    send({ text: 'hello' })

    expect(io.sent).toEqual([{ event: 'chat.message', args: [{ text: 'hello' }] }])
  })

  it('runs formatMessage and parseMessage with the topic, for a wire format of its own', () => {
    const io = fakeSocketIo()
    const parseMessage = vi.fn((data: unknown, event: string) => ({
      topic: event,
      payload: camel(data),
    }))
    const socket = socketBuilder({
      topics: 'events',
      formatMessage: (_topic, payload) => snake(payload),
      parseMessage,
    })
    socket.provideClient(io.client)
    const send = socket.defineSend({
      topic: 'room.join',
      payloadSchema: z.object({ roomId: z.string() }),
    })
    const onJoined = socket.defineSubscribe({
      topic: 'room.joined',
      payloadSchema: z.object({ roomId: z.string(), memberCount: z.number() }),
    })
    const handler = vi.fn()
    onJoined(handler)

    send({ roomId: 'r1' })
    io.receive('room.joined', { room_id: 'r1', member_count: 3 })

    expect(io.sent[0]).toEqual({ event: 'room.join', args: [{ room_id: 'r1' }] })
    expect(parseMessage).toHaveBeenCalledWith({ room_id: 'r1', member_count: 3 }, 'room.joined')
    expect(handler).toHaveBeenCalledWith({ roomId: 'r1', memberCount: 3 })
  })

  it('waits for the acknowledgement as the emit callback, decoded by parseMessage', async () => {
    const io = fakeSocketIo()
    const socket = socketBuilder({
      topics: 'events',
      parseMessage: (data, event) => ({ topic: event, payload: camel(data) }),
    })
    socket.provideClient(io.client)
    const createRoom = socket.defineSend({
      topic: 'room.create',
      payloadSchema: z.object({ name: z.string() }),
      ackSchema: z.object({ roomId: z.string() }),
    })

    const pending = createRoom({ name: 'General' })
    await Promise.resolve()
    expect(io.sent[0]?.args[0]).toEqual({ name: 'General' })
    io.acknowledge({ room_id: 'r42' })

    await expect(pending).resolves.toEqual({ roomId: 'r42' })
    expect(io.listenerCount('__navios_ack:undefined')).toBe(0)
  })

  it('rejects an acknowledgement that fails ackSchema, and one that never comes', async () => {
    vi.useFakeTimers()
    try {
      const io = fakeSocketIo()
      const onError = vi.fn<(error: SocketError) => void>()
      const socket = socketBuilder({ topics: 'events', onError, ackTimeout: 1000 })
      socket.provideClient(io.client)
      const createRoom = socket.defineSend({
        topic: 'room.create',
        ackSchema: z.object({ roomId: z.string() }),
      })

      const invalid = createRoom({})
      await Promise.resolve()
      io.acknowledge({ roomId: 42 })
      await expect(invalid).rejects.toMatchObject({ kind: 'validation', topic: 'room.create' })

      const silent = createRoom({})
      const settled = silent.catch((error: unknown) => error)
      await vi.advanceTimersByTimeAsync(1000)
      expect(await settled).toMatchObject({ kind: 'ack-timeout' })
      expect(onError).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects a pending acknowledgement when the connection drops', async () => {
    const io = fakeSocketIo()
    const socket = socketBuilder({ topics: 'events' })
    socket.provideClient(io.client)
    const createRoom = socket.defineSend({ topic: 'room.create', ackSchema: z.any() })

    const pending = createRoom({})
    await Promise.resolve()
    io.receive('disconnect', 'transport close')

    await expect(pending).rejects.toMatchObject({ kind: 'transport' })
  })

  it('moves topic listeners to a new client, and listens for subscriptions made before one', () => {
    const socket = socketBuilder({ topics: 'events' })
    const onMessage = socket.defineSubscribe({ topic: 'chat.message' })
    const handler = vi.fn()
    onMessage(handler)

    const first = fakeSocketIo()
    socket.provideClient(first.client)
    first.receive('chat.message', 1)

    const second = fakeSocketIo()
    socket.provideClient(second.client)
    first.receive('chat.message', 2)
    second.receive('chat.message', 3)

    expect(handler.mock.calls).toEqual([[1], [3]])
    expect(first.listenerCount('chat.message')).toBe(0)
    expect(first.listenerCount('disconnect')).toBe(0)
  })

  it('reports a throwing parseMessage instead of passing it to the client', () => {
    const io = fakeSocketIo()
    const onError = vi.fn<(error: SocketError) => void>()
    const socket = socketBuilder({
      topics: 'events',
      onError,
      parseMessage: () => {
        throw new Error('bad frame')
      },
    })
    socket.provideClient(io.client)
    socket.defineSubscribe({ topic: 'chat.message' })(() => {})

    expect(() => io.receive('chat.message', {})).not.toThrow()
    expect(onError.mock.calls[0]?.[0]).toMatchObject({ kind: 'transport', topic: 'chat.message' })
  })
})

describe("socketBuilder({ topics: 'envelope' })", () => {
  it("passes 'message' as the event to parseMessage", () => {
    const io = fakeSocketIo()
    const parseMessage = vi.fn((data: unknown) => {
      const [topic, payload] = data as [string, unknown]
      return { topic, payload }
    })
    const socket = socketBuilder({ parseMessage })
    socket.provideClient(io.client)
    socket.defineSubscribe({ topic: 'a' })(() => {})

    io.receive('message', ['a', 1])

    expect(parseMessage).toHaveBeenCalledWith(['a', 1], 'message')
  })
})
