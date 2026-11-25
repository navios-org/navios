import type { InferSchemaOutput, Schema } from '../shared/schema.mjs'

import type { EventOptions } from './eventsource-options.mjs'

/**
 * Unsubscribe function returned by event handlers.
 */
export type EventUnsubscribe = () => void

/**
 * Infers the handler payload type from EventOptions.
 *
 * If payloadSchema is provided, uses the schema's output type.
 * Otherwise, defaults to unknown.
 */
export type InferEventPayload<Options extends EventOptions> =
  Options['payloadSchema'] extends Schema ? InferSchemaOutput<Options['payloadSchema']> : unknown

/**
 * The handler function type returned by defineEvent.
 *
 * When called with a handler, registers it for the event and returns
 * an unsubscribe function.
 *
 * @example
 * ```ts
 * const onMessage = sse.defineEvent({
 *   eventName: 'message',
 *   payloadSchema: z.object({ text: z.string(), from: z.string() })
 * })
 *
 * const unsubscribe = onMessage((msg) => {
 *   // msg is fully typed: { text: string, from: string }
 *   console.log(`${msg.from}: ${msg.text}`)
 * })
 *
 * // Later: stop listening
 * unsubscribe()
 * ```
 */
export type EventHandler<Options extends EventOptions> = ((
  handler: (payload: InferEventPayload<Options>) => void,
) => EventUnsubscribe) & {
  config: Options
}
