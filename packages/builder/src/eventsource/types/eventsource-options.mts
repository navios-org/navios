import type { ZodType } from 'zod/v4'

/**
 * Configuration options for eventSourceBuilder.
 */
export interface EventSourceBuilderConfig {
  /**
   * Callback for validation errors on incoming events.
   *
   * @param error - The validation error (typically ZodError)
   * @param eventName - The name of the event that failed validation
   * @param rawData - The raw payload data that failed validation
   */
  onValidationError?: (error: unknown, eventName: string, rawData: unknown) => void

  /**
   * Callback for errors occurring during event handler execution.
   *
   * @param error - The error that occurred
   */
  onError?: (error: unknown) => void
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
   * Invalid events trigger onValidationError callback and are skipped.
   */
  payloadSchema?: PayloadSchema
}
