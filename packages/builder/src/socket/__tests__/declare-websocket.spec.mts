import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import { NaviosError } from '../../shared/navios-error.mjs'
import { createWebSocketHandler, declareWebSocket } from '../declare-websocket.mjs'
import { SocketError } from '../index.mjs'
import { socketBuilder } from '../socket-builder.mjs'

import type { Schema } from '../../shared/schema.mjs'

// Mock WebSocket for Node.js environment
class MockWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readyState: number = MockWebSocket.OPEN
  onopen: ((event: unknown) => void) | null = null
  onclose: ((event: unknown) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  send = vi.fn()
  close = vi.fn()

  constructor(
    readonly url: string,
    readonly protocols?: string[],
  ) {}
}

function getMock(socket: WebSocket): MockWebSocket {
  return socket as unknown as MockWebSocket
}

describe('declareWebSocket', () => {
  beforeEach(() => {
    vi.stubGlobal('WebSocket', MockWebSocket)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should build the URL from Zod url and query schemas', () => {
    const chatSocket = createWebSocketHandler({ baseUrl: 'wss://api.example.com' })({
      url: '/ws/$roomId',
      urlParamsSchema: z.object({ roomId: z.string() }),
      querySchema: z.object({ token: z.string() }),
    })

    const handle = chatSocket({ urlParams: { roomId: 'abc' }, params: { token: 't' } })

    expect(handle.url).toBe('wss://api.example.com/ws/abc?token=t')
    expect(handle.socket.url).toBe('wss://api.example.com/ws/abc?token=t')
    expect(() => chatSocket({ urlParams: { roomId: 1 as any }, params: { token: 't' } })).toThrow(
      z.ZodError,
    )
  })

  it('should accept non-Zod schemas for URL and query parameters', () => {
    const urlParamsSchema: Schema<{ roomId: string }, { roomId: string }> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: (value) => {
          const roomId = (value as { roomId?: unknown }).roomId
          return typeof roomId === 'string' && roomId.length > 0
            ? { value: { roomId: roomId.toUpperCase() } }
            : { issues: [{ message: 'roomId is required' }] }
        },
      },
    }
    const querySchema: Schema<{ token: string }, { token: string }> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: (value) => ({ value: value as { token: string } }),
      },
    }
    const chatSocket = declareWebSocket({ url: '/ws/$roomId', urlParamsSchema, querySchema })

    const handle = chatSocket({ urlParams: { roomId: 'abc' }, params: { token: 't' } })
    expect(handle.url).toBe('/ws/ABC?token=t')
    expect(() => chatSocket({ urlParams: { roomId: '' }, params: { token: 't' } })).toThrow(
      'roomId is required',
    )
  })

  it('should refuse a schema that validates asynchronously', () => {
    const querySchema: Schema<{ token: string }, { token: string }> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: async (value) => ({ value: value as { token: string } }),
      },
    }
    const chatSocket = declareWebSocket({ url: '/ws', querySchema })

    expect(() => chatSocket({ params: { token: 't' } })).toThrow(NaviosError)
    expect(() => chatSocket({ params: { token: 't' } })).toThrow('asynchronous schemas')
  })

  it('should report a throwing listener as a transport SocketError', () => {
    const onError = vi.fn()
    const handle = createWebSocketHandler({ onError })({ url: '/ws' })({})

    const listenerError = new Error('listener exploded')
    const sibling = vi.fn()
    handle.on('chat.message', () => {
      throw listenerError
    })
    handle.on('chat.message', sibling)

    getMock(handle.socket).onmessage!({ data: JSON.stringify(['chat.message', { text: 'Hi' }]) })

    expect(sibling).toHaveBeenCalledWith({ text: 'Hi' })
    expect(onError).toHaveBeenCalledTimes(1)
    const error = onError.mock.calls[0]![0] as SocketError
    expect(error).toBeInstanceOf(SocketError)
    expect(error.kind).toBe('transport')
    expect(error.topic).toBe('chat.message')
    expect(error.url).toBe('/ws')
    expect(error.cause).toBe(listenerError)
  })

  it('should report a failed send as a transport SocketError', () => {
    const onError = vi.fn()
    const handle = createWebSocketHandler({ onError })({ url: '/ws' })({})
    const sendError = new Error('socket is closed')
    getMock(handle.socket).send.mockImplementation(() => {
      throw sendError
    })

    expect(() => handle.emit('chat.message', { text: 'Hi' })).not.toThrow()

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'transport', topic: 'chat.message', cause: sendError }),
    )
  })

  it('should keep dispatching when onError throws', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const handle = createWebSocketHandler({
      onError: () => {
        throw new Error('hook exploded')
      },
    })({ url: '/ws' })({})

    const sibling = vi.fn()
    handle.on('message', () => {
      throw new Error('listener exploded')
    })
    handle.on('message', sibling)

    expect(() => getMock(handle.socket).onmessage!({ data: '"ping"' })).not.toThrow()
    expect(sibling).toHaveBeenCalledWith('ping')
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })

  /** A Standard Schema that passes its input through, so tests can use any value. */
  function passthrough(): Schema<Record<string, unknown>, Record<string, unknown>> {
    return {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: (value) => ({ value: value as Record<string, unknown> }),
      },
    }
  }

  describe('query string', () => {
    it('should serialize dates as ISO strings and arrays as repeated keys', () => {
      const chatSocket = declareWebSocket({ url: '/ws', querySchema: passthrough() })

      const handle = chatSocket({
        params: {
          since: new Date('2024-01-02T03:04:05.678Z'),
          tag: ['urgent', 'bug'],
          skipped: undefined,
          empty: null,
        },
      })

      expect(handle.url).toBe('/ws?since=2024-01-02T03%3A04%3A05.678Z&tag=urgent&tag=bug')
    })

    it('should append to a query string the URL template already has', () => {
      const chatSocket = createWebSocketHandler({ baseUrl: 'wss://api.example.com' })({
        url: '/ws/$roomId?v=2',
        querySchema: passthrough(),
      })

      const handle = chatSocket({ urlParams: { roomId: 'abc' }, params: { token: 't' } })

      expect(handle.url).toBe('wss://api.example.com/ws/abc?v=2&token=t')
    })
  })

  describe('wire format', () => {
    it('should encode emit as [event, payload] whatever the shape of the payload', () => {
      const handle = declareWebSocket({ url: '/ws' })({})
      const send = getMock(handle.socket).send

      handle.emit('chat.tags', ['urgent', 'bug'])
      handle.emit('chat.tags', ['urgent'])
      handle.emit('chat.message', { text: 'hi' })
      handle.emit('ping')

      expect(send.mock.calls.map((call) => call[0])).toEqual([
        '["chat.tags",["urgent","bug"]]',
        '["chat.tags",["urgent"]]',
        '["chat.message",{"text":"hi"}]',
        '["ping"]',
      ])
    })

    it('should send a message from a custom formatMessage exactly as formatted', () => {
      const handle = declareWebSocket({ url: '/ws' })({})
      const socket = socketBuilder({
        formatMessage: (topic, payload) => ({ type: topic, data: payload }),
      })
      socket.provideClient(handle)

      socket.defineSend({ topic: 'chat.message' })({ text: 'hi' })

      expect(getMock(handle.socket).send).toHaveBeenCalledWith(
        '{"type":"chat.message","data":{"text":"hi"}}',
      )
    })

    it('should keep the default socketBuilder wire output', async () => {
      const handle = declareWebSocket({ url: '/ws' })({})
      const mock = getMock(handle.socket)
      const socket = socketBuilder({ ackTimeout: 50 })
      socket.provideClient(handle)

      socket.defineSend({ topic: 'chat.message' })({ text: 'hi' })
      socket.defineSend({ topic: 'chat.tags' })(['urgent', 'bug'])
      const promise = socket.defineSend({
        topic: 'chat.create',
        ackSchema: z.object({ id: z.string() }),
      })({ text: 'hi' })

      expect(mock.send.mock.calls[0]![0]).toBe('["chat.message",{"text":"hi"}]')
      expect(mock.send.mock.calls[1]![0]).toBe('["chat.tags",["urgent","bug"]]')
      const [topic, payload, ackId] = JSON.parse(mock.send.mock.calls[2]![0] as string)
      expect([topic, payload]).toEqual(['chat.create', { text: 'hi' }])
      expect(mock.send.mock.calls[2]![0]).toBe(`["chat.create",{"text":"hi"},"${ackId}"]`)

      mock.onmessage!({ data: JSON.stringify([`__navios_ack:${ackId}`, { id: 'm1' }]) })
      await expect(promise).resolves.toEqual({ id: 'm1' })
    })

    it('should resolve an ack in a custom wire format end to end', async () => {
      const handle = declareWebSocket({ url: '/ws' })({})
      const mock = getMock(handle.socket)
      const socket = socketBuilder({
        ackTimeout: 50,
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
      })
      socket.provideClient(handle)

      const promise = socket.defineSend({
        topic: 'chat.message',
        ackSchema: z.object({ id: z.string() }),
      })({ text: 'hi' })

      const sent = JSON.parse(mock.send.mock.calls[0]![0] as string)
      expect(sent).toEqual({
        type: 'chat.message',
        data: { text: 'hi' },
        requestId: expect.any(String),
      })
      mock.onmessage!({
        data: JSON.stringify({
          type: 'chat.message',
          data: { id: 'm1' },
          requestId: sent.requestId,
        }),
      })

      await expect(promise).resolves.toEqual({ id: 'm1' })
    })
  })

  describe('topics named like lifecycle events', () => {
    it('should not run lifecycle listeners for a server topic of the same name', () => {
      const handle = declareWebSocket({ url: '/ws' })({})
      const mock = getMock(handle.socket)
      const listeners = {
        open: vi.fn(),
        connect: vi.fn(),
        close: vi.fn(),
        disconnect: vi.fn(),
        error: vi.fn(),
        connect_error: vi.fn(),
      }
      for (const [event, listener] of Object.entries(listeners)) {
        handle.on(event, listener)
      }

      for (const event of Object.keys(listeners)) {
        mock.onmessage!({ data: JSON.stringify([event, { reason: 'from server' }]) })
      }

      for (const listener of Object.values(listeners)) {
        expect(listener).not.toHaveBeenCalled()
      }

      // The real lifecycle events still reach them
      const closeEvent = { code: 1000, reason: 'bye' }
      mock.onclose!(closeEvent)
      expect(listeners.close).toHaveBeenCalledTimes(1)
      expect(listeners.close).toHaveBeenCalledWith(closeEvent)
      expect(listeners.disconnect).toHaveBeenCalledWith('bye')
    })

    it('should deliver a frame for the topic "message" to message listeners once', () => {
      const handle = declareWebSocket({ url: '/ws' })({})
      const listener = vi.fn()
      handle.on('message', listener)

      getMock(handle.socket).onmessage!({ data: JSON.stringify(['message', 'hi']) })

      expect(listener).toHaveBeenCalledTimes(1)
      expect(listener).toHaveBeenCalledWith(['message', 'hi'])
    })

    it('should subscribe to a topic named like a lifecycle event with onTopic', () => {
      const handle = declareWebSocket({ url: '/ws' })({})
      const mock = getMock(handle.socket)
      const onClose = vi.fn()
      const onMessage = vi.fn()
      const unsubscribe = handle.onTopic('close', onClose)
      handle.onTopic('message', onMessage)

      mock.onmessage!({ data: JSON.stringify(['close', { roomId: 'abc' }]) })
      mock.onmessage!({ data: JSON.stringify(['message', 'hi']) })
      // A real close event is not a topic message
      mock.onclose!({ code: 1000, reason: 'bye' })

      expect(onClose).toHaveBeenCalledTimes(1)
      expect(onClose).toHaveBeenCalledWith({ roomId: 'abc' })
      expect(onMessage).toHaveBeenCalledTimes(1)
      expect(onMessage).toHaveBeenCalledWith('hi')

      unsubscribe()
      mock.onmessage!({ data: JSON.stringify(['close', { roomId: 'abc' }]) })
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('should share ordinary topics between on and onTopic', () => {
      const handle = declareWebSocket({ url: '/ws' })({})
      const viaOn = vi.fn()
      const viaOnTopic = vi.fn()
      handle.on('chat.message', viaOn)
      handle.onTopic('chat.message', viaOnTopic)

      getMock(handle.socket).onmessage!({ data: JSON.stringify(['chat.message', { text: 'Hi' }]) })

      expect(viaOn).toHaveBeenCalledWith({ text: 'Hi' })
      expect(viaOnTopic).toHaveBeenCalledWith({ text: 'Hi' })
    })

    it('should route a socketBuilder subscription for the topic "close" by topic only', () => {
      const handle = declareWebSocket({ url: '/ws' })({})
      const mock = getMock(handle.socket)
      const socket = socketBuilder()
      socket.provideClient(handle)
      const subscriber = vi.fn()
      socket.defineSubscribe({ topic: 'close' })(subscriber)

      mock.onmessage!({ data: JSON.stringify(['close', { roomId: 'abc' }]) })
      mock.onclose!({ code: 1000, reason: 'bye' })

      expect(subscriber).toHaveBeenCalledTimes(1)
      expect(subscriber).toHaveBeenCalledWith({ roomId: 'abc' })
    })
  })
})
