import { declareConnection, Listeners } from '../shared/realtime.mjs'

import { SocketError } from './socket-error.mjs'

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

/** A socket such as the one of `ws`, whose `send` takes a callback. Others ignore it. */
interface CallbackSocket {
  send(data: string, done: (error?: unknown) => void): void
}

// The states of a WebSocket, as numbers: the constructor may be one of the
// caller's, where there is no global `WebSocket` to read them from.
const CONNECTING = 0
const OPEN = 1
const CLOSING = 2

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
 *   baseURL: 'wss://api.example.com',
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
    return declareConnection(
      options,
      config.baseURL,
      () => config.WebSocket ?? globalThis.WebSocket,
      '[Navios-Socket]: this runtime has no WebSocket. Pass one to createWebSocketHandler({ WebSocket })',
      (WebSocketImpl, fullUrl) =>
        openWebSocket(new WebSocketImpl(fullUrl, options.protocols) as WebSocket, fullUrl, config),
    ) as WebSocketHandler<Options>
  }
}

/** Wraps an open `WebSocket` in a handle. */
function openWebSocket(
  ws: WebSocket,
  fullUrl: string,
  config: CreateWebSocketHandlerConfig,
): WebSocketSocketHandle {
  const isPlatformSocket =
    typeof globalThis.WebSocket === 'function' && ws instanceof globalThis.WebSocket

  // Track state
  let currentState: WebSocketHandleState = 'connecting'

  // Lifecycle events of the connection and topics of server messages are
  // kept apart, so a server topic named like a lifecycle event can never run
  // a lifecycle listener. Every acknowledgement is an event of its own, which
  // `Listeners` forgets once it has no handlers.
  type Handler = (...args: unknown[]) => void
  const lifecycleHandlers = new Listeners<Handler>()
  const topicHandlers = new Listeners<Handler>()

  const handlersFor = (event: string) =>
    LIFECYCLE_EVENTS.has(event) ? lifecycleHandlers : topicHandlers

  // Helper to notify the listeners of one registry
  const notify = (registry: Listeners<Handler>, event: string, ...args: unknown[]) => {
    registry.emit(event, (handler) => {
      try {
        handler(...args)
      } catch (cause) {
        SocketError.report(config.onError, {
          kind: 'transport',
          topic: event,
          url: fullUrl,
          cause,
        })
      }
    })
  }

  // Set up WebSocket event handlers
  ws.onopen = (event) => {
    currentState = 'open'
    notify(lifecycleHandlers, 'open', event)
    notify(lifecycleHandlers, 'connect')
  }

  ws.onclose = (event) => {
    currentState = 'closed'
    notify(lifecycleHandlers, 'close', event)
    notify(lifecycleHandlers, 'disconnect', event.reason)
  }

  ws.onerror = (event) => {
    notify(lifecycleHandlers, 'error', event)
    notify(lifecycleHandlers, 'connect_error', event)
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
    notify(lifecycleHandlers, 'message', data)

    // A frame in the array format also goes to the listeners of its topic.
    // This handles both regular messages and acknowledgement responses
    if (Array.isArray(data) && data.length >= 2 && typeof data[0] === 'string') {
      notify(topicHandlers, data[0], data[1])
    }
  }

  const failSend = (event: string, reason: string, cause?: unknown) =>
    SocketError.report(config.onError, {
      kind: 'transport',
      topic: event,
      url: fullUrl,
      message: `Failed to send "${event}" over the WebSocket${reason}`,
      ...(cause !== undefined ? { cause } : {}),
    })

  // Serializes and sends one frame. A frame that could not be sent is
  // reported to `onError` and thrown, so the caller knows that nothing was
  // sent. A closed `WebSocket` would not throw, but discard the frame. A
  // class of the caller may keep it until it is open again, so it decides;
  // `ws` tells the callback that it did not.
  const transmit = (event: string, data: unknown) => {
    if (isPlatformSocket && ws.readyState !== OPEN) {
      throw failSend(event, ': it is not open')
    }
    try {
      const frame = JSON.stringify(data)
      if (isPlatformSocket) ws.send(frame)
      else (ws as CallbackSocket).send(frame, (cause) => cause && failSend(event, '', cause))
    } catch (cause) {
      throw failSend(event, '', cause)
    }
  }

  const handle: WebSocketSocketHandle = {
    emit(event: string, ...args: unknown[]): void {
      if (args.some((arg) => typeof arg === 'function')) {
        throw failSend(
          event,
          ': a function cannot be sent. Use defineSend with an ackSchema to wait for a reply',
        )
      }
      // The format is [event, ...args], whatever the arguments look like.
      // Messages that are already formatted go through sendRaw instead.
      transmit(event, [event, ...args])
    },

    sendRaw(topic: string, message: unknown): void {
      transmit(topic, message)
    },

    on(event: string, handler: Handler): void {
      handlersFor(event).add(event, handler)
    },

    off(event: string, handler?: Handler): void {
      handlersFor(event).remove(event, handler)
    },

    onTopic(topic: string, handler: (payload: unknown) => void): () => void {
      topicHandlers.add(topic, handler)
      return () => {
        topicHandlers.remove(topic, handler)
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
      return ws.readyState === OPEN
    },

    get state(): WebSocketHandleState {
      if (currentState === 'closing' || currentState === 'closed') {
        return currentState
      }
      switch (ws.readyState) {
        case CONNECTING:
          return 'connecting'
        case OPEN:
          return 'open'
        case CLOSING:
          return 'closing'
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
