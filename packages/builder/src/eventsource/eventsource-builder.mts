import { NaviosError } from '../shared/navios-error.mjs'
import { Listeners, subscribeValidated } from '../shared/realtime.mjs'
import { isPendingOutcome, validateEager } from '../shared/validate.mjs'

import type { ProvideClientOptions } from '../shared/realtime.mjs'
import type { Schema } from '../shared/schema.mjs'
import type { ValidationOutcome } from '../shared/validate.mjs'

import { EventSourceError } from './eventsource-error.mjs'

import type { EventSourceBuilderInstance } from './eventsource-builder-instance.mjs'
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
  const eventHandlers = new Listeners<Handler>()

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

    // Registered handlers validate, isolate and report on their own; they never throw.
    const listener: Handler = (data, text) =>
      eventHandlers.emit(eventName, (handler) => handler(data, text))

    currentClient.on(eventName, listener)
    registeredListeners.set(eventName, listener)
  }

  function provideClient(
    newClient: EventSourceClient,
    { closePrevious = false }: ProvideClientOptions = {},
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
    for (const eventName of eventHandlers.events()) {
      setupEventListener(eventName)
    }
  }

  /**
   * Creates an event handler for a specific event name.
   */
  function createEventHandler<const Options extends EventOptions>(
    options: Options,
  ): EventHandler<Options> {
    const { eventName, payloadSchema } = options

    const handlerFn = (handler: (payload: unknown) => void): EventUnsubscribe =>
      subscribeValidated(eventHandlers, eventName, handler, {
        validate: payloadSchema && ((data, text) => validatePayload(payloadSchema, data, text)),
        url: () => client?.url,
        report: (failure) => EventSourceError.report(config.onError, { ...failure, eventName }),
        listen: () => {
          if (client) setupEventListener(eventName)
        },
        // The last handler of an event takes the client's listener with it, so
        // neither this client nor the next one is listened to for nothing
        unlisten: () => {
          const listener = registeredListeners.get(eventName)
          registeredListeners.delete(eventName)
          if (listener) client?.off(eventName, listener)
        },
      })

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
