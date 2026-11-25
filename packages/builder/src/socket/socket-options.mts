import type { Schema } from '../shared/schema.mjs'

import type { SocketError } from './socket-error.mjs'

/**
 * Message formatter function type.
 *
 * Converts topic, payload, and optional ackId into wire format.
 *
 * @param topic - Topic/event name
 * @param payload - Message payload
 * @param ackId - Optional acknowledgement ID for request-response pattern
 * @returns Wire format to be sent (default: array format)
 *
 * @example
 * ```ts
 * // Default format
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
 * // Default format parser
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
   * Default: array format `[topic, payload]` or `[topic, payload, ackId]`
   */
  formatMessage?: MessageFormatter

  /**
   * Custom message parser for incoming messages.
   *
   * Default: Expects the array format `[topic, payload, ackId?]`
   *
   * When the returned `ackId` belongs to a send that is waiting for its
   * acknowledgement, `payload` is that acknowledgement: it settles the send
   * and is not delivered to the topic's subscribers.
   */
  parseMessage?: MessageParser

  /**
   * Called once for every failure, with a {@link SocketError}:
   *
   * - `kind: 'validation'` when a schema rejects a send payload, an incoming
   *   message or an acknowledgement. `issues` and `rawData` are set; `cause`
   *   is the schema library's own error when it has one (a `ZodError` for Zod).
   * - `kind: 'ack-timeout'` when an acknowledgement does not arrive in time.
   * - `kind: 'transport'` when a subscribe handler throws, when
   *   `formatMessage` or the client throws while sending, when `parseMessage`
   *   throws (`cause` is the thrown value), or when the client is replaced or
   *   disconnected while an acknowledgement is pending.
   *
   * `topic` is the topic the handler was defined with, and `'message'` for a
   * message that could not be parsed. Failures of a
   * send handler are also thrown or used as the rejection reason; the hook
   * receives that same instance.
   *
   * The hook is for telemetry. An exception thrown inside it is caught and
   * logged; it never changes how a message is handled.
   */
  onError?: (error: SocketError) => void

  /**
   * Default timeout for acknowledgements in milliseconds. `Infinity` waits
   * without limit.
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
   * output is what goes on the wire. With an invalid payload the call throws a
   * `SocketError` of kind `'validation'`, or rejects with it when there is an
   * `ackSchema`, and nothing is sent.
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
