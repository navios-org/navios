import type { z, ZodObject } from 'zod/v4'

import type { SocketClient } from '../types/socket-client.mjs'
import type { Simplify, UrlHasParams, UrlParams } from '../../types/request.mjs'
import type { HasProperty, SafeGet } from '../../types/builder-instance.mjs'

/**
 * Connection state for the WebSocket handle.
 */
export type WebSocketHandleState = 'connecting' | 'open' | 'closing' | 'closed'

/**
 * Options for declareWebSocket.
 *
 * @template Url - URL template string (e.g., 'wss://api.example.com/ws/$roomId')
 * @template QuerySchema - Optional Zod schema for query parameters
 * @template UrlParamsSchema - Optional Zod schema for URL parameter validation
 */
export interface DeclareWebSocketOptions<
  Url extends string = string,
  QuerySchema extends ZodObject | undefined = ZodObject | undefined,
  UrlParamsSchema extends ZodObject | undefined = ZodObject | undefined,
> {
  /**
   * WebSocket URL (can include $param placeholders).
   *
   * @example 'wss://api.example.com/ws/$roomId'
   */
  url: Url

  /**
   * Optional Zod schema for query parameters.
   */
  querySchema?: QuerySchema

  /**
   * Optional Zod schema for URL parameter validation.
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
   * Callback for errors during message parsing/sending.
   */
  onError?: (error: unknown) => void
}

/**
 * Infers the connection parameters from WebSocket options.
 */
export type InferWebSocketConnectParams<Options extends DeclareWebSocketOptions> = Simplify<
  // URL Parameters
  (UrlHasParams<Options['url']> extends true
    ? HasProperty<Options, 'urlParamsSchema'> extends true
      ? { urlParams: z.input<SafeGet<Options, 'urlParamsSchema'> & ZodObject> }
      : { urlParams: UrlParams<Options['url']> }
    : {}) &
  // Query Parameters
  (HasProperty<Options, 'querySchema'> extends true
    ? { params: z.input<SafeGet<Options, 'querySchema'> & ZodObject> }
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
