import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { z } from 'zod/v4'

import {
  createEventSourceHandler,
  declareEventSource,
} from '../eventsource/declare-eventsource.mjs'

// Mock EventSource for Node.js environment
class MockEventSource {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 2

  url: string
  withCredentials: boolean
  readyState: number = MockEventSource.CONNECTING

  onopen: ((event: Event) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null

  private eventListeners = new Map<string, Set<(event: MessageEvent) => void>>()
  private closeCalled = false

  constructor(url: string, options?: { withCredentials?: boolean }) {
    this.url = url
    this.withCredentials = options?.withCredentials ?? false

    // Simulate async connection
    setTimeout(() => {
      if (!this.closeCalled) {
        this.readyState = MockEventSource.OPEN
        this.onopen?.(new Event('open'))
      }
    }, 0)
  }

  addEventListener(event: string, handler: (event: MessageEvent) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set())
    }
    this.eventListeners.get(event)!.add(handler)
  }

  removeEventListener(event: string, handler: (event: MessageEvent) => void): void {
    this.eventListeners.get(event)?.delete(handler)
  }

  close(): void {
    this.closeCalled = true
    this.readyState = MockEventSource.CLOSED
  }

  // Test helpers
  simulateMessage(data: string): void {
    const event = new MessageEvent('message', { data })
    this.onmessage?.(event)
  }

  simulateEvent(eventName: string, data: string): void {
    const event = new MessageEvent(eventName, { data })
    const handlers = this.eventListeners.get(eventName)
    handlers?.forEach((handler) => handler(event))
  }

  simulateError(): void {
    const event = new Event('error')
    this.onerror?.(event)
  }

  getListenerCount(event: string): number {
    return this.eventListeners.get(event)?.size ?? 0
  }
}

// Helper to get mock from handle.source
function getMock(source: EventSource): MockEventSource {
  return source as unknown as MockEventSource
}

// Store original EventSource
const originalEventSource = globalThis.EventSource

