import type { InferSchemaInput, Schema } from '../shared/schema.mjs'
import type { HasProperty, OptionalIfEmpty, SafeGet, Simplify } from '../shared/type-helpers.mjs'
import type { UrlHasParams, UrlParams } from '../shared/url-params.mjs'

import type { SocketError } from './socket-error.mjs'

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
   * must be a plain object; each entry becomes one query parameter. Omitted
   * `params` are validated as an empty object.
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

/** What `declareWebSocket` uses of a `WebSocket`. */
export interface WebSocketLike {
  readonly readyState: number
  onopen: ((event: never) => unknown) | null
  onclose: ((event: never) => unknown) | null
  onerror: ((event: never) => unknown) | null
  onmessage: ((event: never) => unknown) | null
  send(data: string): void
  close(code?: number, reason?: string): void
}

/** A `WebSocket` class: the global one, or one of a library such as `ws`. */
export type WebSocketConstructor = new (url: string, protocols?: string[]) => WebSocketLike

/**
 * Configuration for the WebSocket handler factory.
 */
export interface CreateWebSocketHandlerConfig {
  /**
   * Base WebSocket URL (e.g., 'wss://api.example.com').
   */
  baseUrl?: string

  /**
   * The class connections are opened with, for runtimes without a global
   * `WebSocket` or to pass headers the standard one cannot send.
   *
   * What becomes of a message while the connection is not open is up to the
   * class: `reconnecting-websocket` keeps it, `ws` discards it, which is
   * reported to `onError`. With the standard class the send throws.
   *
   * @default the global `WebSocket`, looked up for every connection
   */
  WebSocket?: WebSocketConstructor

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
      ? OptionalIfEmpty<'params', InferSchemaInput<SafeGet<Options, 'querySchema'>>>
      : {})
>
