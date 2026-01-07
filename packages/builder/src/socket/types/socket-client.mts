/**
 * Socket.IO-compatible client interface.
 *
 * This interface defines the minimal contract required for a socket client
 * to work with socketBuilder. It's designed to be compatible with:
 * - socket.io-client (io())
 * - Native WebSocket wrapped with declareWebSocket
 * - Any custom implementation following this interface
 */
export interface SocketClient {
  /**
   * Emit an event/message to the server.
   *
   * @param event - Event name or topic
   * @param args - Payload data and optional callback for acknowledgement
   *
   * Socket.IO compatible signature:
   * - emit(event, data)
   * - emit(event, data, callback)
   */
  emit(event: string, ...args: unknown[]): void

  /**
   * Register an event listener.
   *
   * @param event - Event name or topic to listen for
   * @param handler - Handler function called when event is received
   */
  on(event: string, handler: (...args: unknown[]) => void): void

  /**
   * Remove an event listener.
   *
   * @param event - Event name or topic
   * @param handler - Handler function to remove (optional, removes all if not provided)
   */
  off(event: string, handler?: (...args: unknown[]) => void): void

  /**
   * Optional: Check if the socket is connected.
   */
  connected?: boolean

  /**
   * Optional: Disconnect the socket.
   */
  disconnect?(): void

  /**
   * Optional: Close the socket (alias for disconnect).
   */
  close?(): void
}

/**
 * Type guard to check if an object implements SocketClient interface.
 */
export function isSocketClient(obj: unknown): obj is SocketClient {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'emit' in obj &&
    typeof obj.emit === 'function' &&
    'on' in obj &&
    typeof obj.on === 'function' &&
    'off' in obj &&
    typeof obj.off === 'function'
  )
}
