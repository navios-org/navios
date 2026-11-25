import { appendQuery } from '../shared/append-query.mjs'
import { bindUrlParams } from '../shared/bind-url-params.mjs'
import { parseSync } from '../shared/validate.mjs'

import { reportSocketError } from './report-socket-error.mjs'

import type {
  CreateWebSocketHandlerConfig,
  DeclareWebSocketOptions,
} from './declare-websocket-options.mjs'
import type {
  WebSocketHandler,
  WebSocketHandleState,
  WebSocketSocketHandle,
} from './websocket-handle.mjs'

/**
 * Events of the connection itself. `handle.on()` with one of these names
 * registers a lifecycle listener; a server message can never trigger it.
 */
const LIFECYCLE_EVENTS: ReadonlySet<string> = new Set([
  'open',
  'connect',
  'close',
  'disconnect',
  'error',
  'connect_error',
  'message',
])

/**
 * Creates a WebSocket handler factory function.
 *
 * This factory creates WebSocket connections that implement the SocketClient
 * interface, making them compatible with socketBuilder.provideClient().
 *
 * @param config - Configuration for the WebSocket handlers
 * @returns A function that creates WebSocket endpoint declarations
 *
 * @example
 * ```ts
 * import { createWebSocketHandler } from '@navios/builder/socket'
 * // `z` is Zod here; any Standard Schema library works the same way
 *
 * const declareWebSocket = createWebSocketHandler({
 *   baseUrl: 'wss://api.example.com',
 * })
 *
 * const chatSocket = declareWebSocket({
 *   url: '/ws/chat/$roomId',
 *   querySchema: z.object({ token: z.string() }),
 *   urlParamsSchema: z.object({ roomId: z.string().uuid() }),
 * })
 *
 * // Connect and use with socketBuilder
 * const handle = chatSocket({
 *   urlParams: { roomId: 'abc-123' },
 *   params: { token: 'my-token' },
 * })
 *
 * socket.provideClient(handle)
 * ```
 */
