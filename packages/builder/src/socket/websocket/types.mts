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
   * This wraps WebSocket.send() to provide Socket.IO-compatible API.
   * Messages are JSON serialized before sending.
   */
  emit(event: string, ...args: unknown[]): void

  /**
   * Register an event listener.
   *
   * Supports 'open', 'close', 'error', and custom message topics.
   */
  on(event: string, handler: (...args: unknown[]) => void): void

  /**
   * Remove an event listener.
   */
  off(event: string, handler?: (...args: unknown[]) => void): void

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
