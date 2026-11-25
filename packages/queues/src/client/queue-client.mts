/**
 * Abstract interface for queue clients.
 * Implementations should provide concrete implementations for different queue systems
 * (RabbitMQ, Kafka, SQS, etc.).
 */
export interface QueueClient {
  /**
   * Publishes a message to a topic (pub/sub pattern).
   *
   * @param topic - Topic name
   * @param message - Message payload
   */
  publish(topic: string, message: unknown): Promise<void>

  /**
   * Subscribes to a topic and handles incoming messages (pub/sub pattern).
   *
   * @param topic - Topic name
   * @param handler - Message handler function
   */
  subscribe(topic: string, handler: (message: unknown) => Promise<void>): Promise<void>

  /**
   * Sends a message to a queue (point-to-point pattern).
   *
   * @param queue - Queue name
   * @param message - Message payload
   */
  send(queue: string, message: unknown): Promise<void>

  /**
   * Receives messages from a queue and handles them (point-to-point pattern).
   *
   * @param queue - Queue name
   * @param handler - Message handler function
   */
  receive(queue: string, handler: (message: unknown) => Promise<void>): Promise<void>

  /**
   * Sends a request and waits for a reply (request/reply pattern).
   *
   * @param topic - Topic name for request/reply
   * @param message - Request payload
   * @returns Response payload
   */
  request(topic: string, message: unknown): Promise<unknown>

  /**
   * Sets up a reply handler for incoming requests (request/reply pattern).
   *
   * @param topic - Topic name for request/reply
   * @param handler - Request handler function that returns a response
   */
  reply(topic: string, handler: (message: unknown) => Promise<unknown>): Promise<void>

  /**
   * Disconnects from the queue system.
   */
  disconnect(): Promise<void>
}
