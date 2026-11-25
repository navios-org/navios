import { isPendingOutcome, validateEager } from '../shared/validate.mjs'

import type { ValidationOutcome } from '../shared/validate.mjs'

import { reportSocketError } from './report-socket-error.mjs'

import type { PendingAck } from './create-send.mjs'
import type { SocketClient } from './socket-client.mjs'
import type { SubscribeHandler, Unsubscribe } from './socket-handlers.mjs'
import type { MessageParser, SocketBuilderConfig, SubscribeOptions } from './socket-options.mjs'

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
  const { getClient, config, topicHandlers, setupGlobalListener } = context

  const connectionUrl = (): string | undefined => {
    try {
      return getClient().url
    } catch {
      return undefined
    }
  }

  const handler = ((userHandler: (payload: unknown) => void): Unsubscribe => {
    // Ensure global listener is set up
    setupGlobalListener()

    let subscribed = true

    // Wrapper that validates the payload and isolates handler errors. It never throws.
    const wrappedHandler = (payload: unknown) => {
      const url = connectionUrl()

      const deliver = (outcome: ValidationOutcome) => {
        if (!outcome.ok) {
          reportSocketError(config.onError, {
            kind: 'validation',
            topic,
            url,
            issues: outcome.issues,
            rawData: payload,
            cause: outcome.cause,
          })
          return
        }

        try {
          userHandler(outcome.value)
        } catch (cause) {
          reportSocketError(config.onError, { kind: 'transport', topic, url, cause })
        }
      }

      if (!payloadSchema) {
        deliver({ ok: true, value: payload })
        return
      }

      // A synchronous schema delivers within the same tick. An asynchronous
      // one is awaited first, unless the handler unsubscribed in the meantime.
      const outcome = validateEager(payloadSchema, payload)
      if (isPendingOutcome(outcome)) {
        void outcome.then((resolved) => {
          if (subscribed) deliver(resolved)
        })
      } else {
        deliver(outcome)
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
      subscribed = false
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
 * A parsed message whose `ackId` belongs to a pending acknowledgement is that
 * acknowledgement: it settles the waiting send and is not passed on to the
 * topic's subscribers. This is how acknowledgements arrive in a custom wire
 * format.
 *
 * @param config - Socket builder config
 * @param topicHandlers - Map of topic to handler sets
 * @param ackHandlers - Pending acknowledgements by ackId
 */
export function createGlobalMessageHandler(
  config: SocketBuilderConfig,
  topicHandlers: Map<string, Set<(payload: unknown) => void>>,
  ackHandlers?: Map<string, Pick<PendingAck, 'settle'>>,
): (data: unknown) => void {
  const parseMessage = config.parseMessage ?? defaultParseMessage

  return (data: unknown) => {
    const parsed = parseMessage(data)
    if (!parsed) {
      return
    }

    const { topic, payload, ackId } = parsed

    const pendingAck = typeof ackId === 'string' ? ackHandlers?.get(ackId) : undefined
    if (pendingAck) {
      pendingAck.settle(payload)
      return
    }

    const handlers = topicHandlers.get(topic)
    if (handlers) {
      handlers.forEach((handler) => handler(payload))
    }
  }
}
