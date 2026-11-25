import type { RequiredKeys } from '../shared/type-helpers.mjs'

import type {
  InferEventSourceConnectParams,
  DeclareEventSourceOptions,
} from './declare-eventsource-options.mjs'
import type { EventSourceClient } from './eventsource-client.mjs'

/**
 * Connection state for the EventSource handle.
 */
export type EventSourceHandleState = 'connecting' | 'open' | 'closed'

/**
 * EventSource handle that implements the EventSourceClient interface.
 *
 * This allows the handle to be used with eventSourceBuilder.provideClient().
 */
export interface EventSourceHandle extends EventSourceClient {
  /**
   * Register a listener for an event the server sends. Events without a name
   * arrive as `message`.
   *
   * The listener receives the data decoded from JSON, or the text itself when
   * it is not JSON, and the text as second argument.
   *
   * `open` and `error` are server events of that name, too. The connection
   * reports through {@link EventSourceHandle.onOpen} and
   * {@link EventSourceHandle.onError}.
   */
  on(event: string, handler: (data: unknown, text?: string) => void): void

  /**
   * Remove an event listener.
   */
  off(event: string, handler?: (data: unknown, text?: string) => void): void

  /**
   * Register a handler for a failure of the connection.
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
 * When called with connection parameters, returns an EventSourceHandle. The
 * parameters can be left out when none is required.
 */
export type EventSourceHandler<Options extends DeclareEventSourceOptions> = ((
  ...args: [RequiredKeys<InferEventSourceConnectParams<Options>>] extends [never]
    ? [params?: InferEventSourceConnectParams<Options>]
    : [params: InferEventSourceConnectParams<Options>]
) => EventSourceHandle) & {
  config: Options
}
