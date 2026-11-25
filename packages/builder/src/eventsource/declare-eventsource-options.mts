import type { InferSchemaInput, Schema } from '../shared/schema.mjs'
import type { HasProperty, SafeGet, Simplify } from '../shared/type-helpers.mjs'
import type { UrlHasParams, UrlParams } from '../shared/url-params.mjs'

import type { EventSourceError } from './eventsource-error.mjs'

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
