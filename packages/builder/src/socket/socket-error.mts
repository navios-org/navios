import { RealtimeError } from '../shared/realtime.mjs'

import type { RealtimeErrorFields } from '../shared/realtime.mjs'

/**
 * Why a socket operation failed.
 *
 * - `validation` — a schema rejected a value: the payload passed to a send
 *   handler, an incoming message, or an acknowledgement. `issues` and
 *   `rawData` are set.
 * - `ack-timeout` — no acknowledgement arrived within `ackTimeout`.
 * - `transport` — everything else: a subscriber or `parseMessage` threw, the
 *   client was replaced or disconnected while an acknowledgement was pending,
 *   or the underlying socket could not send. `cause` holds the original value
 *   when there is one.
 */
export type SocketErrorKind = 'validation' | 'ack-timeout' | 'transport'

export interface SocketErrorInit extends RealtimeErrorFields<SocketErrorKind> {
  topic: string
}

function defaultMessage(init: SocketErrorInit): string {
  switch (init.kind) {
    case 'validation':
      return `Socket message on "${init.topic}" failed validation`
    case 'ack-timeout':
      return `Acknowledgement timeout for topic "${init.topic}"`
    default:
      return `Socket handler for "${init.topic}" failed`
  }
}

/**
 * The single error type of the socket builder.
 *
 * It is thrown or used as the rejection reason by send handlers, and passed
 * to the `onError` hook of `socketBuilder` and `createWebSocketHandler`.
 * Discriminate on `error.kind`.
 */
export class SocketError extends RealtimeError<SocketErrorKind, { topic: string }> {
  /** Topic (event name) the failure belongs to. */
  readonly topic: string

  constructor(init: SocketErrorInit) {
    super('SocketError', init.message ?? defaultMessage(init), init)
    this.topic = init.topic
  }

  protected subject(): { topic: string } {
    return { topic: this.topic }
  }
}

/**
 * Type guard for {@link SocketError}. Use it in a `catch` block, where the
 * caught value is `unknown`.
 */
export function isSocketError(error: unknown): error is SocketError {
  return error instanceof SocketError
}
