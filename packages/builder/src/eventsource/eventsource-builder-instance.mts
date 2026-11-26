import type { ProvideClientOptions } from '../shared/realtime.mjs'

import type { EventSourceClient } from './eventsource-client.mjs'
import type { EventHandler } from './eventsource-handlers.mjs'
import type { EventOptions } from './eventsource-options.mjs'

/** Options of `provideClient`. */
export type ProvideEventSourceClientOptions = ProvideClientOptions

/**
 * EventSource builder instance interface.
 *
 * Provides methods for client injection and event handler definition.
 *
 * @example
 * ```ts
 * import { eventSourceBuilder, declareEventSource } from '@navios/builder/eventsource'
 * // `z` is Zod here; any Standard Schema library works the same way
 *
 * const sse = eventSourceBuilder()
 *
 * // Define typed event handlers
 * const onMessage = sse.defineEvent({
 *   eventName: 'message',
 *   payloadSchema: z.object({ text: z.string(), from: z.string() })
 * })
 *
 * // Create connection declaration
 * const chatEvents = declareEventSource({
 *   url: '/events/$roomId',
 *   urlParamsSchema: z.object({ roomId: z.string() }),
 * })
 *
 * // Connect and provide client
 * const handle = chatEvents({ urlParams: { roomId: '123' } })
 * sse.provideClient(handle)
 *
 * // Use handlers
 * const unsub = onMessage((msg) => console.log(msg))
 * ```
 */
export interface EventSourceBuilderInstance {
  /**
   * Sets the client events are received from.
   *
   * Handlers registered before are attached when it arrives. Another client
   * takes over the handlers. Providing the client it already has does nothing.
   *
   * @param client - A `declareEventSource` handle, or anything with the
   *   `EventSourceClient` interface
   *
   * @example
   * ```ts
   * sse.provideClient(chatEvents({ urlParams: { roomId: '123' } }))
   *
   * // Move on to another room
   * sse.provideClient(chatEvents({ urlParams: { roomId: '456' } }), { closePrevious: true })
   * ```
   */
  provideClient(client: EventSourceClient, options?: ProvideEventSourceClientOptions): void

  /**
   * Get the current EventSource client.
   *
   * @throws {NaviosError} If no client has been provided via provideClient
   *
   * @example
   * ```ts
   * const client = sse.getClient()
   * client.close()
   * ```
   */
  getClient(): EventSourceClient

  /**
   * Define a typed event handler for a specific event name.
   *
   * Creates a function that registers handlers for incoming events.
   * When called with a handler, returns an unsubscribe function.
   *
   * Uses TypeScript's const generic inference for full type safety.
   *
   * @param options - Configuration for the event handler
   * @returns Event handler function with attached config
   *
   * @example
   * ```ts
   * const onMessage = sse.defineEvent({
   *   eventName: 'message',
   *   payloadSchema: z.object({
   *     text: z.string(),
   *     from: z.string(),
   *     timestamp: z.number()
   *   })
   * })
   *
   * const unsubscribe = onMessage((msg) => {
   *   // msg is fully typed: { text: string, from: string, timestamp: number }
   *   console.log(`${msg.from}: ${msg.text}`)
   * })
   *
   * // Later: stop listening
   * unsubscribe()
   * ```
   */
  defineEvent<const Options extends EventOptions>(options: Options): EventHandler<Options>
}
