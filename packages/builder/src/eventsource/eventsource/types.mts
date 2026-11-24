import type { EventSourceError } from '../../errors/eventsource-error.mjs'
import type { HasProperty, SafeGet } from '../../types/request.mjs'
import type { Simplify, UrlHasParams, UrlParams } from '../../types/request.mjs'
import type { InferSchemaInput, Schema } from '../../types/schema.mjs'
import type { EventSourceClient } from '../types/eventsource-client.mjs'

/**
 * Connection state for the EventSource handle.
 */
export type EventSourceHandleState = 'connecting' | 'open' | 'closed'

/**
 * Options for declareEventSource.
 *
 * @template Url - URL template string (e.g., '/events/$roomId')
 * @template QuerySchema - Optional schema for query parameters
 * @template UrlParamsSchema - Optional schema for URL parameter validation
 */
export interface DeclareEventSourceOptions<
  Url extends string = string,
  QuerySchema extends Schema | undefined = Schema | undefined,
  UrlParamsSchema extends Schema | undefined = Schema | undefined,
> {
  /**
   * EventSource URL (can include $param placeholders).
   *
   * @example '/events/$roomId'
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
   * Called with an {@link EventSourceError} of kind `'transport'` when a
   * listener registered on the handle throws. `eventName` is the event the
   * listener was registered for (`'open'` and `'error'` for `onOpen` /
   * `onError` listeners), `url` the connection URL and `cause` the thrown
   * value.
   *
   * An exception thrown inside the hook is caught and logged.
   */
  onError?: (error: EventSourceError) => void
}

/**
 * Infers the connection parameters from EventSource options.
 */
export type InferEventSourceConnectParams<Options extends DeclareEventSourceOptions> = Simplify<
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
   * Full URL the EventSource was opened with.
   */
  readonly url: string

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
