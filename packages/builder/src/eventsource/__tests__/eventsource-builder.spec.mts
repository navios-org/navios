import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import { NaviosError } from '../../shared/navios-error.mjs'
import { eventSourceBuilder } from '../eventsource-builder.mjs'
import { EventSourceError, isEventSourceError } from '../index.mjs'

import type { Schema } from '../../shared/schema.mjs'
import type { EventSourceClient } from '../eventsource-client.mjs'

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
      const onError = vi.fn()

      const sse = eventSourceBuilder({
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
      expect(() => sse.getClient()).toThrow('[Navios-EventSource]: Client was not provided')
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

    it('should skip invalid events and fire onError with kind validation', () => {
      const onError = vi.fn()
      const sse = eventSourceBuilder({ onError })
      const client = createMockClient()
      sse.provideClient(client)

      const onMessage = sse.defineEvent({
        eventName: 'message',
        payloadSchema: messageSchema,
      })

      const handler = vi.fn()
      onMessage(handler)

      const invalidPayload = { text: 'Hello' } // missing 'from'
      // Simulate invalid event (missing 'from')
      simulateEvent(client, 'message', invalidPayload)

      expect(handler).not.toHaveBeenCalled()
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'validation',
          eventName: 'message',
          rawData: invalidPayload,
        }),
      )
      const error = onError.mock.calls[0]![0] as EventSourceError
      expect(error).toBeInstanceOf(EventSourceError)
      expect(error).toBeInstanceOf(NaviosError)
      expect(Array.isArray(error.issues)).toBe(true)
      expect(error.issues!.length).toBeGreaterThan(0)
      expect(error.cause).toBeInstanceOf(z.ZodError)
    })

    it('should fire onError with kind transport when handler throws', () => {
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
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'transport',
          eventName: 'message',
          cause: error,
        }),
      )
      const reported = onError.mock.calls[0]![0] as EventSourceError
      expect(reported).toBeInstanceOf(EventSourceError)
      expect('issues' in reported).toBe(false)
      expect('rawData' in reported).toBe(false)
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

      // Error should have been reported as structured transport error
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'transport',
          eventName: 'message',
        }),
      )
    })
  })

  describe('Standard Schema support', () => {
    it('should validate events with a non-Zod schema and pass its output', () => {
      const onError = vi.fn()
      const sse = eventSourceBuilder({ onError })
      const client = createMockClient()
      sse.provideClient(client)

      const onNumber = sse.defineEvent({ eventName: 'number', payloadSchema: positive() })
      const handler = vi.fn()
      onNumber(handler)

      simulateEvent(client, 'number', { n: 3 })
      simulateEvent(client, 'number', { n: 0 })

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith({ n: 3, checked: true })
      expect(onError).toHaveBeenCalledTimes(1)
      const error = onError.mock.calls[0]![0] as EventSourceError
      expect(error).toBeInstanceOf(EventSourceError)
      expect(error.kind).toBe('validation')
      expect(error.eventName).toBe('number')
      expect(error.rawData).toEqual({ n: 0 })
      expect(error.issues).toEqual([{ message: 'n must be positive', path: ['field'] }])
      expect(error.cause).toBeUndefined()
    })

    it('should await an async schema before calling the handler', async () => {
      const onError = vi.fn()
      const sse = eventSourceBuilder({ onError })
      const client = createMockClient()
      sse.provideClient(client)

      const onNumber = sse.defineEvent({
        eventName: 'number',
        payloadSchema: positive({ async: true }),
      })
      const handler = vi.fn()
      onNumber(handler)

      simulateEvent(client, 'number', { n: 3 })
      simulateEvent(client, 'number', { n: -3 })
      expect(handler).not.toHaveBeenCalled()

      await Promise.resolve()
      await Promise.resolve()

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith({ n: 3, checked: true })
      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError.mock.calls[0]![0]).toMatchObject({ kind: 'validation', eventName: 'number' })
    })

    it('should not deliver an event whose async validation finishes after unsubscribe', async () => {
      const sse = eventSourceBuilder()
      const client = createMockClient()
      sse.provideClient(client)

      const onNumber = sse.defineEvent({
        eventName: 'number',
        payloadSchema: positive({ async: true }),
      })
      const handler = vi.fn()
      const unsubscribe = onNumber(handler)

      simulateEvent(client, 'number', { n: 3 })
      unsubscribe()
      await Promise.resolve()
      await Promise.resolve()

      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('onError hook protection', () => {
    it('should keep delivering events when onError throws', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const hookError = new Error('hook exploded')
      const sse = eventSourceBuilder({
        onError: () => {
          throw hookError
        },
      })
      const client = createMockClient()
      sse.provideClient(client)

      const onMessage = sse.defineEvent({ eventName: 'message', payloadSchema: messageSchema })
      const throwing = vi.fn(() => {
        throw new Error('handler exploded')
      })
      const sibling = vi.fn()
      onMessage(throwing)
      onMessage(sibling)

      // Invalid event, then a valid one whose first handler throws.
      expect(() => simulateEvent(client, 'message', { text: 'Hi' })).not.toThrow()
      expect(() => simulateEvent(client, 'message', { text: 'Hi', from: 'A' })).not.toThrow()

      expect(sibling).toHaveBeenCalledTimes(1)
      expect(consoleError).toHaveBeenCalledWith(
        '[Navios-EventSource]: onError hook threw',
        hookError,
      )
      consoleError.mockRestore()
    })
  })

  describe('EventSourceError', () => {
    it('should serialize without the cause', () => {
      const error = new EventSourceError({
        kind: 'validation',
        eventName: 'message',
        url: 'https://example.com/events',
        issues: [{ message: 'bad' }],
        rawData: { text: 1 },
        cause: new Error('original'),
      })

      expect(error.name).toBe('EventSourceError')
      expect((error.cause as Error).message).toBe('original')
      expect(JSON.parse(JSON.stringify(error))).toEqual({
        name: 'EventSourceError',
        message: 'Event "message" failed validation',
        kind: 'validation',
        eventName: 'message',
        url: 'https://example.com/events',
        issues: [{ message: 'bad' }],
        rawData: { text: 1 },
      })
    })

    it('should omit unset optional fields', () => {
      const error = new EventSourceError({ kind: 'transport', eventName: 'message' })

      expect(error.toJSON()).toEqual({
        name: 'EventSourceError',
        message: 'EventSource handler for "message" failed',
        kind: 'transport',
        eventName: 'message',
      })
      expect(isEventSourceError(error)).toBe(true)
      expect(isEventSourceError(new NaviosError('other'))).toBe(false)
    })

    it('should copy the url of the client when it exposes one', () => {
      const onError = vi.fn()
      const sse = eventSourceBuilder({ onError })
      const client = { ...createMockClient(), url: 'https://example.com/events' }
      sse.provideClient(client)

      const onMessage = sse.defineEvent({ eventName: 'message', payloadSchema: messageSchema })
      onMessage(vi.fn())
      simulateEvent(client, 'message', {})

      expect((onError.mock.calls[0]![0] as EventSourceError).url).toBe('https://example.com/events')
    })
  })
})
