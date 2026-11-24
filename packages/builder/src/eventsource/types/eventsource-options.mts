import type { EventSourceError } from '../../errors/eventsource-error.mjs'
import type { Schema } from '../../types/schema.mjs'

/**
 * Configuration options for eventSourceBuilder.
 */
export interface EventSourceBuilderConfig {
  /**
   * Called once for every failure, with an {@link EventSourceError}:
   *
   * - `kind: 'validation'` when `payloadSchema` rejects an incoming event.
   *   `issues` and `rawData` are set; `cause` is the schema library's own
   *   error when it has one (a `ZodError` for Zod).
   * - `kind: 'transport'` when an event handler throws. `cause` is the
   *   thrown value.
   *
   * `eventName` is always set; `url` is set when the client exposes one
   * (handles created by `declareEventSource` do).
   *
   * The hook is for telemetry. An exception thrown inside it is caught and
   * logged; it never changes how an event is handled.
   */
  onError?: (error: EventSourceError) => void
}

/**
 * Options for defineEvent.
 *
 * @template EventName - Literal string type for the event name
 * @template PayloadSchema - Schema for incoming payload validation
 */
export interface EventOptions<
  EventName extends string = string,
  PayloadSchema extends Schema | undefined = Schema | undefined,
> {
  /**
   * Event name to subscribe to.
   *
   * @example 'message', 'user.joined', 'notification'
   */
  eventName: EventName

  /**
   * Optional schema (any Standard Schema) for validating incoming payloads.
   *
   * When provided, incoming events are validated before calling handlers.
   * Invalid events trigger the `onError` hook with `kind: 'validation'`
   * and are skipped. A schema that validates asynchronously is awaited
   * before the handler runs.
   */
  payloadSchema?: PayloadSchema
}
