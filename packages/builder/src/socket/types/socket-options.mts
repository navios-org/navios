import type { SocketError } from '../../errors/socket-error.mjs'
import type { Schema } from '../../types/schema.mjs'

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
export type MessageFormatter = (topic: string, payload: unknown, ackId?: string) => unknown

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
   * Called once for every failure, with a {@link SocketError}:
   *
   * - `kind: 'validation'` when a schema rejects a send payload, an incoming
   *   message or an acknowledgement. `issues` and `rawData` are set; `cause`
   *   is the schema library's own error when it has one (a `ZodError` for Zod).
   * - `kind: 'ack-timeout'` when an acknowledgement does not arrive in time.
   * - `kind: 'transport'` when a subscribe handler throws (`cause` is the
   *   thrown value) or the client is replaced while an acknowledgement is
   *   pending.
   *
   * `topic` is always the topic the handler was defined with. Failures of a
   * send handler are also thrown or used as the rejection reason; the hook
   * receives that same instance.
   *
   * The hook is for telemetry. An exception thrown inside it is caught and
   * logged; it never changes how a message is handled.
   */
  onError?: (error: SocketError) => void

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
 * @template PayloadSchema - Schema for outgoing payload validation
 * @template AckSchema - Optional schema for the acknowledgement response
 */
export interface SendOptions<
  Topic extends string = string,
  PayloadSchema extends Schema | undefined = Schema | undefined,
  AckSchema extends Schema | undefined = Schema | undefined,
> {
  /**
   * Topic/event name for this message type.
   *
   * @example 'chat.message', 'room.create', 'user.typing'
   */
  topic: Topic

  /**
   * Optional schema (any Standard Schema) for validating the outgoing payload.
   *
   * When provided, the payload is validated before sending and the schema's
   * output is what goes on the wire. An invalid payload throws a
   * `SocketError` of kind `'validation'` and nothing is sent.
   *
   * A schema that validates asynchronously is awaited when `ackSchema` is
   * set (the call returns a promise anyway). Without `ackSchema` the call
   * is synchronous, so an asynchronous schema is rejected with a
   * `SocketError`.
   */
  payloadSchema?: PayloadSchema

  /**
   * Optional schema (any Standard Schema) for the acknowledgement response.
   *
   * When provided, the send function returns a Promise that resolves
   * with the validated acknowledgement response. Asynchronous schemas are
   * supported.
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
 * @template PayloadSchema - Schema for incoming payload validation
 */
export interface SubscribeOptions<
  Topic extends string = string,
  PayloadSchema extends Schema | undefined = Schema | undefined,
> {
  /**
   * Topic/event name to subscribe to.
   *
   * @example 'chat.message', 'room.update', 'user.joined'
   */
  topic: Topic

  /**
   * Optional schema (any Standard Schema) for validating incoming payloads.
   *
   * When provided, incoming messages are validated before calling handlers.
   * Invalid messages trigger the `onError` hook with `kind: 'validation'`
   * and are skipped. A schema that validates asynchronously is awaited
   * before the handler runs.
   */
  payloadSchema?: PayloadSchema
}
