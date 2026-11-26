/**
 * The connection `socketBuilder` works with: a `declareWebSocket` handle, a
 * Socket.IO client, or anything else that follows this interface.
 *
 * The builder always listens to `disconnect`, after which it gives up waiting
 * for acknowledgements. What else it listens to depends on its `topics`:
 *
 * - `'envelope'` (default): `message`, which must carry every incoming message
 *   as `parseMessage` expects it, and `__navios_ack:<ackId>`, which may carry
 *   an acknowledgement.
 * - `'events'`: the event of each topic that has subscribers. It sends with
 *   `emit(topic, payload)`, and `emit(topic, payload, callback)` when it waits
 *   for an acknowledgement, as Socket.IO clients expect.
 */
export interface SocketClient {
  /**
   * Emit an event/message to the server.
   *
   * @param event - Event name or topic
   * @param args - Payload data
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
   * Optional: send a message that is already in its wire format.
   *
   * When present, `socketBuilder` calls this instead of `emit` for every
   * message it sends, with the result of `formatMessage` (by default
   * `[topic, payload]` or `[topic, payload, ackId]`). The client must
   * transmit `message` as it is, without wrapping it in an event envelope.
   * `declareWebSocket` handles implement it.
   *
   * @param topic - Topic the message belongs to, for error reporting
   * @param message - The formatted message
   */
  sendRaw?(topic: string, message: unknown): void

  /**
   * Optional: URL of the connection. When present it is copied to
   * `SocketError.url`.
   */
  readonly url?: string

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
