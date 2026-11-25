import { appendQuery } from '../shared/append-query.mjs'
import { bindUrlParams } from '../shared/bind-url-params.mjs'
import { dispatch } from '../shared/dispatch.mjs'
import { NaviosError } from '../shared/navios-error.mjs'
import { parseQuery } from '../shared/validate.mjs'

import { reportEventSourceError } from './report-eventsource-error.mjs'

import type {
  CreateEventSourceHandlerConfig,
  DeclareEventSourceOptions,
} from './declare-eventsource-options.mjs'
import type {
  EventSourceHandler,
  EventSourceHandleState,
  EventSourceHandle,
} from './eventsource-handle.mjs'

// The states of an EventSource, as numbers: the constructor may be one of the
// caller's, where there is no global `EventSource` to read them from.
const CONNECTING = 0
const OPEN = 1
const CLOSED = 2

/**
 * Whether an event was sent by the server. The connection has events of its own,
 * `open` and `error`, and nothing keeps a server from using these names.
 */
function isServerEvent(event: object): event is MessageEvent<string> {
  return 'data' in event
}

/** Event data as JSON, or as it is when it is not JSON. */
function parseData(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

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
 * // `z` is Zod here; any Standard Schema library works the same way
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
export function createEventSourceHandler(config: CreateEventSourceHandlerConfig = {}) {
  return function declareEventSource<const Options extends DeclareEventSourceOptions>(
    options: Options,
  ): EventSourceHandler<Options> {
    const handlerFn = (
      params: {
        urlParams?: Record<string, unknown>
        params?: Record<string, unknown>
      } = {},
    ): EventSourceHandle => {
      const EventSourceImpl = config.EventSource ?? globalThis.EventSource
      if (!EventSourceImpl) {
        throw new NaviosError(
          '[Navios-EventSource]: this runtime has no EventSource. Pass one to createEventSourceHandler({ EventSource })',
        )
      }

      // Build URL with params
      const urlPart = bindUrlParams(options.url, params, options.urlParamsSchema)

      // Validate query parameters, so that defaults and required fields apply
      // to a call without any
      const query = parseQuery(options.querySchema, params.params)

      // Construct full EventSource URL
      const fullUrl = appendQuery(`${config.baseUrl ?? ''}${urlPart}`, query)

      // Create EventSource
      const eventSource = new EventSourceImpl(fullUrl, {
        withCredentials: options.withCredentials,
      }) as EventSource

      // Track state
      let currentState: EventSourceHandleState = 'connecting'

      // Event listener management
      type Handler = (data: unknown, text?: string) => void
      const eventHandlers = new Map<string, Set<Handler>>()
      const errorHandlers = new Set<(error: Event) => void>()
      const openHandlers = new Set<(event: Event) => void>()

      // Calls one listener. A throwing listener must not stop its siblings; it
      // is reported instead.
      const callSafely = (eventName: string, call: () => void) => {
        try {
          call()
        } catch (cause) {
          reportEventSourceError(config.onError, {
            kind: 'transport',
            eventName,
            url: fullUrl,
            cause,
          })
        }
      }

      // Helper to get or create handler set
      const getHandlers = (event: string): Set<Handler> => {
        let handlers = eventHandlers.get(event)
        if (!handlers) {
          handlers = new Set()
          eventHandlers.set(event, handlers)
        }
        return handlers
      }

      const deliver = (eventName: string, event: MessageEvent<string>) => {
        const data = parseData(event.data)
        dispatch(
          () => eventHandlers.get(eventName),
          (handler) => callSafely(eventName, () => handler(data, event.data)),
        )
      }

      // The last `open` event, for listeners that are added after it
      let openEvent: Event | undefined

      // Set up EventSource event handlers
      eventSource.onopen = (event) => {
        if (isServerEvent(event)) return
        currentState = 'open'
        openEvent = event
        dispatch(
          () => openHandlers,
          (handler) => callSafely('open', () => handler(event)),
        )
      }

      eventSource.onerror = (event) => {
        if (isServerEvent(event)) return
        dispatch(
          () => errorHandlers,
          (handler) => callSafely('error', () => handler(event)),
        )
        if (eventSource.readyState === CLOSED) {
          currentState = 'closed'
        }
      }

      // Handle default 'message' events (events without a specific type)
      eventSource.onmessage = (event) => deliver('message', event)

      // Track which custom event listeners have been set up on the EventSource
      // Store listener references for cleanup
      const eventSourceListeners = new Map<string, (event: Event) => void>()

      // Helper to set up listener for custom events
      const setupEventListener = (eventName: string) => {
        if (eventSourceListeners.has(eventName) || eventName === 'message') {
          return
        }

        const listener = (event: Event) => {
          if (isServerEvent(event)) deliver(eventName, event)
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
          if (eventSource.readyState === OPEN) {
            callSafely('open', () => handler(openEvent ?? ({ type: 'open' } as Event)))
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

        get url(): string {
          return fullUrl
        },

        get connected(): boolean {
          return eventSource.readyState === OPEN
        },

        get state(): EventSourceHandleState {
          if (currentState === 'closed') return 'closed'
          switch (eventSource.readyState) {
            case CONNECTING:
              return 'connecting'
            case OPEN:
              return 'open'
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
