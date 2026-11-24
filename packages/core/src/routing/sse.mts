import type { InferInput, StandardSchemaV1 } from '@navios/di'

import { ValidationError } from './validation.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * One server-sent event.
 */
export interface SseMessage {
  /** Event name. Omitted for the default `message` event. */
  event?: string
  /** Sent as JSON unless it is a string. */
  data: unknown
  id?: string
  /** Reconnection delay in milliseconds. */
  retry?: number
}

/**
 * An event declared with the builder's `defineEvent`, or anything with the
 * same `config`.
 */
export interface EventDeclaration<
  Name extends string = string,
  Schema extends StandardSchemaV1 | undefined = StandardSchemaV1 | undefined,
> {
  config: { eventName: Name; payloadSchema?: Schema }
}

type PayloadOf<Event extends EventDeclaration> = Event['config']['payloadSchema'] extends StandardSchemaV1
  ? InferInput<Event['config']['payloadSchema']>
  : unknown

/**
 * Creates an event for a declared event type. The payload is typed from the
 * declaration's `payloadSchema` and validated against it.
 *
 * ```ts
 * yield sse(userJoined, { userId: '1' })
 * ```
 */
export function sse<Event extends EventDeclaration>(
  event: Event,
  payload: PayloadOf<Event>,
  options: { id?: string; retry?: number } = {},
): SseMessage {
  const { eventName, payloadSchema } = event.config
  let data: unknown = payload
  if (payloadSchema) {
    const result = payloadSchema['~standard'].validate(payload)
    if (result instanceof Promise) {
      result.catch(() => {})
      throw new Error(
        `[Navios] The payload schema of event "${eventName}" must validate synchronously`,
      )
    }
    if (result.issues) {
      throw new ValidationError('response', result.issues)
    }
    data = result.value
  }
  return { event: eventName, data, ...options }
}

const sseBrand: unique symbol = Symbol.for('navios.core.SseStream')

/**
 * A stream of server-sent events, created with `sseStream()`.
 */
export interface SseStream {
  readonly [sseBrand]: true
  readonly source: AsyncIterable<SseMessage>
}

/**
 * Answers a `response: 'stream'` endpoint with server-sent events. Iteration
 * stops when the client disconnects.
 *
 * ```ts
 * feed = handler(feedEndpoint, (_params, ctx) =>
 *   sseStream(async function* () {
 *     for await (const user of joins(ctx.signal)) {
 *       yield sse(userJoined, { userId: user.id })
 *     }
 *   }()),
 * )
 * ```
 */
export function sseStream(source: AsyncIterable<SseMessage>): SseStream {
  return { [sseBrand]: true, source }
}

export function isSseStream(value: unknown): value is SseStream {
  return typeof value === 'object' && value !== null && sseBrand in value
}

/**
 * Serialises one event in the `text/event-stream` format.
 */
export function encodeSse(message: SseMessage): string {
  let out = ''
  if (message.id !== undefined) {
    out += `id: ${message.id}\n`
  }
  if (message.event !== undefined) {
    out += `event: ${message.event}\n`
  }
  if (message.retry !== undefined) {
    out += `retry: ${message.retry}\n`
  }
  const data = typeof message.data === 'string' ? message.data : JSON.stringify(message.data)
  for (const line of String(data).split('\n')) {
    out += `data: ${line}\n`
  }
  return `${out}\n`
}

/** @internal */
export async function* encodeSseStream(stream: SseStream): AsyncGenerator<string> {
  for await (const message of stream.source) {
    yield encodeSse(message)
  }
}
