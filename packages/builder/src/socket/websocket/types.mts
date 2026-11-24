import type { SocketError } from '../../errors/socket-error.mjs'
import type { HasProperty, SafeGet } from '../../types/request.mjs'
import type { Simplify, UrlHasParams, UrlParams } from '../../types/request.mjs'
import type { InferSchemaInput, Schema } from '../../types/schema.mjs'
import type { SocketClient } from '../types/socket-client.mjs'

/**
 * Connection state for the WebSocket handle.
 */
export type WebSocketHandleState = 'connecting' | 'open' | 'closing' | 'closed'

/**
 * Options for declareWebSocket.
 *
 * @template Url - URL template string (e.g., 'wss://api.example.com/ws/$roomId')
 * @template QuerySchema - Optional schema for query parameters
 * @template UrlParamsSchema - Optional schema for URL parameter validation
 */
export interface DeclareWebSocketOptions<
  Url extends string = string,
  QuerySchema extends Schema | undefined = Schema | undefined,
  UrlParamsSchema extends Schema | undefined = Schema | undefined,
> {
  /**
   * WebSocket URL (can include $param placeholders).
   *
   * @example 'wss://api.example.com/ws/$roomId'
   */
  url: Url

  /**
   * Optional schema (any Standard Schema) for query parameters. Its output
   * must be a plain object; each entry becomes one query parameter.
   *
   * The connection is opened synchronously, so the schema must validate
   * synchronously.
   */
  querySchema?: QuerySchema

  /**
   * Optional schema (any Standard Schema) for URL parameter validation.
   * Must validate synchronously, like `querySchema`.
   */
  urlParamsSchema?: UrlParamsSchema

  /**
   * Optional WebSocket sub-protocols.
   */
  protocols?: string[]
}

/**
 * Configuration for the WebSocket handler factory.
 */
export interface CreateWebSocketHandlerConfig {
  /**
   * Base WebSocket URL (e.g., 'wss://api.example.com').
   */
  baseUrl?: string

  /**
   * Called with a {@link SocketError} of kind `'transport'` when a listener
   * registered on the handle throws or the underlying `WebSocket` fails to
   * send. `topic` is the event name, `url` the connection URL and `cause`
   * the original error.
   *
   * An exception thrown inside the hook is caught and logged.
   */
  onError?: (error: SocketError) => void
}

/**
 * Infers the connection parameters from WebSocket options.
 */
export type InferWebSocketConnectParams<Options extends DeclareWebSocketOptions> = Simplify<
  // URL Parameters
  (UrlHasParams<Options['url']> extends true
    ? HasProperty<Options, 'urlParamsSchema'> extends true
      ? { urlParams: InferSchemaInput<SafeGet<Options, 'urlParamsSchema'>> }
      : { urlParams: UrlParams<Options['url']> }
    : {}) &
    // Query Parameters
    (HasProperty<Options, 'querySchema'> extends true
      ? { params: InferSchemaInput<SafeGet<Options, 'querySchema'>> }
      : {})
>

/**
 * WebSocket handle that implements the SocketClient interface.
 *
 * This allows the handle to be used with socketBuilder.provideClient().
 */
export interface WebSocketSocketHandle extends SocketClient {
  /**
   * Emit a message to the server.
   *
   * This wraps WebSocket.send() to provide Socket.IO-compatible API. The
   * frame is always `[event, ...args]`, JSON serialized, whatever the
   * arguments look like. A function passed as the last argument is not sent:
   * it is called with the server's `['__navios_ack:<event>', response]` reply.
   */
  emit(event: string, ...args: unknown[]): void

  /**
   * Send a message that is already in its wire format: `message` is JSON
   * serialized and sent as it is, without the `[event, ...]` envelope.
   *
   * `socketBuilder` sends through this method, so the output of a custom
   * `formatMessage` reaches the server unchanged.
   *
   * @param topic - Topic the message belongs to, used when a failure is reported
   * @param message - The formatted message
   */
  sendRaw(topic: string, message: unknown): void

  /**
   * Register an event listener.
   *
   * The names `open`, `close`, `error`, `message`, `connect`, `disconnect`
   * and `connect_error` are lifecycle events of the connection: `message`
   * receives every incoming frame (JSON-parsed) once, the others follow the
   * underlying `WebSocket`. A server message never triggers them, whatever
   * its topic is.
   *
   * Any other name is a topic: the listener receives the payload of each
   * `[topic, payload]` frame. For a topic that is named like a lifecycle
   * event use {@link WebSocketSocketHandle.onTopic}.
   */
  on(event: string, handler: (...args: unknown[]) => void): void

  /**
   * Remove an event listener registered with `on()`: a lifecycle listener
   * for a lifecycle event name, a topic listener for any other name.
   */
  off(event: string, handler?: (...args: unknown[]) => void): void

  /**
   * Listen to the `[topic, payload]` frames of one topic, whatever the topic
   * is called. This is the way to receive a server topic literally named
   * `close`, `open`, `error` or `message`, which `on()` treats as lifecycle
   * events. For other names it is the same as `on()`.
   *
   * @returns A function that removes the listener
   */
  onTopic(topic: string, handler: (payload: unknown) => void): () => void

  /**
   * Close the WebSocket connection.
   *
   * @param code - Optional close code (default: 1000)
   * @param reason - Optional close reason
   */
  disconnect(code?: number, reason?: string): void

  /**
   * Alias for disconnect().
   */
  close(code?: number, reason?: string): void

  /**
   * Full URL the WebSocket was opened with.
   */
  readonly url: string

  /**
   * Whether the socket is currently connected.
   */
  readonly connected: boolean

  /**
   * Current connection state.
   */
  readonly state: WebSocketHandleState

  /**
   * The underlying WebSocket instance.
   * Use with caution - prefer using the typed methods.
   */
  readonly socket: WebSocket
}

/**
 * WebSocket handler function type returned by declareWebSocket.
 *
 * When called with connection parameters, returns a WebSocketSocketHandle.
 */
export type WebSocketHandler<Options extends DeclareWebSocketOptions> = ((
  params: InferWebSocketConnectParams<Options>,
) => WebSocketSocketHandle) & {
  config: Options
}
