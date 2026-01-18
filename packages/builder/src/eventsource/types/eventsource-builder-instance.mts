import type { EventSourceClient } from './eventsource-client.mjs'
import type { EventHandler } from './eventsource-handlers.mjs'
import type { EventOptions } from './eventsource-options.mjs'

/**
 * EventSource builder instance interface.
 *
 * Provides methods for client injection and event handler definition.
 *
 * @example
 * ```ts
 * import { eventSourceBuilder, declareEventSource } from '@navios/builder/eventsource'
 * import { z } from 'zod'
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
   * Provide an EventSource client instance.
   *
   * Must be called before using any event handlers.
   * The client must implement the EventSourceClient interface.
   *
   * @param client - EventSource client (e.g., from declareEventSource())
   *
   * @example
   * ```ts
   * const handle = chatEvents({ urlParams: { roomId: '123' } })
   * sse.provideClient(handle)
   * ```
   */
  provideClient(client: EventSourceClient): void

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
