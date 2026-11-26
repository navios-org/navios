/**
 * EventSource-compatible client interface.
 *
 * This interface defines the minimal contract required for an EventSource client
 * to work with eventSourceBuilder. It's designed to be compatible with:
 * - Native EventSource wrapped with declareEventSource
 * - Any custom implementation following this interface
 */
export interface EventSourceClient {
  /**
   * Register an event listener.
   *
   * @param event - Event name to listen for
   * @param handler - Handler function called when event is received, with the
   *   decoded data. A client that decodes text also passes the text: a payload
   *   that fails its schema decoded is tried as text
   */
  on(event: string, handler: (data: unknown, text?: string) => void): void

  /**
   * Remove an event listener.
   *
   * @param event - Event name
   * @param handler - Handler function to remove (optional, removes all if not provided)
   */
  off(event: string, handler?: (data: unknown, text?: string) => void): void

  /**
   * Close the EventSource connection.
   */
  close(): void

  /**
   * Optional: URL of the connection. When present it is copied to
   * `EventSourceError.url`.
   */
  readonly url?: string
}
