import type { ZodObject } from 'zod/v4'

import { bindUrlParams } from '../../request/bind-url-params.mjs'

import type {
  CreateEventSourceHandlerConfig,
  DeclareEventSourceOptions,
  EventSourceHandler,
  EventSourceHandleState,
  EventSourceHandle,
} from './types.mjs'

/**
 * Creates an EventSource handler factory function.
 *
 * This factory creates EventSource connections that implement the EventSourceClient
 * interface, making them compatible with eventSourceBuilder.provideClient().
 *
 * @param config - Configuration for the EventSource handlers
 * @returns A function that creates EventSource endpoint declarations
 *
 * @example
 * ```ts
 * import { createEventSourceHandler } from '@navios/builder/eventsource'
 * import { z } from 'zod'
 *
 * const declareEventSource = createEventSourceHandler({
 *   baseUrl: 'https://api.example.com',
 * })
 *
 * const chatEvents = declareEventSource({
 *   url: '/events/$roomId',
 *   querySchema: z.object({ token: z.string() }),
 *   urlParamsSchema: z.object({ roomId: z.string().uuid() }),
 * })
 *
 * // Connect and use with eventSourceBuilder
 * const handle = chatEvents({
 *   urlParams: { roomId: 'abc-123' },
 *   params: { token: 'my-token' },
 * })
 *
 * sse.provideClient(handle)
 * ```
 */
export function createEventSourceHandler(
  config: CreateEventSourceHandlerConfig = {},
) {
  return function declareEventSource<const Options extends DeclareEventSourceOptions>(
    options: Options,
  ): EventSourceHandler<Options> {
    const handlerFn = (params: Record<string, unknown> = {}): EventSourceHandle => {
      // Build URL with params
      const urlPart = bindUrlParams(
        options.url,
        params as { urlParams?: Record<string, string | number> },
        options.urlParamsSchema as ZodObject | undefined,
      )

      // Build query string
      let queryString = ''
      if (options.querySchema && 'params' in params && params.params) {
        const parsed = (options.querySchema as ZodObject).parse(params.params)
        const searchParams = new URLSearchParams()
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
          if (value !== undefined && value !== null) {
            searchParams.append(key, String(value))
          }
        }
        queryString = searchParams.toString()
      }

      // Construct full EventSource URL
      const baseUrl = config.baseUrl ?? ''
      const fullUrl = `${baseUrl}${urlPart}${queryString ? `?${queryString}` : ''}`

      // Create EventSource
      const eventSource = new EventSource(fullUrl, {
        withCredentials: options.withCredentials,
      })

      // Track state
      let currentState: EventSourceHandleState = 'connecting'

      // Event listener management
      type Handler = (data: unknown) => void
      const eventHandlers = new Map<string, Set<Handler>>()
      const errorHandlers = new Set<(error: Event) => void>()
      const openHandlers = new Set<(event: Event) => void>()

      // Helper to get or create handler set
      const getHandlers = (event: string): Set<Handler> => {
        let handlers = eventHandlers.get(event)
        if (!handlers) {
          handlers = new Set()
          eventHandlers.set(event, handlers)
        }
        return handlers
      }

      // Helper to parse event data (JSON by default)
      const parseData = (rawData: string): unknown => {
        try {
          return JSON.parse(rawData)
        } catch {
          return rawData
        }
      }

      // Set up EventSource event handlers
      eventSource.onopen = (event) => {
        currentState = 'open'
        openHandlers.forEach((handler) => {
          try {
            handler(event)
          } catch (error) {
            config.onError?.(error)
          }
        })
      }

      eventSource.onerror = (event) => {
        errorHandlers.forEach((handler) => {
          try {
            handler(event)
          } catch (error) {
            config.onError?.(error)
          }
        })
        if (eventSource.readyState === EventSource.CLOSED) {
          currentState = 'closed'
        }
      }

      // Handle default 'message' events (events without a specific type)
      eventSource.onmessage = (event) => {
        const data = parseData(event.data)
        const handlers = eventHandlers.get('message')
        if (handlers) {
          handlers.forEach((handler) => {
            try {
              handler(data)
            } catch (error) {
              config.onError?.(error)
            }
          })
        }
      }

      // Track which custom event listeners have been set up on the EventSource
      // Store listener references for cleanup
      const eventSourceListeners = new Map<string, (event: MessageEvent) => void>()

      // Helper to set up listener for custom events
      const setupEventListener = (eventName: string) => {
        if (eventSourceListeners.has(eventName) || eventName === 'message') {
          return
        }

        const listener = (event: MessageEvent) => {
          const data = parseData(event.data)
          const handlers = eventHandlers.get(eventName)
          if (handlers) {
            handlers.forEach((handler) => {
              try {
                handler(data)
              } catch (error) {
                config.onError?.(error)
              }
            })
          }
        }

        eventSource.addEventListener(eventName, listener)
        eventSourceListeners.set(eventName, listener)
      }

      // Create handle
      const handle: EventSourceHandle = {
        on(event: string, handler: Handler): void {
          // Set up listener for custom events lazily
          setupEventListener(event)
          getHandlers(event).add(handler)
        },

        off(event: string, handler?: Handler): void {
          if (handler) {
            eventHandlers.get(event)?.delete(handler)
          } else {
            eventHandlers.delete(event)
          }
        },

        onError(handler: (error: Event) => void): () => void {
          errorHandlers.add(handler)
          return () => {
            errorHandlers.delete(handler)
          }
        },

        onOpen(handler: (event: Event) => void): () => void {
          openHandlers.add(handler)
          // If already open, call immediately
          if (eventSource.readyState === EventSource.OPEN) {
            try {
              handler(new Event('open'))
            } catch (error) {
              config.onError?.(error)
            }
          }
          return () => {
            openHandlers.delete(handler)
          }
        },

        close(): void {
          currentState = 'closed'
          // Clean up all event listeners before closing
          eventSourceListeners.forEach((listener, eventName) => {
            eventSource.removeEventListener(eventName, listener)
          })
          eventSourceListeners.clear()
          eventHandlers.clear()
          errorHandlers.clear()
          openHandlers.clear()
          eventSource.close()
        },

        get connected(): boolean {
          return eventSource.readyState === EventSource.OPEN
        },

        get state(): EventSourceHandleState {
          if (currentState === 'closed') return 'closed'
          switch (eventSource.readyState) {
            case EventSource.CONNECTING:
              return 'connecting'
            case EventSource.OPEN:
              return 'open'
            case EventSource.CLOSED:
              return 'closed'
            default:
              return 'closed'
          }
        },

        get source(): EventSource {
          return eventSource
        },
      }

      return handle
    }

    // Create handler with config attached
    const handler = handlerFn as unknown as EventSourceHandler<Options>
    handler.config = options

    return handler
  }
}

/**
 * Convenience function to create an EventSource declaration without a factory.
 *
 * Equivalent to `createEventSourceHandler()(options)`.
 *
 * @example
 * ```ts
 * import { declareEventSource } from '@navios/builder/eventsource'
 *
 * const chatEvents = declareEventSource({
 *   url: '/events/$roomId',
 *   urlParamsSchema: z.object({ roomId: z.string() }),
 * })
 *
 * const handle = chatEvents({ urlParams: { roomId: '123' } })
 * sse.provideClient(handle)
 * ```
 */
export function declareEventSource<const Options extends DeclareEventSourceOptions>(
  options: Options,
): EventSourceHandler<Options> {
  return createEventSourceHandler()(options)
}
