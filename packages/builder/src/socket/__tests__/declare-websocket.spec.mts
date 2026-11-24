import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import { NaviosError } from '../../errors/index.mjs'
import { SocketError } from '../index.mjs'
import { createWebSocketHandler, declareWebSocket } from '../websocket/declare-websocket.mjs'

import type { Schema } from '../../types/schema.mjs'

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
})
