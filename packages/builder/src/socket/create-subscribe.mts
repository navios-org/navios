import { subscribeValidated } from '../shared/realtime.mjs'
import { validateEager } from '../shared/validate.mjs'

import type { Listeners } from '../shared/realtime.mjs'

import { SocketError } from './socket-error.mjs'

import type { PendingAck } from './create-send.mjs'
import type { SubscribeHandler, Unsubscribe } from './socket-handlers.mjs'
import type { MessageParser, SocketBuilderConfig, SubscribeOptions } from './socket-options.mjs'

/**
 * Default message parser for the array format.
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
  /** The URL of the current connection, if there is one and it has a URL. */
  connectionUrl: () => string | undefined
  config: SocketBuilderConfig
  topicHandlers: Listeners<(payload: unknown) => void>
  /** Listens to the client, once there is one. */
  setupGlobalListener: () => void
  /** Called when a topic gets its first subscriber (`topics: 'events'` listens per topic). */
  listenTopic?: (topic: string) => void
  /** Called when a topic loses its last subscriber. */
  unlistenTopic?: (topic: string) => void
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
  const { connectionUrl, config, topicHandlers, setupGlobalListener, listenTopic, unlistenTopic } =
    context

  const handler = ((userHandler: (payload: unknown) => void): Unsubscribe =>
    subscribeValidated(topicHandlers, topic, userHandler, {
      validate: payloadSchema && ((payload) => validateEager(payloadSchema, payload)),
      url: connectionUrl,
      report: (failure) => SocketError.report(config.onError, { ...failure, topic }),
      listen: () => {
        setupGlobalListener()
        listenTopic?.(topic)
      },
      unlisten: () => unlistenTopic?.(topic),
    })) as SubscribeHandler<Options>

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
 * @param connectionUrl - The URL of the current connection
 */
export function createGlobalMessageHandler(
  config: SocketBuilderConfig,
  topicHandlers: Listeners<(payload: unknown) => void>,
  ackHandlers: Map<string, Pick<PendingAck, 'settle'>>,
  connectionUrl: () => string | undefined,
): (data: unknown) => void {
  const parseMessage = config.parseMessage ?? defaultParseMessage

  return (data: unknown) => {
    let parsed: ReturnType<MessageParser>
    try {
      parsed = parseMessage(data, 'message')
    } catch (cause) {
      // It must not reach the client, whose emitter would pass it on as uncaught
      SocketError.report(config.onError, {
        kind: 'transport',
        topic: 'message',
        url: connectionUrl(),
        message: 'parseMessage threw; the message was skipped',
        rawData: data,
        cause,
      })
      return
    }
    if (!parsed) {
      return
    }

    const { topic, payload, ackId } = parsed

    const pendingAck = typeof ackId === 'string' ? ackHandlers.get(ackId) : undefined
    if (pendingAck) {
      pendingAck.settle(payload)
      return
    }

    // Registered handlers validate, isolate and report on their own; they never throw.
    topicHandlers.emit(topic, (handler) => handler(payload))
  }
}

/** The parser of `topics: 'events'`: the event is the topic, its argument the payload. */
const parseEvent: MessageParser = (data, event) => ({ topic: event, payload: data })

/**
 * Creates the listener of one topic's event for `topics: 'events'`. It reads
 * the event's first argument, runs `parseMessage` on it and delivers the
 * payload to the subscribers of the topic it returns.
 *
 * @internal
 */
export function createTopicEventListener(
  config: SocketBuilderConfig,
  event: string,
  topicHandlers: Listeners<(payload: unknown) => void>,
  connectionUrl: () => string | undefined,
): (...args: unknown[]) => void {
  const parseMessage = config.parseMessage ?? parseEvent

  return (...args: unknown[]) => {
    const data = args[0]
    let parsed: ReturnType<MessageParser>
    try {
      parsed = parseMessage(data, event)
    } catch (cause) {
      // It must not reach the client, whose emitter would pass it on as uncaught
      SocketError.report(config.onError, {
        kind: 'transport',
        topic: event,
        url: connectionUrl(),
        message: 'parseMessage threw; the message was skipped',
        rawData: data,
        cause,
      })
      return
    }
    if (!parsed) {
      return
    }
    const { topic, payload } = parsed
    topicHandlers.emit(topic, (handler) => handler(payload))
  }
}
