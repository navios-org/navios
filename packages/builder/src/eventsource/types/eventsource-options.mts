import type { ZodType } from 'zod/v4'

import type { BuilderErrorEvent } from '../../types/config.mjs'

/**
 * Configuration options for eventSourceBuilder.
 */
export interface EventSourceBuilderConfig {
  /**
   * Unified structured-error hook. Fires on every error path:
   *
   * - `kind: 'validation'` when an incoming event payload fails Zod
   *   validation. `eventName` and `rawData` are populated; `cause` is the
   *   raw error (usually a `ZodError`).
   * - `kind: 'event-source-transport'` when a user-supplied event handler
   *   throws synchronously. `eventName` is the subscription event name;
   *   `cause` is the thrown value.
   *
   * The shared {@link BuilderErrorEvent} shape lets consumers route SSE,
   * socket, and HTTP errors through a single telemetry pipeline.
   */
  onError?: (event: BuilderErrorEvent) => void
}

/**
 * Options for defineEvent.
 *
 * @template EventName - Literal string type for the event name
 * @template PayloadSchema - Zod schema for incoming payload validation
 */
export interface EventOptions<
  EventName extends string = string,
  PayloadSchema extends ZodType | undefined = ZodType | undefined,
> {
  /**
   * Event name to subscribe to.
   *
   * @example 'message', 'user.joined', 'notification'
   */
  eventName: EventName

  /**
   * Optional Zod schema for validating incoming payload.
   *
   * When provided, incoming events are validated before calling handlers.
   * Invalid events trigger the `onError` hook with `kind: 'validation'`
   * and are skipped.
   */
  payloadSchema?: PayloadSchema
}
