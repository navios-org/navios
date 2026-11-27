import type { ConnectArgs } from '../shared/connect-args.mjs'
import type { Schema } from '../shared/schema.mjs'
import type { Simplify } from '../shared/type-helpers.mjs'

import type { EventSourceError } from './eventsource-error.mjs'

/**
 * Options for declareEventSource.
 */
export interface DeclareEventSourceOptions {
  /**
   * EventSource URL (can include $param placeholders).
   *
   * @example '/events/$roomId'
   */
  url: string

  /**
   * Optional schema (any Standard Schema) for query parameters. Its output
   * must be a plain object; each entry becomes one query parameter. Omitted
   * `params` are validated as an empty object.
   *
   * The connection is opened synchronously, so the schema must validate
   * synchronously.
   */
  querySchema?: Schema

  /**
   * Optional schema (any Standard Schema) for URL parameter validation.
   * Must validate synchronously, like `querySchema`.
   */
  urlParamsSchema?: Schema

  /**
   * Whether to include credentials (cookies) in the request.
   */
  withCredentials?: boolean
}

/** What `declareEventSource` uses of an `EventSource`. */
export interface EventSourceLike {
  readonly readyState: number
  onopen: ((event: never) => unknown) | null
  onerror: ((event: never) => unknown) | null
  onmessage: ((event: never) => unknown) | null
  addEventListener(type: string, listener: (event: Event) => void): void
  removeEventListener(type: string, listener: (event: Event) => void): void
  close(): void
}

/** An `EventSource` class: the global one, or one of a library such as `eventsource`. */
export type EventSourceConstructor = new (
  url: string,
  init?: { withCredentials?: boolean },
) => EventSourceLike

/**
 * Configuration for the EventSource handler factory.
 */
export interface CreateEventSourceHandlerConfig {
  /**
   * Base URL for EventSource connections (e.g., 'https://api.example.com').
   */
  baseURL?: string

  /**
   * The class connections are opened with, for runtimes without a global
   * `EventSource` (Node.js, React Native) or to pass headers the standard one
   * cannot send.
   *
   * @default the global `EventSource`, looked up for every connection
   */
  EventSource?: EventSourceConstructor

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
 * The parameters a connection is opened with: `urlParams` when the URL has
 * parameters, `params` when there is a `querySchema`, typed as for an HTTP
 * endpoint.
 */
export type InferEventSourceConnectParams<Options extends DeclareEventSourceOptions> = Simplify<
  ConnectArgs<Options>
>
