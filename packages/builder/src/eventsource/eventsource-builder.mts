import { dispatch } from '../shared/dispatch.mjs'
import { NaviosError } from '../shared/navios-error.mjs'
import { isPendingOutcome, validateEager } from '../shared/validate.mjs'

import type { Schema } from '../shared/schema.mjs'
import type { ValidationOutcome } from '../shared/validate.mjs'

import { reportEventSourceError } from './report-eventsource-error.mjs'

import type {
  EventSourceBuilderInstance,
  ProvideEventSourceClientOptions,
} from './eventsource-builder-instance.mjs'
import type { EventSourceClient } from './eventsource-client.mjs'
import type { EventHandler, EventUnsubscribe } from './eventsource-handlers.mjs'
import type { EventSourceBuilderConfig, EventOptions } from './eventsource-options.mjs'

/**
 * Validates the payload of an event as it was decoded from JSON. When that fails
 * and it is a number, a boolean or `null`, it is tried as the text that arrived:
 * a server that does not encode strings sends the words `42` and `true` like any
 * other. An object that is refused must not come back as a string.
 */
function validatePayload(
  schema: Schema,
  data: unknown,
  text: string | undefined,
): ValidationOutcome | Promise<ValidationOutcome> {
  const outcome = validateEager(schema, data)
  const isWord = data === null || typeof data === 'number' || typeof data === 'boolean'
  if (text === undefined || !isWord) return outcome

  const orText = (decoded: ValidationOutcome) => {
    if (decoded.ok) return decoded
    const pick = (asText: ValidationOutcome) => (asText.ok ? asText : decoded)
    const asText = validateEager(schema, text)
    return isPendingOutcome(asText) ? asText.then(pick) : pick(asText)
  }
  return isPendingOutcome(outcome) ? outcome.then(orText) : orText(outcome)
}

/**
 * Creates an EventSource builder instance for declarative SSE event handling.
 *
 * The builder allows you to define type-safe event handlers validated by any
 * Standard Schema (Zod, Valibot, ArkType, ...). It works with any EventSource client implementing the
 * EventSourceClient interface, including the native EventSource wrapped with
 * declareEventSource.
 *
 * @param config - Optional configuration for validation error handling
 * @returns An EventSourceBuilderInstance with methods to define event handlers
 *
 * @example
 * ```ts
 * import { eventSourceBuilder, declareEventSource } from '@navios/builder/eventsource'
 * // `z` is Zod here; any Standard Schema library works the same way
 *
 * // Create builder
 * const sse = eventSourceBuilder({
 *   onError: (error) => {
 *     console.error(`SSE error (${error.kind}) on ${error.eventName}:`, error.message)
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
  type Handler = (data: unknown, text?: string) => void
  const eventHandlers = new Map<string, Set<Handler>>()

  // Track registered event listeners on the client
  const registeredListeners = new Map<string, Handler>()

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

    const listener: Handler = (data, text) => {
      // Registered handlers validate, isolate and report on their own; they never throw.
      dispatch(
        () => eventHandlers.get(eventName),
        (handler) => handler(data, text),
      )
    }

    currentClient.on(eventName, listener)
    registeredListeners.set(eventName, listener)
  }

  function provideClient(
    newClient: EventSourceClient,
    { closePrevious = false }: ProvideEventSourceClientOptions = {},
  ): void {
    if (newClient === client) {
      return
    }

    if (client) {
      for (const [eventName, listener] of registeredListeners) {
        client.off(eventName, listener)
      }
      registeredListeners.clear()
      if (closePrevious) {
        client.close()
      }
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

      let subscribed = true

      // Wrapper that validates the event and isolates handler errors. It never throws.
      const wrappedHandler: Handler = (rawData, text) => {
        const url = client?.url

        const deliver = (outcome: ValidationOutcome): void => {
          if (!outcome.ok) {
            reportEventSourceError(config.onError, {
              kind: 'validation',
              eventName,
              url,
              issues: outcome.issues,
              rawData,
              cause: outcome.cause,
            })
            return // Skip handler if validation fails
          }

          try {
            handler(outcome.value)
          } catch (cause) {
            reportEventSourceError(config.onError, { kind: 'transport', eventName, url, cause })
          }
        }

        if (!payloadSchema) {
          deliver({ ok: true, value: rawData })
          return
        }

        // A synchronous schema delivers within the same tick. An asynchronous
        // one is awaited first, unless the handler unsubscribed in the meantime.
        const outcome = validatePayload(payloadSchema, rawData, text)
        if (isPendingOutcome(outcome)) {
          void outcome.then((resolved) => {
            if (subscribed) deliver(resolved)
          })
        } else {
          deliver(outcome)
        }
      }

      handlers.add(wrappedHandler)

      // Set up listener on client if connected
      if (client) {
        setupEventListener(eventName)
      }

      // Return unsubscribe function
      return () => {
        subscribed = false
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
