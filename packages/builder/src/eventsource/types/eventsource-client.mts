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
   * @param handler - Handler function called when event is received
   */
  on(event: string, handler: (data: unknown) => void): void

  /**
   * Remove an event listener.
   *
   * @param event - Event name
   * @param handler - Handler function to remove (optional, removes all if not provided)
   */
  off(event: string, handler?: (data: unknown) => void): void

  /**
   * Close the EventSource connection.
   */
  close(): void

  /**
   * Whether the EventSource is currently connected.
   */
  readonly connected: boolean
}

/**
 * Type guard to check if an object implements EventSourceClient interface.
 */
export function isEventSourceClient(obj: unknown): obj is EventSourceClient {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'on' in obj &&
    typeof obj.on === 'function' &&
    'off' in obj &&
    typeof obj.off === 'function' &&
    'close' in obj &&
    typeof obj.close === 'function'
  )
}
