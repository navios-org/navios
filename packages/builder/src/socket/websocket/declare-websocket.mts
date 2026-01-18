import type { ZodObject } from 'zod/v4'

import { bindUrlParams } from '../../request/bind-url-params.mjs'

import type {
  CreateWebSocketHandlerConfig,
  DeclareWebSocketOptions,
  WebSocketHandler,
  WebSocketHandleState,
  WebSocketSocketHandle,
} from './types.mjs'

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
 * import { z } from 'zod'
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

      // Construct full WebSocket URL
      const baseUrl = config.baseUrl ?? ''
      const fullUrl = `${baseUrl}${urlPart}${queryString ? `?${queryString}` : ''}`

      // Create WebSocket
      const ws = new WebSocket(fullUrl, options.protocols)

      // Track state
      let currentState: WebSocketHandleState = 'connecting'

      // Event listener management (Socket.IO compatible)
      type Handler = (...args: unknown[]) => void
      const eventHandlers = new Map<string, Set<Handler>>()

      // Helper to get or create handler set
      const getHandlers = (event: string): Set<Handler> => {
        let handlers = eventHandlers.get(event)
        if (!handlers) {
          handlers = new Set()
          eventHandlers.set(event, handlers)
        }
        return handlers
      }

      // Helper to dispatch event to handlers
      const dispatch = (event: string, ...args: unknown[]) => {
        const handlers = eventHandlers.get(event)
        if (handlers) {
          handlers.forEach((handler) => {
            try {
              handler(...args)
            } catch (error) {
              config.onError?.(error)
            }
          })
        }
      }

      // Set up WebSocket event handlers
      ws.onopen = (event) => {
        currentState = 'open'
        dispatch('open', event)
        dispatch('connect') // Socket.IO compatibility
      }

      ws.onclose = (event) => {
        currentState = 'closed'
        dispatch('close', event)
        dispatch('disconnect', event.reason) // Socket.IO compatibility
      }

      ws.onerror = (event) => {
        dispatch('error', event)
        dispatch('connect_error', event) // Socket.IO compatibility
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

        // Dispatch to 'message' handlers (for socketBuilder compatibility)
        dispatch('message', data)

        // Also dispatch to topic-specific handlers if data is array format
        // This handles both regular messages and acknowledgement responses
        if (Array.isArray(data) && data.length >= 2 && typeof data[0] === 'string') {
          const topic = data[0]
          const payload = data[1]
          dispatch(topic, payload)
        }
      }

      // Create Socket.IO-compatible handle
      const handle: WebSocketSocketHandle = {
        emit(event: string, ...args: unknown[]): void {
          // When used with socketBuilder, the first arg is already the formatted message
          // (e.g., [topic, payload, ackId?]). We send it directly to avoid double-wrapping.
          //
          // When used directly (Socket.IO style), args contain the raw payload.
          // We detect this by checking if the first arg is already an array with the event.
          const firstArg = args[0]
          const isPreformatted =
            Array.isArray(firstArg) && firstArg.length >= 2 && typeof firstArg[0] === 'string'

          // Check if last arg is a callback (for ack support in direct usage)
          let callback: Handler | undefined
          let messageArgs = args
          if (args.length > 0 && typeof args[args.length - 1] === 'function') {
            callback = args[args.length - 1] as Handler
            messageArgs = args.slice(0, -1)
          }

          // Determine what to send
          let dataToSend: unknown
          if (isPreformatted) {
            // Used by socketBuilder - data is already formatted
            dataToSend = firstArg
          } else {
            // Direct usage - create Socket.IO format [event, ...args]
            dataToSend =
              messageArgs.length === 1 ? [event, messageArgs[0]] : [event, ...messageArgs]
          }

          // Send as JSON
          try {
            ws.send(JSON.stringify(dataToSend))
          } catch (error) {
            config.onError?.(error)
          }

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

        on(event: string, handler: Handler): void {
          getHandlers(event).add(handler)
        },

        off(event: string, handler?: Handler): void {
          if (handler) {
            eventHandlers.get(event)?.delete(handler)
          } else {
            eventHandlers.delete(event)
          }
        },

        disconnect(code = 1000, reason?: string): void {
          currentState = 'closing'
          ws.close(code, reason)
        },

        close(code = 1000, reason?: string): void {
          this.disconnect(code, reason)
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