describe('declareEventSource', () => {
  beforeEach(() => {
    // @ts-expect-error - mocking global
    globalThis.EventSource = MockEventSource
  })

  afterEach(() => {
    globalThis.EventSource = originalEventSource
  })

  describe('createEventSourceHandler factory', () => {
    it('should create a factory function', () => {
      const factory = createEventSourceHandler()
      expect(factory).toBeTypeOf('function')
    })

    it('should use baseUrl from config', () => {
      const factory = createEventSourceHandler({
        baseUrl: 'https://api.example.com',
      })

      const chatEvents = factory({ url: '/events' })
      const handle = chatEvents()

      expect(handle.source.url).toBe('https://api.example.com/events')
    })

    it('should call onError callback when handler throws', async () => {
      const onError = vi.fn()
      const factory = createEventSourceHandler({ onError })

      const chatEvents = factory({ url: '/events' })
      const handle = chatEvents()

      const error = new Error('Test error')
      handle.on('message', () => {
        throw error
      })

      // Simulate message
      getMock(handle.source).simulateMessage('{}')

      expect(onError).toHaveBeenCalledWith(error)
    })
  })

  describe('declareEventSource convenience function', () => {
    it('should work without factory', () => {
      const chatEvents = declareEventSource({ url: '/events' })
      expect(chatEvents).toBeTypeOf('function')
    })

    it('should have config property', () => {
      const options = { url: '/events' } as const
      const chatEvents = declareEventSource(options)

      expect(chatEvents.config).toEqual(options)
    })
  })

  describe('URL building', () => {
    it('should build URL without params', () => {
      const events = declareEventSource({ url: '/events' })
      const handle = events()

      expect(handle.source.url).toBe('/events')
    })

    it('should build URL with URL params', () => {
      const chatEvents = declareEventSource({
        url: '/events/$roomId',
      })
      const handle = chatEvents({ urlParams: { roomId: '123' } })

      expect(handle.source.url).toBe('/events/123')
    })

    it('should build URL with multiple URL params', () => {
      const chatEvents = declareEventSource({
        url: '/users/$userId/rooms/$roomId',
      })
      const handle = chatEvents({
        urlParams: { userId: 'user1', roomId: 'room1' },
      })

      expect(handle.source.url).toBe('/users/user1/rooms/room1')
    })

    it('should validate URL params with schema', () => {
      const chatEvents = declareEventSource({
        url: '/events/$roomId',
        urlParamsSchema: z.object({
          roomId: z.string().uuid(),
        }),
      })

      // Valid UUID should work
      const uuid = '550e8400-e29b-41d4-a716-446655440000'
      const handle = chatEvents({ urlParams: { roomId: uuid } })
      expect(handle.source.url).toBe(`/events/${uuid}`)

      // Invalid UUID should throw
      expect(() => chatEvents({ urlParams: { roomId: 'invalid' } })).toThrow()
    })

    it('should build URL with query params', () => {
      const events = declareEventSource({
        url: '/events',
        querySchema: z.object({
          token: z.string(),
          limit: z.number().optional(),
        }),
      })
      const handle = events({ params: { token: 'abc123', limit: 10 } })

      expect(handle.source.url).toContain('/events?')
      expect(handle.source.url).toContain('token=abc123')
      expect(handle.source.url).toContain('limit=10')
    })

    it('should build URL with both URL params and query params', () => {
      const chatEvents = declareEventSource({
        url: '/rooms/$roomId/events',
        querySchema: z.object({ token: z.string() }),
      })
      const handle = chatEvents({
        urlParams: { roomId: '123' },
        params: { token: 'secret' },
      })

      expect(handle.source.url).toBe('/rooms/123/events?token=secret')
    })
  })

  describe('withCredentials option', () => {
    it('should pass withCredentials to EventSource', () => {
      const events = declareEventSource({
        url: '/events',
        withCredentials: true,
      })
      const handle = events()

      expect(handle.source.withCredentials).toBe(true)
    })

    it('should default to false', () => {
      const events = declareEventSource({ url: '/events' })
      const handle = events()

      expect(handle.source.withCredentials).toBe(false)
    })
  })

  describe('EventSourceHandle', () => {
    describe('on/off methods', () => {
      it('should register event handlers', () => {
        const events = declareEventSource({ url: '/events' })
        const handle = events()

        const handler = vi.fn()
        handle.on('message', handler)

        getMock(handle.source).simulateMessage('{"text":"hello"}')

        expect(handler).toHaveBeenCalledWith({ text: 'hello' })
      })

      it('should register custom event handlers', () => {
        const events = declareEventSource({ url: '/events' })
        const handle = events()

        const handler = vi.fn()
        handle.on('custom-event', handler)

        getMock(handle.source).simulateEvent('custom-event', '{"data":"value"}')

        expect(handler).toHaveBeenCalledWith({ data: 'value' })
      })

      it('should remove specific handler with off', () => {
        const events = declareEventSource({ url: '/events' })
        const handle = events()

        const handler = vi.fn()
        handle.on('message', handler)
        handle.off('message', handler)

        getMock(handle.source).simulateMessage('{"text":"hello"}')

        expect(handler).not.toHaveBeenCalled()
      })

      it('should remove all handlers for event with off (no handler)', () => {
        const events = declareEventSource({ url: '/events' })
        const handle = events()

        const handler1 = vi.fn()
        const handler2 = vi.fn()
        handle.on('message', handler1)
        handle.on('message', handler2)

        handle.off('message')

        getMock(handle.source).simulateMessage('{"text":"hello"}')

        expect(handler1).not.toHaveBeenCalled()
        expect(handler2).not.toHaveBeenCalled()
      })
    })

    describe('onError method', () => {
      it('should register error handlers and return unsubscribe', () => {
        const events = declareEventSource({ url: '/events' })
        const handle = events()

        const handler = vi.fn()
        const unsubscribe = handle.onError(handler)

        getMock(handle.source).simulateError()

        expect(handler).toHaveBeenCalled()
        expect(unsubscribe).toBeTypeOf('function')

        // Unsubscribe
        unsubscribe()
        handler.mockClear()

        getMock(handle.source).simulateError()
        expect(handler).not.toHaveBeenCalled()
      })
    })

    describe('onOpen method', () => {
      it('should register open handlers and return unsubscribe', async () => {
        const events = declareEventSource({ url: '/events' })
        const handle = events()

        const handler = vi.fn()
        const unsubscribe = handle.onOpen(handler)

        // Wait for async open
        await new Promise((resolve) => setTimeout(resolve, 10))

        expect(handler).toHaveBeenCalled()
        expect(unsubscribe).toBeTypeOf('function')
      })

      it('should call handler immediately if already open', async () => {
        const events = declareEventSource({ url: '/events' })
        const handle = events()

        // Wait for connection to open
        await new Promise((resolve) => setTimeout(resolve, 10))

        // Now register handler after already open
        const handler = vi.fn()
        handle.onOpen(handler)

        // Should be called immediately
        expect(handler).toHaveBeenCalled()
      })
    })

    describe('close method', () => {
      it('should close the EventSource', () => {
        const events = declareEventSource({ url: '/events' })
        const handle = events()

        handle.close()

        expect(handle.source.readyState).toBe(MockEventSource.CLOSED)
        expect(handle.state).toBe('closed')
      })

      it('should cleanup event listeners on close', () => {
        const events = declareEventSource({ url: '/events' })
        const handle = events()

        handle.on('custom-event', vi.fn())
        handle.on('another-event', vi.fn())

        const source = getMock(handle.source)
        expect(source.getListenerCount('custom-event')).toBe(1)
        expect(source.getListenerCount('another-event')).toBe(1)

        handle.close()

        expect(source.getListenerCount('custom-event')).toBe(0)
        expect(source.getListenerCount('another-event')).toBe(0)
      })
    })

    describe('connected property', () => {
      it('should return false when connecting', () => {
        const events = declareEventSource({ url: '/events' })
        const handle = events()

        expect(handle.connected).toBe(false)
      })

      it('should return true when open', async () => {
        const events = declareEventSource({ url: '/events' })
        const handle = events()

        await new Promise((resolve) => setTimeout(resolve, 10))

        expect(handle.connected).toBe(true)
      })

      it('should return false when closed', async () => {
        const events = declareEventSource({ url: '/events' })
        const handle = events()

        await new Promise((resolve) => setTimeout(resolve, 10))
        handle.close()

        expect(handle.connected).toBe(false)
      })
    })

    describe('state property', () => {
      it('should return connecting initially', () => {
        const events = declareEventSource({ url: '/events' })
        const handle = events()

        expect(handle.state).toBe('connecting')
      })

      it('should return open when connected', async () => {
        const events = declareEventSource({ url: '/events' })
        const handle = events()

        await new Promise((resolve) => setTimeout(resolve, 10))

        expect(handle.state).toBe('open')
      })

      it('should return closed after close()', () => {
        const events = declareEventSource({ url: '/events' })
        const handle = events()

        handle.close()

        expect(handle.state).toBe('closed')
      })
    })

    describe('source property', () => {
      it('should expose the underlying EventSource', () => {
        const events = declareEventSource({ url: '/events' })
        const handle = events()

        expect(handle.source).toBeInstanceOf(MockEventSource)
      })
    })
  })

  describe('JSON parsing', () => {
    it('should parse JSON data', () => {
      const events = declareEventSource({ url: '/events' })
      const handle = events()

      const handler = vi.fn()
      handle.on('message', handler)

      getMock(handle.source).simulateMessage(JSON.stringify({ foo: 'bar', num: 123 }))

      expect(handler).toHaveBeenCalledWith({ foo: 'bar', num: 123 })
    })

    it('should return raw string if not valid JSON', () => {
      const events = declareEventSource({ url: '/events' })
      const handle = events()

      const handler = vi.fn()
      handle.on('message', handler)

      getMock(handle.source).simulateMessage('not json')

      expect(handler).toHaveBeenCalledWith('not json')
    })
  })
})
