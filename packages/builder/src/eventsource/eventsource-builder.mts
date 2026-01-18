import type { ZodType } from 'zod/v4'

import { NaviosError } from '../errors/index.mjs'

import type { EventSourceBuilderInstance } from './types/eventsource-builder-instance.mjs'
import type { EventSourceClient } from './types/eventsource-client.mjs'
import type { EventHandler, EventUnsubscribe } from './types/eventsource-handlers.mjs'
import type { EventSourceBuilderConfig, EventOptions } from './types/eventsource-options.mjs'

/**
 * Creates an EventSource builder instance for declarative SSE event handling.
 *
 * The builder allows you to define type-safe event handlers with Zod schema
 * validation. It works with any EventSource client implementing the
 * EventSourceClient interface, including the native EventSource wrapped with
 * declareEventSource.
 *
 * @param config - Optional configuration for validation error handling
 * @returns An EventSourceBuilderInstance with methods to define event handlers
 *
 * @example
 * ```ts
 * import { eventSourceBuilder, declareEventSource } from '@navios/builder/eventsource'
 * import { z } from 'zod'
 *
 * // Create builder
 * const sse = eventSourceBuilder({
 *   onValidationError: (error, eventName, data) => {
 *     console.error(`Validation failed for ${eventName}:`, error)
 *   }
 * })
 *
 * // Define typed event handlers
 * const onMessage = sse.defineEvent({
 *   eventName: 'message',
 *   payloadSchema: z.object({ text: z.string(), from: z.string() })
 * })
 *
 * const onTyping = sse.defineEvent({
 *   eventName: 'typing',
 *   payloadSchema: z.object({ userId: z.string() })
 * })
 *
 * // Create connection
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
 * const unsubMessage = onMessage((msg) => console.log(`${msg.from}: ${msg.text}`))
 * const unsubTyping = onTyping((data) => console.log(`${data.userId} is typing...`))
 *
 * // Cleanup
 * unsubMessage()
 * unsubTyping()
 * sse.getClient().close()
 * ```
 */
export function eventSourceBuilder(
  config: EventSourceBuilderConfig = {},
): EventSourceBuilderInstance {
  // Client stored in closure (like HTTP builder pattern)
  let client: EventSourceClient | null = null

  // State for event handling
  const eventHandlers = new Map<string, Set<(payload: unknown) => void>>()

  // Track registered event listeners on the client
  const registeredListeners = new Map<string, (data: unknown) => void>()

  /**
   * Gets the current EventSource client instance.
   *
   * @throws {NaviosError} If no client has been provided
   */
  function getClient(): EventSourceClient {
    if (!client) {
      throw new NaviosError('[Navios-EventSource]: Client was not provided')
    }
    return client
  }

  /**
   * Sets up an event listener on the client for a specific event name.
   * This is called lazily when the first handler is registered for an event.
   */
  function setupEventListener(eventName: string): void {
    if (registeredListeners.has(eventName)) {
      return
    }

    const currentClient = getClient()

    const listener = (data: unknown): void => {
      const handlers = eventHandlers.get(eventName)
      if (handlers) {
        handlers.forEach((handler) => {
          try {
            handler(data)
          } catch (error) {
            config.onError?.(error)
          }
        })
      }
    }

    currentClient.on(eventName, listener)
    registeredListeners.set(eventName, listener)
  }

  /**
   * Sets the EventSource client instance.
   *
   * @param newClient - EventSource client (from declareEventSource or compatible)
   */
  function provideClient(newClient: EventSourceClient): void {
    // If switching clients, clean up old listeners and close old client
    if (client) {
      registeredListeners.forEach((listener, eventName) => {
        client!.off(eventName, listener)
      })
      registeredListeners.clear()
      // Close old connection to prevent resource leaks
      client.close()
    }

    client = newClient

    // Re-setup listeners for existing event handlers
    eventHandlers.forEach((_, eventName) => {
      setupEventListener(eventName)
    })
  }

  /**
   * Creates an event handler for a specific event name.
   */
  function createEventHandler<const Options extends EventOptions>(
    options: Options,
  ): EventHandler<Options> {
    const { eventName, payloadSchema } = options

    const handlerFn = (handler: (payload: unknown) => void): EventUnsubscribe => {
      // Get or create handler set for this event
      let handlers = eventHandlers.get(eventName)
      if (!handlers) {
        handlers = new Set()
        eventHandlers.set(eventName, handlers)
      }

      // Create a wrapper that validates and calls the original handler
      const wrappedHandler = (rawData: unknown): void => {
        let data = rawData

        // Validate if schema is provided
        if (payloadSchema) {
          try {
            data = (payloadSchema as ZodType).parse(rawData)
          } catch (error) {
            config.onValidationError?.(error, eventName, rawData)
            return // Skip handler if validation fails
          }
        }

        handler(data)
      }

      handlers.add(wrappedHandler)

      // Set up listener on client if connected
      if (client) {
        setupEventListener(eventName)
      }

      // Return unsubscribe function
      return () => {
        handlers?.delete(wrappedHandler)
      }
    }

    // Attach config to the handler function
    const handler = handlerFn as unknown as EventHandler<Options>
    handler.config = options

    return handler
  }

  return {
    provideClient,
    getClient,
    defineEvent: createEventHandler,
  }
}
