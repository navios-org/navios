import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import { SocketError } from '../index.mjs'
import { socketBuilder } from '../socket-builder.mjs'

import type { SocketClient } from '../types/socket-client.mjs'
import type { SocketBuilderConfig } from '../types/socket-options.mjs'

type Listener = (...args: unknown[]) => void

function createMockClient() {
  const handlers = new Map<string, Set<Listener>>()
  const emit = vi.fn<(event: string, ...args: unknown[]) => void>()
  const on = vi.fn((event: string, handler: Listener) => {
    if (!handlers.has(event)) {
      handlers.set(event, new Set())
    }
    handlers.get(event)!.add(handler)
  })
  const off = vi.fn((event: string, handler?: Listener) => {
    if (handler) {
      handlers.get(event)?.delete(handler)
    } else {
      handlers.delete(event)
    }
  })
  const client: SocketClient = { emit, on, off, url: 'wss://example.test/ws' }
  return {
    client,
    emit,
    on,
    off,
    handlers,
    /** Delivers a raw frame to the `'message'` listeners, as a transport would. */
    receive(data: unknown) {
      handlers.get('message')?.forEach((handler) => handler(data))
    },
    /** Names of the `__navios_ack:<id>` events that still have a listener. */
    ackListeners() {
      return [...handlers.entries()]
        .filter(([event, set]) => event.startsWith('__navios_ack:') && set.size > 0)
        .map(([event]) => event)
    },
  }
}

/** The object wire format from the README "Custom Wire Format" example. */
const objectWireFormat: Pick<SocketBuilderConfig, 'formatMessage' | 'parseMessage'> = {
  formatMessage: (topic, payload, ackId) => ({
    type: topic,
    data: payload,
    ...(ackId && { requestId: ackId }),
  }),
  parseMessage: (msg) => {
    if (typeof msg === 'object' && msg && 'type' in msg) {
      const message = msg as { type: string; data: unknown; requestId?: string }
      return { topic: message.type, payload: message.data, ackId: message.requestId }
    }
    return null
  },
}

const payloadSchema = z.object({ text: z.string() })
const ackSchema = z.object({ id: z.string() })

