import type { Schema } from '../shared/schema.mjs'

import type { SocketError } from './socket-error.mjs'

/**
 * How topics travel over the client.
 *
 * - `'envelope'` — every message is one `message` event whose data names its
 *   topic: `[topic, payload]`, or what `formatMessage` / `parseMessage` make of
 *   it. Acknowledgements are matched by an `ackId` in the envelope. This is
 *   what `declareWebSocket` speaks.
 * - `'events'` — each topic is its own event, as Socket.IO does it:
 *   `emit(topic, payload)` and `on(topic, listener)`. An acknowledgement is
 *   the client's callback argument, `emit(topic, payload, (ack) => …)`.
 */
export type SocketTopicTransport = 'envelope' | 'events'

/**
 * Message formatter function type.
 *
 * Converts topic, payload, and optional ackId into wire format.
 *
 * With `topics: 'events'` the result is the single argument emitted with the
 * topic's event, and `ackId` is never passed: by default the payload is sent
 * as it is.
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
 * With `topics: 'events'` it receives the first argument of a topic's event
 * and the event name, and an acknowledgement too; the topic it returns is
 * where the message is delivered. By default that is
 * `{ topic: event, payload: data }`.
 *
 * @param data - Raw message data from wire
 * @param event - The client event it arrived with: `'message'` for
 *   `topics: 'envelope'`, the topic for `topics: 'events'`
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
export type MessageParser = (
  data: unknown,
  event: string,
) => {
  topic: string
  payload: unknown
  ackId?: string
} | null

/**
 * Configuration options for socketBuilder.
 */
export interface SocketBuilderConfig {
  /**
   * How topics travel over the client: in one `message` envelope
   * (`declareWebSocket`, the default) or as one event per topic (Socket.IO).
   *
   * @default 'envelope'
   *
   * @example
   * ```ts
   * import { io } from 'socket.io-client'
   *
   * const socket = socketBuilder({ topics: 'events' })
   * socket.provideClient(io('https://chat.example.com'))
   * ```
   */
  topics?: SocketTopicTransport

  /**
   * Custom message formatter for outgoing messages.
   *
   * Default: array format `[topic, payload]` or `[topic, payload, ackId]`;
   * with `topics: 'events'`, the payload as it is.
   */
  formatMessage?: MessageFormatter

  /**
   * Custom message parser for incoming messages.
   *
   * Default: Expects the array format `[topic, payload, ackId?]`; with
   * `topics: 'events'`, `{ topic: event, payload: data }`.
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
 */
export interface SendOptions {
  /**
   * Topic/event name for this message type.
   *
   * @example 'chat.message', 'room.create', 'user.typing'
   */
  topic: string

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
  payloadSchema?: Schema

  /**
   * Optional schema (any Standard Schema) for the acknowledgement response.
   *
   * When provided, the send function returns a Promise that resolves
   * with the validated acknowledgement response. Asynchronous schemas are
   * supported.
   */
  ackSchema?: Schema

  /**
   * Optional timeout override for this specific send operation.
   *
   * Only applies when ackSchema is provided.
   */
  ackTimeout?: number
}

/**
 * Options for defineSubscribe.
 */
export interface SubscribeOptions {
  /**
   * Topic/event name to subscribe to.
   *
   * @example 'chat.message', 'room.update', 'user.joined'
   */
  topic: string

  /**
   * Optional schema (any Standard Schema) for validating incoming payloads.
   *
   * When provided, incoming messages are validated before calling handlers.
   * Invalid messages trigger the `onError` hook with `kind: 'validation'`
   * and are skipped. A schema that validates asynchronously is awaited
   * before the handler runs.
   */
  payloadSchema?: Schema
}
