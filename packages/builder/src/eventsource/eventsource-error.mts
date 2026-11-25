import { NaviosError } from '../shared/navios-error.mjs'
import { toSchemaIssue } from '../shared/schema.mjs'

import type { SchemaIssue, StandardIssue } from '../shared/schema.mjs'

/**
 * Why handling a server-sent event failed.
 *
 * - `validation` — `payloadSchema` rejected an incoming event. `issues` and
 *   `rawData` are set.
 * - `transport` — everything else: a handler threw. `cause` holds the thrown
 *   value.
 */
export type EventSourceErrorKind = 'validation' | 'transport'

export interface EventSourceErrorInit {
  kind: EventSourceErrorKind
  eventName: string
  message?: string
  url?: string
  issues?: readonly StandardIssue[]
  rawData?: unknown
  cause?: unknown
}

function defaultMessage(init: EventSourceErrorInit): string {
  return init.kind === 'validation'
    ? `Event "${init.eventName}" failed validation`
    : `EventSource handler for "${init.eventName}" failed`
}

/**
 * The single error type of the EventSource builder, passed to the `onError`
 * hook of `eventSourceBuilder` and `createEventSourceHandler`.
 * Discriminate on `error.kind`.
 */
export class EventSourceError extends NaviosError {
  readonly kind: EventSourceErrorKind
  /** Name of the event the failure belongs to. */
  readonly eventName: string
  /** URL of the connection, when the client exposes one. */
  declare readonly url?: string
  /** Validation issues, for `validation`. */
  declare readonly issues?: readonly SchemaIssue[]
  /** The event data that failed validation, exactly as it was received. */
  declare readonly rawData?: unknown

  constructor(init: EventSourceErrorInit) {
    super(init.message ?? defaultMessage(init), { cause: init.cause })
    this.name = 'EventSourceError'
    this.kind = init.kind
    this.eventName = init.eventName
    if (init.url !== undefined) this.url = init.url
    if (init.issues !== undefined) this.issues = init.issues.map(toSchemaIssue)
    if ('rawData' in init) this.rawData = init.rawData
  }

  /**
   * Plain-object form without `cause`. Safe to hand to loggers and
   * `JSON.stringify` as long as `rawData` itself is serializable.
   */
  toJSON(): {
    name: string
    message: string
    kind: EventSourceErrorKind
    eventName: string
    url?: string
    issues?: readonly SchemaIssue[]
    rawData?: unknown
  } {
    return {
      name: this.name,
      message: this.message,
      kind: this.kind,
      eventName: this.eventName,
      ...(this.url !== undefined ? { url: this.url } : {}),
      ...(this.issues !== undefined ? { issues: this.issues } : {}),
      ...('rawData' in this ? { rawData: this.rawData } : {}),
    }
  }
}

/**
 * Type guard for {@link EventSourceError}. Use it in a `catch` block or
 * anywhere the value is `unknown`.
 */
export function isEventSourceError(error: unknown): error is EventSourceError {
  return error instanceof EventSourceError
}
