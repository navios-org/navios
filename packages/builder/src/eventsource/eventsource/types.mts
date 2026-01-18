import type { z, ZodObject } from 'zod/v4'

import type { HasProperty, SafeGet } from '../../types/builder-instance.mjs'
import type { Simplify, UrlHasParams, UrlParams } from '../../types/request.mjs'
import type { EventSourceClient } from '../types/eventsource-client.mjs'

/**
 * Connection state for the EventSource handle.
 */
export type EventSourceHandleState = 'connecting' | 'open' | 'closed'

/**
 * Options for declareEventSource.
 *
 * @template Url - URL template string (e.g., '/events/$roomId')
 * @template QuerySchema - Optional Zod schema for query parameters
 * @template UrlParamsSchema - Optional Zod schema for URL parameter validation
 */
export interface DeclareEventSourceOptions<
  Url extends string = string,
  QuerySchema extends ZodObject | undefined = ZodObject | undefined,
  UrlParamsSchema extends ZodObject | undefined = ZodObject | undefined,
> {
  /**
   * EventSource URL (can include $param placeholders).
   *
   * @example '/events/$roomId'
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
   * Whether to include credentials (cookies) in the request.
   */
  withCredentials?: boolean
}

/**
 * Configuration for the EventSource handler factory.
 */
export interface CreateEventSourceHandlerConfig {
  /**
   * Base URL for EventSource connections (e.g., 'https://api.example.com').
   */
  baseUrl?: string

  /**
   * Callback for errors during connection or message handling.
   */
  onError?: (error: unknown) => void
}

/**
 * Infers the connection parameters from EventSource options.
 */
export type InferEventSourceConnectParams<Options extends DeclareEventSourceOptions> = Simplify<
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
 * EventSource handle that implements the EventSourceClient interface.
 *
 * This allows the handle to be used with eventSourceBuilder.provideClient().
 */
export interface EventSourceHandle extends EventSourceClient {
  /**
   * Register an event listener.
   *
   * Supports 'open', 'error', 'message', and custom event names.
   */
  on(event: string, handler: (data: unknown) => void): void

  /**
   * Remove an event listener.
   */
  off(event: string, handler?: (data: unknown) => void): void

  /**
   * Register an error handler.
   */
  onError(handler: (error: Event) => void): () => void

  /**
   * Register a handler for connection open.
   */
  onOpen(handler: (event: Event) => void): () => void

  /**
   * Close the EventSource connection.
   */
  close(): void

  /**
   * Whether the EventSource is currently connected.
   */
  readonly connected: boolean

  /**
   * Current connection state.
   */
  readonly state: EventSourceHandleState

  /**
   * The underlying EventSource instance.
   * Use with caution - prefer using the typed methods.
   */
  readonly source: EventSource
}

/**
 * EventSource handler function type returned by declareEventSource.
 *
 * When called with connection parameters, returns an EventSourceHandle.
 */
export type EventSourceHandler<Options extends DeclareEventSourceOptions> = ((
  ...args: keyof InferEventSourceConnectParams<Options> extends never
    ? []
    : [params: InferEventSourceConnectParams<Options>]
) => EventSourceHandle) & {
  config: Options
}
