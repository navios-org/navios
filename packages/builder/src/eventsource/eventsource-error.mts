import { RealtimeError } from '../shared/realtime.mjs'

import type { RealtimeErrorFields } from '../shared/realtime.mjs'

/**
 * Why handling a server-sent event failed.
 *
 * - `validation` — `payloadSchema` rejected an incoming event. `issues` and
 *   `rawData` are set.
 * - `transport` — everything else: a handler threw. `cause` holds the thrown
 *   value.
 */
export type EventSourceErrorKind = 'validation' | 'transport'

export interface EventSourceErrorInit extends RealtimeErrorFields<EventSourceErrorKind> {
  eventName: string
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
export class EventSourceError extends RealtimeError<EventSourceErrorKind, { eventName: string }> {
  /** Name of the event the failure belongs to. */
  readonly eventName: string

  constructor(init: EventSourceErrorInit) {
    super('EventSourceError', init.message ?? defaultMessage(init), init)
    this.eventName = init.eventName
  }

  protected subject(): { eventName: string } {
    return { eventName: this.eventName }
  }
}

/**
 * Type guard for {@link EventSourceError}. Use it in a `catch` block or
 * anywhere the value is `unknown`.
 */
export function isEventSourceError(error: unknown): error is EventSourceError {
  return error instanceof EventSourceError
}
