import type { ZodType } from 'zod/v4'

import type { SocketClient } from '../types/socket-client.mjs'
import type { MessageParser, SocketBuilderConfig, SubscribeOptions } from '../types/socket-options.mjs'
import type { SubscribeHandler, Unsubscribe } from '../types/socket-handlers.mjs'

/**
 * Default message parser for Socket.IO array format.
 *
 * Expected format: [topic, payload] or [topic, payload, ackId]
 */
export const defaultParseMessage: MessageParser = (data) => {
  if (Array.isArray(data) && data.length >= 2 && typeof data[0] === 'string') {
    return {
      topic: data[0],
      payload: data[1],
      ackId: typeof data[2] === 'string' ? data[2] : undefined,
    }
  }
  return null
}

export interface CreateSubscribeContext {
  getClient: () => SocketClient
  config: SocketBuilderConfig
  topicHandlers: Map<string, Set<(payload: unknown) => void>>
  globalListenerSetup: boolean
  setupGlobalListener: () => void
}

/**
 * Creates a subscribe handler for a specific topic.
 *
 * @param options - Subscribe options including topic and optional payloadSchema
 * @param context - Builder context with client getter and config
 * @returns Subscribe handler function with attached config
 */
export function createSubscribeHandler<Options extends SubscribeOptions>(
  options: Options,
  context: CreateSubscribeContext,
): SubscribeHandler<Options> {
  const { topic, payloadSchema } = options
  const { config, topicHandlers, setupGlobalListener } = context

  const handler = ((userHandler: (payload: unknown) => void): Unsubscribe => {
    // Ensure global listener is set up
    setupGlobalListener()

    // Create wrapper that validates payload
    const wrappedHandler = (payload: unknown) => {
      try {
        let validatedPayload = payload
        if (payloadSchema) {
          validatedPayload = (payloadSchema as ZodType).parse(payload)
        }
        userHandler(validatedPayload)
      } catch (error) {
        config.onValidationError?.(error, topic, payload)
      }
    }

    // Get or create handler set for this topic
    let handlers = topicHandlers.get(topic)
    if (!handlers) {
      handlers = new Set()
      topicHandlers.set(topic, handlers)
    }
    handlers.add(wrappedHandler)

    // Return unsubscribe function
    return () => {
      const currentHandlers = topicHandlers.get(topic)
      if (currentHandlers) {
        currentHandlers.delete(wrappedHandler)
        if (currentHandlers.size === 0) {
          topicHandlers.delete(topic)
        }
      }
    }
  }) as SubscribeHandler<Options>

  // Attach config to handler
  handler.config = options

  return handler
}

/**
 * Creates the global message listener that routes messages to topic handlers.
 *
 * @param client - Socket client
 * @param config - Socket builder config
 * @param topicHandlers - Map of topic to handler sets
 */
export function createGlobalMessageHandler(
  config: SocketBuilderConfig,
  topicHandlers: Map<string, Set<(payload: unknown) => void>>,
): (data: unknown) => void {
  const parseMessage = config.parseMessage ?? defaultParseMessage

  return (data: unknown) => {
    const parsed = parseMessage(data)
    if (!parsed) {
      return
    }

    const { topic, payload } = parsed
    const handlers = topicHandlers.get(topic)
    if (handlers) {
      handlers.forEach((handler) => handler(payload))
    }
  }
}