export function createWebSocketHandler(config: CreateWebSocketHandlerConfig = {}) {
  return function declareWebSocket<const Options extends DeclareWebSocketOptions>(
    options: Options,
  ): WebSocketHandler<Options> {
    const handlerFn = (params: Record<string, unknown>): WebSocketSocketHandle => {
      // Build URL with params
      const urlPart = bindUrlParams(
        options.url,
        params as { urlParams?: Record<string, string | number> },
        options.urlParamsSchema,
      )

      // Validate query parameters
      const query =
        options.querySchema && 'params' in params && params.params
          ? (parseSync(options.querySchema, params.params) as Record<string, unknown>)
          : undefined

      // Construct full WebSocket URL
      const fullUrl = appendQuery(`${config.baseUrl ?? ''}${urlPart}`, query)

      // Create WebSocket
      const ws = new WebSocket(fullUrl, options.protocols)

      // Track state
      let currentState: WebSocketHandleState = 'connecting'

      // Listener management (Socket.IO compatible). Lifecycle events of the
      // connection and topics of server messages are kept apart, so a server
      // topic named like a lifecycle event can never run a lifecycle listener.
      type Handler = (...args: unknown[]) => void
      const lifecycleHandlers = new Map<string, Set<Handler>>()
      const topicHandlers = new Map<string, Set<Handler>>()

      const handlersFor = (event: string) =>
        LIFECYCLE_EVENTS.has(event) ? lifecycleHandlers : topicHandlers

      const addHandler = (registry: Map<string, Set<Handler>>, event: string, handler: Handler) => {
        let handlers = registry.get(event)
        if (!handlers) {
          handlers = new Set()
          registry.set(event, handlers)
        }
        handlers.add(handler)
      }

      // Helper to dispatch to the listeners of one registry
      const dispatch = (registry: Map<string, Set<Handler>>, event: string, ...args: unknown[]) => {
        const handlers = registry.get(event)
        if (handlers) {
          handlers.forEach((handler) => {
            try {
              handler(...args)
            } catch (cause) {
              reportSocketError(config.onError, {
                kind: 'transport',
                topic: event,
                url: fullUrl,
                cause,
              })
            }
          })
        }
      }

      // Set up WebSocket event handlers
      ws.onopen = (event) => {
        currentState = 'open'
        dispatch(lifecycleHandlers, 'open', event)
        dispatch(lifecycleHandlers, 'connect') // Socket.IO compatibility
      }

      ws.onclose = (event) => {
        currentState = 'closed'
        dispatch(lifecycleHandlers, 'close', event)
        dispatch(lifecycleHandlers, 'disconnect', event.reason) // Socket.IO compatibility
      }

      ws.onerror = (event) => {
        dispatch(lifecycleHandlers, 'error', event)
        dispatch(lifecycleHandlers, 'connect_error', event) // Socket.IO compatibility
      }

      ws.onmessage = (event) => {
        let data: unknown = event.data

        // Try to parse JSON
        if (typeof data === 'string') {
          try {
            data = JSON.parse(data)
          } catch {
            // Keep as string if not valid JSON
          }
        }

        // Every frame goes to the 'message' listeners once (socketBuilder
        // listens here and routes by its own parseMessage)
        dispatch(lifecycleHandlers, 'message', data)

        // A frame in the array format also goes to the listeners of its topic.
        // This handles both regular messages and acknowledgement responses
        if (Array.isArray(data) && data.length >= 2 && typeof data[0] === 'string') {
          dispatch(topicHandlers, data[0], data[1])
        }
      }

      // Serializes and sends one frame. A frame that could not be sent (the
      // socket is still connecting, already closed, ...) is reported to
      // `onError` and thrown, so the caller knows that nothing was sent.
      const transmit = (event: string, data: unknown) => {
        try {
          ws.send(JSON.stringify(data))
        } catch (cause) {
          throw reportSocketError(config.onError, {
            kind: 'transport',
            topic: event,
            url: fullUrl,
            message: `Failed to send "${event}" over the WebSocket`,
            cause,
          })
        }
      }

      // Create Socket.IO-compatible handle
      const handle: WebSocketSocketHandle = {
        emit(event: string, ...args: unknown[]): void {
          // Check if last arg is a callback (for ack support in direct usage)
          let callback: Handler | undefined
          let messageArgs = args
          if (args.length > 0 && typeof args[args.length - 1] === 'function') {
            callback = args[args.length - 1] as Handler
            messageArgs = args.slice(0, -1)
          }

          // Socket.IO format [event, ...args], whatever the arguments look like.
          // Messages that are already formatted go through sendRaw instead.
          transmit(event, [event, ...messageArgs])

          // If callback provided, set up one-time listener for ack
          if (callback) {
            // Use reserved namespace for acks to match socketBuilder
            const ackEvent = `__navios_ack:${event}`
            const ackHandler = (...ackArgs: unknown[]) => {
              handle.off(ackEvent, ackHandler)
              callback!(...ackArgs)
            }
            handle.on(ackEvent, ackHandler)
          }
        },

        sendRaw(topic: string, message: unknown): void {
          transmit(topic, message)
        },

        on(event: string, handler: Handler): void {
          addHandler(handlersFor(event), event, handler)
        },

        off(event: string, handler?: Handler): void {
          const registry = handlersFor(event)
          if (handler) {
            registry.get(event)?.delete(handler)
          } else {
            registry.delete(event)
          }
        },

        onTopic(topic: string, handler: (payload: unknown) => void): () => void {
          addHandler(topicHandlers, topic, handler)
          return () => {
            topicHandlers.get(topic)?.delete(handler)
          }
        },

        disconnect(code = 1000, reason?: string): void {
          currentState = 'closing'
          ws.close(code, reason)
        },

        close(code = 1000, reason?: string): void {
          this.disconnect(code, reason)
        },

        get url(): string {
          return fullUrl
        },

        get connected(): boolean {
          return ws.readyState === WebSocket.OPEN
        },

        get state(): WebSocketHandleState {
          if (currentState === 'closing' || currentState === 'closed') {
            return currentState
          }
          switch (ws.readyState) {
            case WebSocket.CONNECTING:
              return 'connecting'
            case WebSocket.OPEN:
              return 'open'
            case WebSocket.CLOSING:
              return 'closing'
            case WebSocket.CLOSED:
              return 'closed'
            default:
              return 'closed'
          }
        },

        get socket(): WebSocket {
          return ws
        },
      }

      return handle
    }

    // Create handler with config attached
    const handler = handlerFn as unknown as WebSocketHandler<Options>
    handler.config = options

    return handler
  }
}

/**
 * Convenience function to create a WebSocket declaration without a factory.
 *
 * Equivalent to `createWebSocketHandler()(options)`.
 *
 * @example
 * ```ts
 * import { declareWebSocket } from '@navios/builder/socket'
 *
 * const chatSocket = declareWebSocket({
 *   url: 'wss://api.example.com/ws/chat/$roomId',
 *   urlParamsSchema: z.object({ roomId: z.string() }),
 * })
 *
 * const handle = chatSocket({ urlParams: { roomId: '123' } })
 * socket.provideClient(handle)
 * ```
 */
export function declareWebSocket<const Options extends DeclareWebSocketOptions>(
  options: Options,
): WebSocketHandler<Options> {
  return createWebSocketHandler()(options)
}