describe('socketBuilder transport', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  describe('acknowledgements in a custom wire format', () => {
    it('should resolve a pending ack from the ackId that parseMessage returns', async () => {
      const onError = vi.fn()
      const socket = socketBuilder({ ...objectWireFormat, onError, ackTimeout: 50 })
      const mock = createMockClient()
      socket.provideClient(mock.client)

      const subscriber = vi.fn()
      socket.defineSubscribe({ topic: 'chat.message' })(subscriber)
      const createMessage = socket.defineSend({ topic: 'chat.message', payloadSchema, ackSchema })

      const promise = createMessage({ text: 'hi' })
      const sent = mock.emit.mock.calls[0]![1] as { type: string; requestId: string }
      expect(sent).toEqual({
        type: 'chat.message',
        data: { text: 'hi' },
        requestId: expect.any(String),
      })

      mock.receive({ type: 'chat.message', data: { id: 'm1' }, requestId: sent.requestId })

      await expect(promise).resolves.toEqual({ id: 'm1' })
      // The reply is an acknowledgement, not a message for the topic's subscribers
      expect(subscriber).not.toHaveBeenCalled()
      expect(mock.ackListeners()).toEqual([])
      expect(onError).not.toHaveBeenCalled()
    })

    it('should resolve the ack without any subscriber being defined', async () => {
      const socket = socketBuilder({ ...objectWireFormat, ackTimeout: 50 })
      const mock = createMockClient()
      socket.provideClient(mock.client)

      const promise = socket.defineSend({ topic: 'chat.message', payloadSchema, ackSchema })({
        text: 'hi',
      })
      const sent = mock.emit.mock.calls[0]![1] as { requestId: string }
      mock.receive({ type: 'chat.message', data: { id: 'm1' }, requestId: sent.requestId })

      await expect(promise).resolves.toEqual({ id: 'm1' })
    })

    it('should validate an ack that arrives through parseMessage and settle it once', async () => {
      const onError = vi.fn()
      const socket = socketBuilder({ ...objectWireFormat, onError, ackTimeout: 50 })
      const mock = createMockClient()
      socket.provideClient(mock.client)

      const promise = socket.defineSend({ topic: 'chat.message', payloadSchema, ackSchema })({
        text: 'hi',
      })
      const sent = mock.emit.mock.calls[0]![1] as { requestId: string }
      const ackListener = [...mock.handlers.get(`__navios_ack:${sent.requestId}`)!][0]!

      mock.receive({ type: 'chat.message', data: { id: 42 }, requestId: sent.requestId })
      // The same acknowledgement arriving again, on either path, is ignored
      mock.receive({ type: 'chat.message', data: { id: 42 }, requestId: sent.requestId })
      ackListener({ id: 42 })

      const error = await promise.catch((reason: unknown) => reason)
      expect(error).toBeInstanceOf(SocketError)
      expect((error as SocketError).kind).toBe('validation')
      expect((error as SocketError).rawData).toEqual({ id: 42 })
      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError.mock.calls[0]![0]).toBe(error)
    })

    it('should hand a formatted message to sendRaw when the client has one', () => {
      const socket = socketBuilder(objectWireFormat)
      const mock = createMockClient()
      const sendRaw = vi.fn()
      socket.provideClient({ ...mock.client, sendRaw })

      socket.defineSend({ topic: 'chat.message', payloadSchema })({ text: 'hi' })

      expect(sendRaw).toHaveBeenCalledWith('chat.message', {
        type: 'chat.message',
        data: { text: 'hi' },
      })
      expect(mock.emit).not.toHaveBeenCalled()
    })
  })

  describe('a send that fails to leave', () => {
    it('should reject a send with ack as a transport SocketError when emit throws', async () => {
      vi.useFakeTimers()
      const onError = vi.fn()
      const socket = socketBuilder({ onError, ackTimeout: 1000 })
      const mock = createMockClient()
      const emitError = new Error('socket is closed')
      mock.emit.mockImplementation(() => {
        throw emitError
      })
      socket.provideClient(mock.client)

      const promise = socket.defineSend({ topic: 'chat.message', payloadSchema, ackSchema })({
        text: 'hi',
      })
      const error = await promise.catch((reason: unknown) => reason)

      expect(error).toBeInstanceOf(SocketError)
      expect((error as SocketError).kind).toBe('transport')
      expect((error as SocketError).topic).toBe('chat.message')
      expect((error as SocketError).url).toBe('wss://example.test/ws')
      expect((error as SocketError).cause).toBe(emitError)
      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError.mock.calls[0]![0]).toBe(error)

      // Listener and timer are gone
      expect(mock.ackListeners()).toEqual([])
      expect(vi.getTimerCount()).toBe(0)

      // No false ack-timeout later
      await vi.advanceTimersByTimeAsync(5000)
      expect(onError).toHaveBeenCalledTimes(1)

      // The pending ack was removed: replacing the client has nothing to reject
      socket.provideClient(createMockClient().client)
      expect(onError).toHaveBeenCalledTimes(1)
    })

    it('should reject a send with ack as a transport SocketError when formatMessage throws', async () => {
      vi.useFakeTimers()
      const onError = vi.fn()
      const formatError = new Error('cannot format')
      const socket = socketBuilder({
        onError,
        ackTimeout: 1000,
        formatMessage: () => {
          throw formatError
        },
      })
      const mock = createMockClient()
      socket.provideClient(mock.client)

      const promise = socket.defineSend({ topic: 'chat.message', payloadSchema, ackSchema })({
        text: 'hi',
      })
      const error = await promise.catch((reason: unknown) => reason)

      expect(error).toBeInstanceOf(SocketError)
      expect((error as SocketError).kind).toBe('transport')
      expect((error as SocketError).cause).toBe(formatError)
      expect(mock.emit).not.toHaveBeenCalled()
      expect(mock.ackListeners()).toEqual([])
      expect(vi.getTimerCount()).toBe(0)

      await vi.advanceTimersByTimeAsync(5000)
      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError.mock.calls[0]![0]).toBe(error)
    })

    it('should throw a transport SocketError from a fire-and-forget send when emit throws', () => {
      const onError = vi.fn()
      const socket = socketBuilder({ onError })
      const mock = createMockClient()
      const emitError = new Error('socket is closed')
      mock.emit.mockImplementation(() => {
        throw emitError
      })
      socket.provideClient(mock.client)
      const send = socket.defineSend({ topic: 'chat.typing', payloadSchema })

      let thrown: unknown
      try {
        send({ text: 'hi' })
      } catch (error) {
        thrown = error
      }

      expect(thrown).toBeInstanceOf(SocketError)
      expect((thrown as SocketError).kind).toBe('transport')
      expect((thrown as SocketError).topic).toBe('chat.typing')
      expect((thrown as SocketError).cause).toBe(emitError)
      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError.mock.calls[0]![0]).toBe(thrown)
    })
  })

  describe('provideClient', () => {
    it('should remove pending ack listeners from the client it replaces', async () => {
      const onError = vi.fn()
      const socket = socketBuilder({ onError, ackTimeout: 1000 })
      const first = createMockClient()
      socket.provideClient(first.client)

      const promise = socket.defineSend({ topic: 'chat.message', payloadSchema, ackSchema })({
        text: 'hi',
      })
      const ackId = (first.emit.mock.calls[0]![1] as unknown[])[2] as string
      const ackTopic = `__navios_ack:${ackId}`
      const listener = [...first.handlers.get(ackTopic)!][0]!

      socket.provideClient(createMockClient().client)

      expect(first.off).toHaveBeenCalledWith(ackTopic, listener)
      expect(first.ackListeners()).toEqual([])
      await expect(promise).rejects.toMatchObject({ kind: 'transport', topic: 'chat.message' })
      expect(onError).toHaveBeenCalledTimes(1)
    })
  })
})
