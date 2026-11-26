import { subscribeValidated } from '../shared/realtime.mjs'
import { validateEager } from '../shared/validate.mjs'

import type { Listeners } from '../shared/realtime.mjs'

import { SocketError } from './socket-error.mjs'

import type { PendingAck } from './create-send.mjs'
import type { SubscribeHandler, Unsubscribe } from './socket-handlers.mjs'
import type { MessageParser, SocketBuilderConfig, SubscribeOptions } from './socket-options.mjs'

export interface CreateSubscribeContext {
  /** The URL of the current connection, if there is one and it has a URL. */
  connectionUrl: () => string | undefined
  config: SocketBuilderConfig
  topicHandlers: Listeners<(payload: unknown) => void>
  /** Listens to the client, once there is one. */
  setupGlobalListener: () => void
  /** Called when a topic gets a subscriber (`topics: 'events'` listens per topic). */
  listenTopic: (topic: string) => void
  /** Called when a topic loses its last subscriber. */
  unlistenTopic: (topic: string) => void
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
        listenTopic(topic)
      },
      unlisten: () => unlistenTopic(topic),
    })) as SubscribeHandler<Options>

  // Attach config to handler
  handler.config = options

  return handler
}

export interface MessageListenerContext {
  config: SocketBuilderConfig
  parse: MessageParser
  topicHandlers: Listeners<(payload: unknown) => void>
  ackHandlers: Map<string, Pick<PendingAck, 'settle'>>
  connectionUrl: () => string | undefined
}

/**
 * Creates the listener of one client event: `message` for the envelope, a
 * topic for `topics: 'events'`. It parses the event's first argument and
 * delivers the payload to the subscribers of the topic `parse` returns.
 *
 * A parsed message whose `ackId` belongs to a pending acknowledgement is that
 * acknowledgement: it settles the waiting send and is not passed on to the
 * topic's subscribers. This is how acknowledgements arrive in a custom wire
 * format.
 */
export function createMessageListener(
  event: string,
  { config, parse, topicHandlers, ackHandlers, connectionUrl }: MessageListenerContext,
): (data: unknown) => void {
  return (data: unknown) => {
    let parsed: ReturnType<MessageParser>
    try {
      parsed = parse(data, event)
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
