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
