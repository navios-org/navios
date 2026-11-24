import type { SchemaIssue } from '../types/schema.mjs'

import { NaviosError } from './navios-error.mjs'

/**
 * Why a socket operation failed.
 *
 * - `validation` — a schema rejected a value: the payload passed to a send
 *   handler, an incoming message, or an acknowledgement. `issues` and
 *   `rawData` are set.
 * - `ack-timeout` — no acknowledgement arrived within `ackTimeout`.
 * - `transport` — everything else: a subscriber threw, the client was replaced
 *   while an acknowledgement was pending, or the underlying socket failed to
 *   send. `cause` holds the original value when there is one.
 */
export type SocketErrorKind = 'validation' | 'ack-timeout' | 'transport'

export interface SocketErrorInit {
  kind: SocketErrorKind
  topic: string
  message?: string
  url?: string
  issues?: readonly SchemaIssue[]
  rawData?: unknown
  cause?: unknown
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
export class SocketError extends NaviosError {
  readonly kind: SocketErrorKind
  /** Topic (event name) the failure belongs to. */
  readonly topic: string
  /** URL of the connection, when the client exposes one. */
  declare readonly url?: string
  /** Validation issues, for `validation`. */
  declare readonly issues?: readonly SchemaIssue[]
  /** The value that failed validation, exactly as it was received or passed. */
  declare readonly rawData?: unknown

  constructor(init: SocketErrorInit) {
    super(init.message ?? defaultMessage(init), { cause: init.cause })
    this.name = 'SocketError'
    this.kind = init.kind
    this.topic = init.topic
    if (init.url !== undefined) this.url = init.url
    if (init.issues !== undefined) this.issues = init.issues
    if ('rawData' in init) this.rawData = init.rawData
  }

  /**
   * Plain-object form without `cause`. Safe to hand to loggers and
   * `JSON.stringify` as long as `rawData` itself is serializable.
   */
  toJSON(): {
    name: string
    message: string
    kind: SocketErrorKind
    topic: string
    url?: string
    issues?: readonly SchemaIssue[]
    rawData?: unknown
  } {
    return {
      name: this.name,
      message: this.message,
      kind: this.kind,
      topic: this.topic,
      ...(this.url !== undefined ? { url: this.url } : {}),
      ...(this.issues !== undefined ? { issues: this.issues } : {}),
      ...('rawData' in this ? { rawData: this.rawData } : {}),
    }
  }
}

/**
 * Type guard for {@link SocketError}. Use it in a `catch` block, where the
 * caught value is `unknown`.
 */
export function isSocketError(error: unknown): error is SocketError {
  return error instanceof SocketError
}
