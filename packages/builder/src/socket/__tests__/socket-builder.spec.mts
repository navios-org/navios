import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import { NaviosError } from '../../errors/index.mjs'
import { socketBuilder } from '../socket-builder.mjs'

import type { SocketClient } from '../types/socket-client.mjs'

describe('socketBuilder', () => {
  const payloadSchema = z.object({
    text: z.string(),
  })

  const ackSchema = z.object({
    id: z.string(),
    createdAt: z.string(),
  })

  const subscribePayloadSchema = z.object({
    text: z.string(),
    from: z.string(),
    timestamp: z.number(),
  })

  function createMockClient(): SocketClient & {
    emitMock: ReturnType<typeof vi.fn>
    onMock: ReturnType<typeof vi.fn>
    offMock: ReturnType<typeof vi.fn>
    handlers: Map<string, Set<(...args: unknown[]) => void>>
  } {
    const handlers = new Map<string, Set<(...args: unknown[]) => void>>()

    const emitMock = vi.fn()
    const onMock = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!handlers.has(event)) {
        handlers.set(event, new Set())
      }
      handlers.get(event)!.add(handler)
    })
    const offMock = vi.fn((event: string, handler?: (...args: unknown[]) => void) => {
      if (handler) {
        handlers.get(event)?.delete(handler)
      } else {
        handlers.delete(event)
      }
    })

    return {
      emit: emitMock,
      on: onMock,
      off: offMock,
      emitMock,
      onMock,
      offMock,
      handlers,
    }
  }

  // Helper to simulate receiving a message
  function simulateMessage(client: ReturnType<typeof createMockClient>, data: unknown) {
    const messageHandlers = client.handlers.get('message')
    if (messageHandlers) {
      messageHandlers.forEach((handler) => handler(data))
    }
  }

  // Helper to simulate ack response
  function simulateAck(client: ReturnType<typeof createMockClient>, ackId: string, data: unknown) {
    const ackTopic = `__navios_ack:${ackId}`
    const ackHandlers = client.handlers.get(ackTopic)
    if (ackHandlers) {
      ackHandlers.forEach((handler) => handler(data))
    }
  }

  describe('builder creation', () => {
    it('should create a socket builder instance', () => {
      const socket = socketBuilder()

      expect(socket).toHaveProperty('provideClient')
      expect(socket).toHaveProperty('getClient')
      expect(socket).toHaveProperty('defineSend')
      expect(socket).toHaveProperty('defineSubscribe')
    })

    it('should accept optional config', () => {
      const onValidationError = vi.fn()
      const onAckTimeout = vi.fn()

      const socket = socketBuilder({
        onValidationError,
        onAckTimeout,
        ackTimeout: 5000,
      })

      expect(socket).toBeDefined()
    })

    it('should accept custom formatMessage and parseMessage', () => {
      const formatMessage = vi.fn((topic, payload) => ({ type: topic, data: payload }))
      const parseMessage = vi.fn((msg) => ({
        topic: (msg as any).type,
        payload: (msg as any).data,
      }))

      const socket = socketBuilder({ formatMessage, parseMessage })

      expect(socket).toBeDefined()
    })
  })

  describe('provideClient', () => {
    it('should provide a client', () => {
      const socket = socketBuilder()
      const client = createMockClient()

      socket.provideClient(client)

      expect(socket.getClient()).toBe(client)
    })

    it('should allow replacing the client', () => {
      const socket = socketBuilder()
      const client1 = createMockClient()
      const client2 = createMockClient()

      socket.provideClient(client1)
      expect(socket.getClient()).toBe(client1)

      socket.provideClient(client2)
      expect(socket.getClient()).toBe(client2)
    })

    it('should cleanup pending acks when replacing client', async () => {
      const socket = socketBuilder({ ackTimeout: 100 })
      const client1 = createMockClient()
      const client2 = createMockClient()

      socket.provideClient(client1)

      const sendWithAck = socket.defineSend({
        topic: 'test',
        payloadSchema,
        ackSchema,
      })

      // Start a send that expects ack
      const promise = sendWithAck({ text: 'hello' })

      // Replace client before ack arrives
      socket.provideClient(client2)

      // Promise should reject
      await expect(promise).rejects.toThrow('Client was replaced')
    })
  })

  describe('getClient', () => {
    it('should throw NaviosError if no client provided', () => {
      const socket = socketBuilder()

      expect(() => socket.getClient()).toThrow(NaviosError)
      expect(() => socket.getClient()).toThrow('[Navios-Socket]: Client was not provided')
    })
  })

  describe('defineSend', () => {
    it('should create a send handler', () => {
      const socket = socketBuilder()
      const client = createMockClient()
      socket.provideClient(client)

      const sendMessage = socket.defineSend({
        topic: 'chat.message',
        payloadSchema,
      })

      expect(sendMessage).toBeTypeOf('function')
      expect(sendMessage.config).toEqual({
        topic: 'chat.message',
        payloadSchema,
      })
    })

    it('should send message with default format', () => {
      const socket = socketBuilder()
      const client = createMockClient()
      socket.provideClient(client)

      const sendMessage = socket.defineSend({
        topic: 'chat.message',
        payloadSchema,
      })

      sendMessage({ text: 'Hello!' })

      expect(client.emitMock).toHaveBeenCalledWith('chat.message', [
        'chat.message',
        { text: 'Hello!' },
      ])
    })

    it('should send message with custom format', () => {
      const socket = socketBuilder({
        formatMessage: (topic, payload) => ({ type: topic, data: payload }),
      })
      const client = createMockClient()
      socket.provideClient(client)

      const sendMessage = socket.defineSend({
        topic: 'chat.message',
        payloadSchema,
      })

      sendMessage({ text: 'Hello!' })

      expect(client.emitMock).toHaveBeenCalledWith('chat.message', {
        type: 'chat.message',
        data: { text: 'Hello!' },
      })
    })

    it('should validate payload before sending', () => {
      const socket = socketBuilder()
      const client = createMockClient()
      socket.provideClient(client)

      const sendMessage = socket.defineSend({
        topic: 'chat.message',
        payloadSchema,
      })

      // Should throw on invalid payload
      expect(() => sendMessage({ text: 123 as any })).toThrow()
      expect(client.emitMock).not.toHaveBeenCalled()
    })

    it('should return void for fire-and-forget send', () => {
      const socket = socketBuilder()
      const client = createMockClient()
      socket.provideClient(client)

      const sendMessage = socket.defineSend({
        topic: 'chat.message',
        payloadSchema,
      })

      const result = sendMessage({ text: 'Hello!' })

      expect(result).toBeUndefined()
    })

    it('should return Promise for send with ackSchema', async () => {
      const socket = socketBuilder()
      const client = createMockClient()
      socket.provideClient(client)

      const createRoom = socket.defineSend({
        topic: 'room.create',
        payloadSchema: z.object({ name: z.string() }),
        ackSchema,
      })

      const promise = createRoom({ name: 'My Room' })

      expect(promise).toBeInstanceOf(Promise)

      // Extract ackId from the emit call
      const emitCall = client.emitMock.mock.calls[0]
      const message = emitCall[1] as unknown[]
      const ackId = message[2] as string

      // Simulate ack response
      simulateAck(client, ackId, { id: 'room-123', createdAt: '2024-01-01' })

      const result = await promise
      expect(result).toEqual({ id: 'room-123', createdAt: '2024-01-01' })
    })

    it('should timeout ack and call onAckTimeout', async () => {
      vi.useFakeTimers()

      const onAckTimeout = vi.fn()
      const socket = socketBuilder({
        ackTimeout: 1000,
        onAckTimeout,
      })
      const client = createMockClient()
      socket.provideClient(client)

      const createRoom = socket.defineSend({
        topic: 'room.create',
        payloadSchema: z.object({ name: z.string() }),
        ackSchema,
      })

      const promise = createRoom({ name: 'My Room' })

      // Advance time past timeout
      vi.advanceTimersByTime(1100)

      await expect(promise).rejects.toThrow('Acknowledgement timeout')
      expect(onAckTimeout).toHaveBeenCalledWith('room.create', expect.any(String))

      vi.useRealTimers()
    })

    it('should use per-send ackTimeout override', async () => {
      vi.useFakeTimers()

      const socket = socketBuilder({ ackTimeout: 30000 })
      const client = createMockClient()
      socket.provideClient(client)

      const createRoom = socket.defineSend({
        topic: 'room.create',
        payloadSchema: z.object({ name: z.string() }),
        ackSchema,
        ackTimeout: 500, // Override with shorter timeout
      })

      const promise = createRoom({ name: 'My Room' })

      vi.advanceTimersByTime(600)

      await expect(promise).rejects.toThrow('Acknowledgement timeout')

      vi.useRealTimers()
    })

    it('should validate ack response', async () => {
      const onValidationError = vi.fn()
      const socket = socketBuilder({ onValidationError })
      const client = createMockClient()
      socket.provideClient(client)

      const createRoom = socket.defineSend({
        topic: 'room.create',
        payloadSchema: z.object({ name: z.string() }),
        ackSchema,
      })

      const promise = createRoom({ name: 'My Room' })

      // Extract ackId
      const emitCall = client.emitMock.mock.calls[0]
      const message = emitCall[1] as unknown[]
      const ackId = message[2] as string

      // Simulate invalid ack response
      simulateAck(client, ackId, { invalid: 'data' })

      await expect(promise).rejects.toThrow()
      expect(onValidationError).toHaveBeenCalled()
    })

    it('should cleanup ack handler after success', async () => {
      const socket = socketBuilder()
      const client = createMockClient()
      socket.provideClient(client)

      const createRoom = socket.defineSend({
        topic: 'room.create',
        payloadSchema: z.object({ name: z.string() }),
        ackSchema,
      })

      const promise = createRoom({ name: 'My Room' })

      // Extract ackId
      const emitCall = client.emitMock.mock.calls[0]
      const message = emitCall[1] as unknown[]
      const ackId = message[2] as string
      const ackTopic = `__navios_ack:${ackId}`

      // Verify handler was added
      expect(client.handlers.has(ackTopic)).toBe(true)

      // Simulate ack response
      simulateAck(client, ackId, { id: 'room-123', createdAt: '2024-01-01' })

      await promise

      // Verify handler was removed
      expect(client.offMock).toHaveBeenCalledWith(ackTopic, expect.any(Function))
    })
  })

  describe('defineSubscribe', () => {
    it('should create a subscribe handler', () => {
      const socket = socketBuilder()
      const client = createMockClient()
      socket.provideClient(client)

      const onMessage = socket.defineSubscribe({
        topic: 'chat.message',
        payloadSchema: subscribePayloadSchema,
      })

      expect(onMessage).toBeTypeOf('function')
      expect(onMessage.config).toEqual({
        topic: 'chat.message',
        payloadSchema: subscribePayloadSchema,
      })
    })

    it('should register handler and return unsubscribe function', () => {
      const socket = socketBuilder()
      const client = createMockClient()
      socket.provideClient(client)

      const onMessage = socket.defineSubscribe({
        topic: 'chat.message',
        payloadSchema: subscribePayloadSchema,
      })

      const handler = vi.fn()
      const unsubscribe = onMessage(handler)

      expect(unsubscribe).toBeTypeOf('function')

      // Verify global listener was set up
      expect(client.onMock).toHaveBeenCalledWith('message', expect.any(Function))
    })

    it('should call handler with validated payload on message', () => {
      const socket = socketBuilder()
      const client = createMockClient()
      socket.provideClient(client)

      const onMessage = socket.defineSubscribe({
        topic: 'chat.message',
        payloadSchema: subscribePayloadSchema,
      })

      const handler = vi.fn()
      onMessage(handler)

      // Simulate incoming message
      simulateMessage(client, ['chat.message', { text: 'Hello', from: 'Alice', timestamp: 12345 }])

      expect(handler).toHaveBeenCalledWith({
        text: 'Hello',
        from: 'Alice',
        timestamp: 12345,
      })
    })

    it('should skip invalid messages and call onValidationError', () => {
      const onValidationError = vi.fn()
      const socket = socketBuilder({ onValidationError })
      const client = createMockClient()
      socket.provideClient(client)

      const onMessage = socket.defineSubscribe({
        topic: 'chat.message',
        payloadSchema: subscribePayloadSchema,
      })

      const handler = vi.fn()
      onMessage(handler)

      // Simulate invalid message
      simulateMessage(client, ['chat.message', { text: 'Hello' }]) // Missing from and timestamp

      expect(handler).not.toHaveBeenCalled()
      expect(onValidationError).toHaveBeenCalled()
    })

    it('should unsubscribe handler when unsubscribe is called', () => {
      const socket = socketBuilder()
      const client = createMockClient()
      socket.provideClient(client)

      const onMessage = socket.defineSubscribe({
        topic: 'chat.message',
        payloadSchema: subscribePayloadSchema,
      })

      const handler = vi.fn()
      const unsubscribe = onMessage(handler)

      // First message should be handled
      simulateMessage(client, ['chat.message', { text: 'Hello', from: 'Alice', timestamp: 12345 }])
      expect(handler).toHaveBeenCalledTimes(1)

      // Unsubscribe
      unsubscribe()

      // Second message should not be handled
      simulateMessage(client, [
        'chat.message',
        { text: 'Goodbye', from: 'Alice', timestamp: 12346 },
      ])
      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('should support multiple handlers for same topic', () => {
      const socket = socketBuilder()
      const client = createMockClient()
      socket.provideClient(client)

      const onMessage = socket.defineSubscribe({
        topic: 'chat.message',
        payloadSchema: subscribePayloadSchema,
      })

      const handler1 = vi.fn()
      const handler2 = vi.fn()

      onMessage(handler1)
      onMessage(handler2)

      simulateMessage(client, ['chat.message', { text: 'Hello', from: 'Alice', timestamp: 12345 }])

      expect(handler1).toHaveBeenCalled()
      expect(handler2).toHaveBeenCalled()
    })

    it('should route messages to correct topic handlers', () => {
      const socket = socketBuilder()
      const client = createMockClient()
      socket.provideClient(client)

      const onChat = socket.defineSubscribe({
        topic: 'chat.message',
        payloadSchema: z.object({ text: z.string() }),
      })

      const onUser = socket.defineSubscribe({
        topic: 'user.joined',
        payloadSchema: z.object({ name: z.string() }),
      })

      const chatHandler = vi.fn()
      const userHandler = vi.fn()

      onChat(chatHandler)
      onUser(userHandler)

      // Send chat message
      simulateMessage(client, ['chat.message', { text: 'Hello' }])

      expect(chatHandler).toHaveBeenCalledWith({ text: 'Hello' })
      expect(userHandler).not.toHaveBeenCalled()

      // Send user joined message
      simulateMessage(client, ['user.joined', { name: 'Bob' }])

      expect(userHandler).toHaveBeenCalledWith({ name: 'Bob' })
      expect(chatHandler).toHaveBeenCalledTimes(1) // Still only once
    })

    it('should ignore messages with unknown topics', () => {
      const socket = socketBuilder()
      const client = createMockClient()
      socket.provideClient(client)

      const onMessage = socket.defineSubscribe({
        topic: 'chat.message',
        payloadSchema: subscribePayloadSchema,
      })

      const handler = vi.fn()
      onMessage(handler)

      // Send message with different topic
      simulateMessage(client, ['unknown.topic', { data: 'value' }])

      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('custom parseMessage', () => {
    it('should use custom parseMessage for incoming messages', () => {
      const socket = socketBuilder({
        parseMessage: (data) => {
          if (typeof data === 'object' && data && 'type' in data) {
            return {
              topic: (data as any).type,
              payload: (data as any).data,
            }
          }
          return null
        },
      })
      const client = createMockClient()
      socket.provideClient(client)

      const onMessage = socket.defineSubscribe({
        topic: 'chat.message',
        payloadSchema: z.object({ text: z.string() }),
      })

      const handler = vi.fn()
      onMessage(handler)

      // Simulate custom format message
      simulateMessage(client, { type: 'chat.message', data: { text: 'Hello' } })

      expect(handler).toHaveBeenCalledWith({ text: 'Hello' })
    })

    it('should ignore messages that parseMessage returns null for', () => {
      const socket = socketBuilder({
        parseMessage: () => null, // Always returns null
      })
      const client = createMockClient()
      socket.provideClient(client)

      const onMessage = socket.defineSubscribe({
        topic: 'chat.message',
        payloadSchema: z.object({ text: z.string() }),
      })

      const handler = vi.fn()
      onMessage(handler)

      simulateMessage(client, ['chat.message', { text: 'Hello' }])

      expect(handler).not.toHaveBeenCalled()
    })
  })
})
