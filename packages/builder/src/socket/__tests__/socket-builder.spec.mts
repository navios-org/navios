import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import { NaviosError } from '../../errors/index.mjs'
import { isSocketError, SocketError } from '../index.mjs'
import { socketBuilder } from '../socket-builder.mjs'

import type { Schema } from '../../types/schema.mjs'
import type { SocketClient } from '../types/socket-client.mjs'

/** A hand-written Standard Schema, standing in for any non-Zod library. */
function standard<Input, Output>(
  check: (value: unknown) => Output | Error,
  options: { async?: boolean } = {},
): Schema<Input, Output> {
  return {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: (value) => {
        const outcome = check(value)
        const result =
          outcome instanceof Error
            ? { issues: [{ message: outcome.message, path: ['field'] }] }
            : { value: outcome }
        return options.async ? Promise.resolve(result) : result
      },
    },
  }
}

/** Accepts `{ n: number > 0 }` and adds `checked: true` to its output. */
function positive(options: { async?: boolean } = {}) {
  return standard<{ n: number }, { n: number; checked: true }>((value) => {
    const n = (value as { n?: unknown } | null)?.n
    return typeof n === 'number' && n > 0 ? { n, checked: true } : new Error('n must be positive')
  }, options)
}

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
      const onError = vi.fn()

      const socket = socketBuilder({
        onError,
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
      await expect(promise).rejects.toMatchObject({ kind: 'transport', topic: 'test' })
      await expect(promise).rejects.toBeInstanceOf(SocketError)
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

    it('should throw a SocketError with the ZodError as cause and report it to onError', () => {
      const onError = vi.fn()
      const socket = socketBuilder({ onError })
      const client = createMockClient()
      socket.provideClient(client)

      const sendMessage = socket.defineSend({ topic: 'chat.message', payloadSchema })
      const invalid = { text: 123 }

      let thrown: unknown
      try {
        sendMessage(invalid as any)
      } catch (error) {
        thrown = error
      }

      expect(isSocketError(thrown)).toBe(true)
      const error = thrown as SocketError
      expect(error).toBeInstanceOf(NaviosError)
      expect(error.kind).toBe('validation')
      expect(error.topic).toBe('chat.message')
      expect(error.rawData).toBe(invalid)
      expect(error.issues?.length).toBeGreaterThan(0)
      expect(error.cause).toBeInstanceOf(z.ZodError)
      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError.mock.calls[0]![0]).toBe(error)
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

    it('should timeout ack and fire onError with kind ack-timeout', async () => {
      vi.useFakeTimers()

      const onError = vi.fn()
      const socket = socketBuilder({
        ackTimeout: 1000,
        onError,
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
      expect(onError).toHaveBeenCalledTimes(1)
      const error = onError.mock.calls[0]![0] as SocketError
      expect(error).toBeInstanceOf(SocketError)
      expect(error.kind).toBe('ack-timeout')
      expect(error.topic).toBe('room.create')
      expect(error.message).toContain('Acknowledgement timeout')
      expect(error.cause).toBeUndefined()
      expect('issues' in error).toBe(false)
      expect('rawData' in error).toBe(false)
      // The caller and the hook get the same instance.
      await expect(promise).rejects.toBe(error)

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

    it('should validate ack response and fire onError with kind validation', async () => {
      const onError = vi.fn()
      const socket = socketBuilder({ onError })
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
      const invalidAck = { invalid: 'data' }

      // Simulate invalid ack response
      simulateAck(client, ackId, invalidAck)

      await expect(promise).rejects.toThrow()
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'validation',
          topic: 'room.create',
          rawData: invalidAck,
        }),
      )
      const error = onError.mock.calls[0]![0] as SocketError
      expect(error).toBeInstanceOf(SocketError)
      expect(Array.isArray(error.issues)).toBe(true)
      expect(error.issues!.length).toBeGreaterThan(0)
      expect(error.cause).toBeInstanceOf(z.ZodError)
      await expect(promise).rejects.toBe(error)
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

    it('should skip invalid messages and fire onError with kind validation', () => {
      const onError = vi.fn()
      const socket = socketBuilder({ onError })
      const client = createMockClient()
      socket.provideClient(client)

      const onMessage = socket.defineSubscribe({
        topic: 'chat.message',
        payloadSchema: subscribePayloadSchema,
      })

      const handler = vi.fn()
      onMessage(handler)

      const invalidPayload = { text: 'Hello' } // Missing from and timestamp
      // Simulate invalid message
      simulateMessage(client, ['chat.message', invalidPayload])

      expect(handler).not.toHaveBeenCalled()
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'validation',
          topic: 'chat.message',
          rawData: invalidPayload,
        }),
      )
      const error = onError.mock.calls[0]![0] as SocketError
      expect(error).toBeInstanceOf(SocketError)
      expect(error).toBeInstanceOf(NaviosError)
      expect(Array.isArray(error.issues)).toBe(true)
      expect(error.cause).toBeInstanceOf(z.ZodError)
    })

    it('should fire onError with kind transport when handler throws', () => {
      const onError = vi.fn()
      const socket = socketBuilder({ onError })
      const client = createMockClient()
      socket.provideClient(client)

      const onMessage = socket.defineSubscribe({
        topic: 'chat.message',
        payloadSchema: subscribePayloadSchema,
      })

      const handlerError = new Error('Handler exploded')
      const throwingHandler = vi.fn(() => {
        throw handlerError
      })
      onMessage(throwingHandler)

      simulateMessage(client, ['chat.message', { text: 'Hi', from: 'A', timestamp: 1 }])

      expect(throwingHandler).toHaveBeenCalled()
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'transport',
          topic: 'chat.message',
          cause: handlerError,
        }),
      )
      expect(onError.mock.calls[0]![0]).toBeInstanceOf(SocketError)
    })

    it('should not let one throwing handler stop sibling handlers', () => {
      const onError = vi.fn()
      const socket = socketBuilder({ onError })
      const client = createMockClient()
      socket.provideClient(client)

      const onMessage = socket.defineSubscribe({
        topic: 'chat.message',
        payloadSchema: subscribePayloadSchema,
      })

      const throwingHandler = vi.fn(() => {
        throw new Error('boom')
      })
      const okHandler = vi.fn()
      onMessage(throwingHandler)
      onMessage(okHandler)

      simulateMessage(client, ['chat.message', { text: 'Hi', from: 'A', timestamp: 1 }])

      expect(throwingHandler).toHaveBeenCalled()
      expect(okHandler).toHaveBeenCalled()
      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'transport', topic: 'chat.message' }),
      )
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

  describe('Standard Schema support', () => {
    it('should validate a send payload with a non-Zod schema and send its output', () => {
      const socket = socketBuilder()
      const client = createMockClient()
      socket.provideClient(client)

      const send = socket.defineSend({ topic: 'numbers', payloadSchema: positive() })

      send({ n: 2 })
      expect(client.emitMock).toHaveBeenCalledWith('numbers', ['numbers', { n: 2, checked: true }])
    })

    it('should throw a SocketError carrying the schema issues for a non-Zod schema', () => {
      const onError = vi.fn()
      const socket = socketBuilder({ onError })
      const client = createMockClient()
      socket.provideClient(client)

      const send = socket.defineSend({ topic: 'numbers', payloadSchema: positive() })

      let thrown: unknown
      try {
        send({ n: -1 })
      } catch (error) {
        thrown = error
      }

      expect(thrown).toBeInstanceOf(SocketError)
      const error = thrown as SocketError
      expect(error.kind).toBe('validation')
      expect(error.issues).toEqual([{ message: 'n must be positive', path: ['field'] }])
      expect(error.rawData).toEqual({ n: -1 })
      expect(error.cause).toBeUndefined()
      expect(onError).toHaveBeenCalledWith(error)
      expect(client.emitMock).not.toHaveBeenCalled()
    })

    it('should validate incoming messages with a non-Zod schema', () => {
      const onError = vi.fn()
      const socket = socketBuilder({ onError })
      const client = createMockClient()
      socket.provideClient(client)

      const onNumber = socket.defineSubscribe({ topic: 'numbers', payloadSchema: positive() })
      const handler = vi.fn()
      onNumber(handler)

      simulateMessage(client, ['numbers', { n: 3 }])
      simulateMessage(client, ['numbers', { n: 0 }])

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith({ n: 3, checked: true })
      expect(onError).toHaveBeenCalledTimes(1)
      const error = onError.mock.calls[0]![0] as SocketError
      expect(error).toBeInstanceOf(SocketError)
      expect(error.kind).toBe('validation')
      expect(error.topic).toBe('numbers')
      expect(error.rawData).toEqual({ n: 0 })
      expect(error.issues).toEqual([{ message: 'n must be positive', path: ['field'] }])
    })

    it('should validate an ack with a non-Zod schema', async () => {
      const socket = socketBuilder()
      const client = createMockClient()
      socket.provideClient(client)

      const send = socket.defineSend({ topic: 'numbers', ackSchema: positive() })
      const promise = send('anything')
      const ackId = (client.emitMock.mock.calls[0]![1] as unknown[])[2] as string
      simulateAck(client, ackId, { n: 5 })

      await expect(promise).resolves.toEqual({ n: 5, checked: true })
    })
  })

  describe('asynchronous schemas', () => {
    it('should await an async payloadSchema before calling the subscriber', async () => {
      const onError = vi.fn()
      const socket = socketBuilder({ onError })
      const client = createMockClient()
      socket.provideClient(client)

      const onNumber = socket.defineSubscribe({
        topic: 'numbers',
        payloadSchema: positive({ async: true }),
      })
      const handler = vi.fn()
      onNumber(handler)

      simulateMessage(client, ['numbers', { n: 3 }])
      simulateMessage(client, ['numbers', { n: -3 }])
      expect(handler).not.toHaveBeenCalled()

      await Promise.resolve()
      await Promise.resolve()

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith({ n: 3, checked: true })
      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError.mock.calls[0]![0]).toMatchObject({ kind: 'validation', topic: 'numbers' })
    })

    it('should not deliver a message whose async validation finishes after unsubscribe', async () => {
      const socket = socketBuilder()
      const client = createMockClient()
      socket.provideClient(client)

      const onNumber = socket.defineSubscribe({
        topic: 'numbers',
        payloadSchema: positive({ async: true }),
      })
      const handler = vi.fn()
      const unsubscribe = onNumber(handler)

      simulateMessage(client, ['numbers', { n: 3 }])
      unsubscribe()
      await Promise.resolve()
      await Promise.resolve()

      expect(handler).not.toHaveBeenCalled()
    })

    it('should support a Zod schema with an async refinement on subscribe', async () => {
      const socket = socketBuilder()
      const client = createMockClient()
      socket.provideClient(client)

      const onMessage = socket.defineSubscribe({
        topic: 'chat.message',
        payloadSchema: z.object({ text: z.string().refine(async (text) => text.length > 0) }),
      })
      const handler = vi.fn()
      onMessage(handler)

      simulateMessage(client, ['chat.message', { text: 'Hello' }])
      await vi.waitFor(() => expect(handler).toHaveBeenCalledWith({ text: 'Hello' }))
    })

    it('should await async payload and ack schemas on a send with ackSchema', async () => {
      const socket = socketBuilder()
      const client = createMockClient()
      socket.provideClient(client)

      const send = socket.defineSend({
        topic: 'numbers',
        payloadSchema: positive({ async: true }),
        ackSchema: positive({ async: true }),
      })

      const promise = send({ n: 1 })
      // Nothing is sent until the payload has been validated.
      expect(client.emitMock).not.toHaveBeenCalled()
      await vi.waitFor(() => expect(client.emitMock).toHaveBeenCalled())

      const message = client.emitMock.mock.calls[0]![1] as unknown[]
      expect(message[1]).toEqual({ n: 1, checked: true })
      simulateAck(client, message[2] as string, { n: 7 })

      await expect(promise).resolves.toEqual({ n: 7, checked: true })
    })

    it('should reject with a SocketError when an async payloadSchema fails on a send with ackSchema', async () => {
      const onError = vi.fn()
      const socket = socketBuilder({ onError })
      const client = createMockClient()
      socket.provideClient(client)

      const send = socket.defineSend({
        topic: 'numbers',
        payloadSchema: positive({ async: true }),
        ackSchema: positive(),
      })

      const promise = send({ n: -1 })
      await expect(promise).rejects.toBeInstanceOf(SocketError)
      await expect(promise).rejects.toMatchObject({ kind: 'validation', topic: 'numbers' })
      expect(client.emitMock).not.toHaveBeenCalled()
      expect(onError).toHaveBeenCalledTimes(1)
    })

    it('should reject with a SocketError when an async ackSchema fails', async () => {
      const onError = vi.fn()
      const socket = socketBuilder({ onError })
      const client = createMockClient()
      socket.provideClient(client)

      const send = socket.defineSend({ topic: 'numbers', ackSchema: positive({ async: true }) })
      const promise = send('anything')
      const ackId = (client.emitMock.mock.calls[0]![1] as unknown[])[2] as string
      simulateAck(client, ackId, { n: -7 })

      await expect(promise).rejects.toMatchObject({
        kind: 'validation',
        topic: 'numbers',
        rawData: { n: -7 },
      })
      expect(onError).toHaveBeenCalledTimes(1)
    })

    it('should refuse an async payloadSchema on a fire-and-forget send', () => {
      const onError = vi.fn()
      const socket = socketBuilder({ onError })
      const client = createMockClient()
      socket.provideClient(client)

      const send = socket.defineSend({
        topic: 'numbers',
        payloadSchema: positive({ async: true }),
      })

      let thrown: unknown
      try {
        send({ n: 1 })
      } catch (error) {
        thrown = error
      }

      expect(thrown).toBeInstanceOf(SocketError)
      expect((thrown as SocketError).kind).toBe('validation')
      expect((thrown as SocketError).message).toContain('validates asynchronously')
      expect(client.emitMock).not.toHaveBeenCalled()
      expect(onError).toHaveBeenCalledWith(thrown)
    })
  })

  describe('onError hook protection', () => {
    it('should keep delivering messages when onError throws', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const hookError = new Error('hook exploded')
      const socket = socketBuilder({
        onError: () => {
          throw hookError
        },
      })
      const client = createMockClient()
      socket.provideClient(client)

      const onMessage = socket.defineSubscribe({
        topic: 'chat.message',
        payloadSchema: subscribePayloadSchema,
      })
      const throwing = vi.fn(() => {
        throw new Error('handler exploded')
      })
      const sibling = vi.fn()
      onMessage(throwing)
      onMessage(sibling)

      // Invalid message, then a valid one whose first handler throws.
      expect(() => simulateMessage(client, ['chat.message', { text: 'Hi' }])).not.toThrow()
      expect(() =>
        simulateMessage(client, ['chat.message', { text: 'Hi', from: 'A', timestamp: 1 }]),
      ).not.toThrow()

      expect(sibling).toHaveBeenCalledTimes(1)
      expect(consoleError).toHaveBeenCalledWith('[Navios-Socket]: onError hook threw', hookError)
      consoleError.mockRestore()
    })

    it('should still reject a send with the SocketError when onError throws', async () => {
      vi.useFakeTimers()
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const socket = socketBuilder({
        ackTimeout: 100,
        onError: () => {
          throw new Error('hook exploded')
        },
      })
      const client = createMockClient()
      socket.provideClient(client)

      const send = socket.defineSend({ topic: 'room.create', ackSchema })
      const promise = send({})
      vi.advanceTimersByTime(150)

      await expect(promise).rejects.toMatchObject({ kind: 'ack-timeout', topic: 'room.create' })
      expect(consoleError).toHaveBeenCalled()
      consoleError.mockRestore()
      vi.useRealTimers()
    })
  })

  describe('SocketError', () => {
    it('should serialize without the cause', () => {
      const error = new SocketError({
        kind: 'validation',
        topic: 'chat.message',
        url: 'wss://example.com/ws',
        issues: [{ message: 'bad' }],
        rawData: { text: 1 },
        cause: new Error('original'),
      })

      expect(error.name).toBe('SocketError')
      expect((error.cause as Error).message).toBe('original')
      expect(JSON.parse(JSON.stringify(error))).toEqual({
        name: 'SocketError',
        message: 'Socket message on "chat.message" failed validation',
        kind: 'validation',
        topic: 'chat.message',
        url: 'wss://example.com/ws',
        issues: [{ message: 'bad' }],
        rawData: { text: 1 },
      })
    })

    it('should omit unset optional fields', () => {
      const error = new SocketError({ kind: 'transport', topic: 'chat.message' })

      expect(error.toJSON()).toEqual({
        name: 'SocketError',
        message: 'Socket handler for "chat.message" failed',
        kind: 'transport',
        topic: 'chat.message',
      })
      expect(isSocketError(error)).toBe(true)
      expect(isSocketError(new NaviosError('other'))).toBe(false)
    })

    it('should copy the url of the client when it exposes one', () => {
      const onError = vi.fn()
      const socket = socketBuilder({ onError })
      const client = { ...createMockClient(), url: 'wss://example.com/ws' }
      socket.provideClient(client)

      const onMessage = socket.defineSubscribe({
        topic: 'chat.message',
        payloadSchema: subscribePayloadSchema,
      })
      onMessage(vi.fn())
      simulateMessage(client, ['chat.message', {}])

      expect((onError.mock.calls[0]![0] as SocketError).url).toBe('wss://example.com/ws')
    })
  })
})
