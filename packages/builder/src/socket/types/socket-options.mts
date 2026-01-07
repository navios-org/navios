import type { ZodType } from 'zod/v4'

/**
 * Message formatter function type.
 *
 * Converts topic, payload, and optional ackId into wire format.
 *
 * @param topic - Topic/event name
 * @param payload - Message payload
 * @param ackId - Optional acknowledgement ID for request-response pattern
 * @returns Wire format to be sent (default: Socket.IO array format)
 *
 * @example
 * ```ts
 * // Default Socket.IO format
 * const formatMessage = (topic, payload, ackId) =>
 *   ackId ? [topic, payload, ackId] : [topic, payload]
 *
 * // Custom JSON format
 * const formatMessage = (topic, payload, ackId) => ({
 *   type: topic,
 *   data: payload,
 *   ...(ackId && { requestId: ackId })
 * })
 * ```
 */
export type MessageFormatter = (
  topic: string,
  payload: unknown,
  ackId?: string,
) => unknown

/**
 * Message parser function type.
 *
 * Extracts topic, payload, and optional ackId from wire format.
 *
 * @param data - Raw message data from wire
 * @returns Parsed message components or null if invalid format
 *
 * @example
 * ```ts
 * // Default Socket.IO format parser
 * const parseMessage = (data) => {
 *   if (Array.isArray(data) && data.length >= 2) {
 *     return { topic: data[0], payload: data[1], ackId: data[2] }
 *   }
 *   return null
 * }
 * ```
 */
export type MessageParser = (data: unknown) => {
  topic: string
  payload: unknown
  ackId?: string
} | null

/**
 * Configuration options for socketBuilder.
 */
export interface SocketBuilderConfig {
  /**
   * Custom message formatter for outgoing messages.
   *
   * Default: Socket.IO array format `[topic, payload]` or `[topic, payload, ackId]`
   */
  formatMessage?: MessageFormatter

  /**
   * Custom message parser for incoming messages.
   *
   * Default: Expects Socket.IO array format `[topic, payload, ackId?]`
   */
  parseMessage?: MessageParser

  /**
   * Callback for validation errors on incoming messages.
   *
   * @param error - The validation error (typically ZodError)
   * @param topic - The topic of the message that failed validation
   * @param rawData - The raw payload data that failed validation
   */
  onValidationError?: (error: unknown, topic: string, rawData: unknown) => void

  /**
   * Callback for acknowledgement timeouts.
   *
   * @param topic - The topic of the message that timed out
   * @param ackId - The acknowledgement ID that timed out
   */
  onAckTimeout?: (topic: string, ackId: string) => void

  /**
   * Default timeout for acknowledgements in milliseconds.
   *
   * @default 30000 (30 seconds)
   */
  ackTimeout?: number
}

/**
 * Options for defineSend.
 *
 * @template Topic - Literal string type for the topic
 * @template PayloadSchema - Zod schema for outgoing payload validation
 * @template AckSchema - Optional Zod schema for acknowledgement response
 */
export interface SendOptions<
  Topic extends string = string,
  PayloadSchema extends ZodType | undefined = ZodType | undefined,
  AckSchema extends ZodType | undefined = ZodType | undefined,
> {
  /**
   * Topic/event name for this message type.
   *
   * @example 'chat.message', 'room.create', 'user.typing'
   */
  topic: Topic

  /**
   * Optional Zod schema for validating outgoing payload.
   *
   * When provided, the payload is validated before sending.
   */
  payloadSchema?: PayloadSchema

  /**
   * Optional Zod schema for acknowledgement response.
   *
   * When provided, the send function returns a Promise that resolves
   * with the validated acknowledgement response.
   */
  ackSchema?: AckSchema

  /**
   * Optional timeout override for this specific send operation.
   *
   * Only applies when ackSchema is provided.
   */
  ackTimeout?: number
}

/**
 * Options for defineSubscribe.
 *
 * @template Topic - Literal string type for the topic
 * @template PayloadSchema - Zod schema for incoming payload validation
 */
export interface SubscribeOptions<
  Topic extends string = string,
  PayloadSchema extends ZodType | undefined = ZodType | undefined,
> {
  /**
   * Topic/event name to subscribe to.
   *
   * @example 'chat.message', 'room.update', 'user.joined'
   */
  topic: Topic

  /**
   * Optional Zod schema for validating incoming payload.
   *
   * When provided, incoming messages are validated before calling handlers.
   * Invalid messages trigger onValidationError callback and are skipped.
   */
  payloadSchema?: PayloadSchema
}
