import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import type { EventSourceClient } from '../types/eventsource-client.mjs'

import { eventSourceBuilder } from '../eventsource-builder.mjs'
import { NaviosError } from '../../errors/index.mjs'

describe('eventSourceBuilder', () => {
  const messageSchema = z.object({
    text: z.string(),
    from: z.string(),
  })

  const typingSchema = z.object({
    userId: z.string(),
  })

  function createMockClient(): EventSourceClient & {
    onMock: ReturnType<typeof vi.fn>
    offMock: ReturnType<typeof vi.fn>
    closeMock: ReturnType<typeof vi.fn>
    handlers: Map<string, Set<(data: unknown) => void>>
  } {
    const handlers = new Map<string, Set<(data: unknown) => void>>()

    const onMock = vi.fn((event: string, handler: (data: unknown) => void) => {
      if (!handlers.has(event)) {
        handlers.set(event, new Set())
      }
      handlers.get(event)!.add(handler)
    })
    const offMock = vi.fn((event: string, handler?: (data: unknown) => void) => {
      if (handler) {
        handlers.get(event)?.delete(handler)
      } else {
        handlers.delete(event)
      }
    })
    const closeMock = vi.fn()

    return {
      on: onMock,
      off: offMock,
      close: closeMock,
      connected: true,
      onMock,
      offMock,
      closeMock,
      handlers,
    }
  }

  // Helper to simulate receiving an event
  function simulateEvent(
    client: ReturnType<typeof createMockClient>,
    eventName: string,
    data: unknown,
  ) {
    const eventHandlers = client.handlers.get(eventName)
    if (eventHandlers) {
      eventHandlers.forEach((handler) => handler(data))
    }
  }

  describe('builder creation', () => {
    it('should create an eventsource builder instance', () => {
      const sse = eventSourceBuilder()

      expect(sse).toHaveProperty('provideClient')
      expect(sse).toHaveProperty('getClient')
      expect(sse).toHaveProperty('defineEvent')
    })

    it('should accept optional config', () => {
      const onValidationError = vi.fn()
      const onError = vi.fn()

      const sse = eventSourceBuilder({
        onValidationError,
        onError,
      })

      expect(sse).toBeDefined()
    })
  })

  describe('provideClient', () => {
    it('should provide a client', () => {
      const sse = eventSourceBuilder()
      const client = createMockClient()

      sse.provideClient(client)

      expect(sse.getClient()).toBe(client)
    })

    it('should allow replacing the client', () => {
      const sse = eventSourceBuilder()
      const client1 = createMockClient()
      const client2 = createMockClient()

      sse.provideClient(client1)
      expect(sse.getClient()).toBe(client1)

      sse.provideClient(client2)
      expect(sse.getClient()).toBe(client2)
    })

    it('should cleanup old listeners when replacing client', () => {
      const sse = eventSourceBuilder()
      const client1 = createMockClient()
      const client2 = createMockClient()

      sse.provideClient(client1)

      // Define and use an event handler
      const onMessage = sse.defineEvent({
        eventName: 'message',
        payloadSchema: messageSchema,
      })

      const handler = vi.fn()
      onMessage(handler)

      // Verify listener was set up
      expect(client1.onMock).toHaveBeenCalledWith('message', expect.any(Function))

      // Replace client
      sse.provideClient(client2)

      // Verify old listener was removed
      expect(client1.offMock).toHaveBeenCalledWith('message', expect.any(Function))

      // Verify new listener was set up on new client
      expect(client2.onMock).toHaveBeenCalledWith('message', expect.any(Function))
    })

    it('should close old client when replacing', () => {
      const sse = eventSourceBuilder()
      const client1 = createMockClient()
      const client2 = createMockClient()

      sse.provideClient(client1)
      sse.provideClient(client2)

      expect(client1.closeMock).toHaveBeenCalled()
    })
  })

  describe('getClient', () => {
    it('should throw NaviosError if no client provided', () => {
      const sse = eventSourceBuilder()

      expect(() => sse.getClient()).toThrow(NaviosError)
      expect(() => sse.getClient()).toThrow(
        '[Navios-EventSource]: Client was not provided',
      )
    })
  })

  describe('defineEvent', () => {
    it('should create an event handler', () => {
      const sse = eventSourceBuilder()
      const client = createMockClient()
      sse.provideClient(client)

      const onMessage = sse.defineEvent({
        eventName: 'message',
        payloadSchema: messageSchema,
      })

      expect(onMessage).toBeTypeOf('function')
      expect(onMessage.config).toEqual({
        eventName: 'message',
        payloadSchema: messageSchema,
      })
    })

    it('should register handler and return unsubscribe function', () => {
      const sse = eventSourceBuilder()
      const client = createMockClient()
      sse.provideClient(client)

      const onMessage = sse.defineEvent({
        eventName: 'message',
        payloadSchema: messageSchema,
      })

      const handler = vi.fn()
      const unsubscribe = onMessage(handler)

      expect(unsubscribe).toBeTypeOf('function')
      expect(client.onMock).toHaveBeenCalledWith('message', expect.any(Function))
    })

    it('should call handler with validated payload on event', () => {
      const sse = eventSourceBuilder()
      const client = createMockClient()
      sse.provideClient(client)

      const onMessage = sse.defineEvent({
        eventName: 'message',
        payloadSchema: messageSchema,
      })

      const handler = vi.fn()
      onMessage(handler)

      // Simulate incoming event
      simulateEvent(client, 'message', { text: 'Hello', from: 'Alice' })

      expect(handler).toHaveBeenCalledWith({ text: 'Hello', from: 'Alice' })
    })

    it('should skip invalid events and call onValidationError', () => {
      const onValidationError = vi.fn()
      const sse = eventSourceBuilder({ onValidationError })
      const client = createMockClient()
      sse.provideClient(client)

      const onMessage = sse.defineEvent({
        eventName: 'message',
        payloadSchema: messageSchema,
      })

      const handler = vi.fn()
      onMessage(handler)

      // Simulate invalid event (missing 'from')
      simulateEvent(client, 'message', { text: 'Hello' })

      expect(handler).not.toHaveBeenCalled()
      expect(onValidationError).toHaveBeenCalled()
    })

    it('should call onError when handler throws', () => {
      const onError = vi.fn()
      const sse = eventSourceBuilder({ onError })
      const client = createMockClient()
      sse.provideClient(client)

      const onMessage = sse.defineEvent({
        eventName: 'message',
        payloadSchema: messageSchema,
      })

      const error = new Error('Handler error')
      const handler = vi.fn(() => {
        throw error
      })
      onMessage(handler)

      // Simulate event
      simulateEvent(client, 'message', { text: 'Hello', from: 'Alice' })

      expect(handler).toHaveBeenCalled()
      expect(onError).toHaveBeenCalledWith(error)
    })

    it('should unsubscribe handler when unsubscribe is called', () => {
      const sse = eventSourceBuilder()
      const client = createMockClient()
      sse.provideClient(client)

      const onMessage = sse.defineEvent({
        eventName: 'message',
        payloadSchema: messageSchema,
      })

      const handler = vi.fn()
      const unsubscribe = onMessage(handler)

      // First event should be handled
      simulateEvent(client, 'message', { text: 'Hello', from: 'Alice' })
      expect(handler).toHaveBeenCalledTimes(1)

      // Unsubscribe
      unsubscribe()

      // Second event should not be handled
      simulateEvent(client, 'message', { text: 'Goodbye', from: 'Alice' })
      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('should support multiple handlers for same event', () => {
      const sse = eventSourceBuilder()
      const client = createMockClient()
      sse.provideClient(client)

      const onMessage = sse.defineEvent({
        eventName: 'message',
        payloadSchema: messageSchema,
      })

      const handler1 = vi.fn()
      const handler2 = vi.fn()

      onMessage(handler1)
      onMessage(handler2)

      simulateEvent(client, 'message', { text: 'Hello', from: 'Alice' })

      expect(handler1).toHaveBeenCalled()
      expect(handler2).toHaveBeenCalled()
    })

    it('should route events to correct handlers', () => {
      const sse = eventSourceBuilder()
      const client = createMockClient()
      sse.provideClient(client)

      const onMessage = sse.defineEvent({
        eventName: 'message',
        payloadSchema: messageSchema,
      })

      const onTyping = sse.defineEvent({
        eventName: 'typing',
        payloadSchema: typingSchema,
      })

      const messageHandler = vi.fn()
      const typingHandler = vi.fn()

      onMessage(messageHandler)
      onTyping(typingHandler)

      // Send message event
      simulateEvent(client, 'message', { text: 'Hello', from: 'Alice' })

      expect(messageHandler).toHaveBeenCalledWith({ text: 'Hello', from: 'Alice' })
      expect(typingHandler).not.toHaveBeenCalled()

      // Send typing event
      simulateEvent(client, 'typing', { userId: 'user-123' })

      expect(typingHandler).toHaveBeenCalledWith({ userId: 'user-123' })
      expect(messageHandler).toHaveBeenCalledTimes(1)
    })

    it('should work without payloadSchema (accepts unknown)', () => {
      const sse = eventSourceBuilder()
      const client = createMockClient()
      sse.provideClient(client)

      const onAny = sse.defineEvent({
        eventName: 'any',
      })

      const handler = vi.fn()
      onAny(handler)

      simulateEvent(client, 'any', { anything: 'goes' })

      expect(handler).toHaveBeenCalledWith({ anything: 'goes' })
    })

    it('should allow registering handlers before client is provided', () => {
      const sse = eventSourceBuilder()

      // Define handler before client
      const onMessage = sse.defineEvent({
        eventName: 'message',
        payloadSchema: messageSchema,
      })

      const handler = vi.fn()
      // Should not throw - handlers can be registered before client
      const unsubscribe = onMessage(handler)

      expect(unsubscribe).toBeTypeOf('function')
    })

    it('should setup listeners after client is provided for pre-defined handlers', () => {
      const sse = eventSourceBuilder()

      // Define handler before client
      const onMessage = sse.defineEvent({
        eventName: 'message',
        payloadSchema: messageSchema,
      })

      // Now provide client
      const client = createMockClient()
      sse.provideClient(client)

      // Register handler
      const handler = vi.fn()
      onMessage(handler)

      // Verify listener was set up
      expect(client.onMock).toHaveBeenCalledWith('message', expect.any(Function))

      // Verify handler works
      simulateEvent(client, 'message', { text: 'Hello', from: 'Alice' })
      expect(handler).toHaveBeenCalled()
    })
  })

  describe('handler isolation', () => {
    it('should not affect other handlers when one throws', () => {
      const onError = vi.fn()
      const sse = eventSourceBuilder({ onError })
      const client = createMockClient()
      sse.provideClient(client)

      const onMessage = sse.defineEvent({
        eventName: 'message',
        payloadSchema: messageSchema,
      })

      const handler1 = vi.fn(() => {
        throw new Error('Handler 1 error')
      })
      const handler2 = vi.fn()

      onMessage(handler1)
      onMessage(handler2)

      simulateEvent(client, 'message', { text: 'Hello', from: 'Alice' })

      // Both handlers should have been called
      expect(handler1).toHaveBeenCalled()
      expect(handler2).toHaveBeenCalled()

      // Error should have been reported
      expect(onError).toHaveBeenCalled()
    })
  })
})
