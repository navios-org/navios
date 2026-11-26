import { NaviosError } from '../shared/navios-error.mjs'
import { Listeners } from '../shared/realtime.mjs'

import type { ProvideClientOptions } from '../shared/realtime.mjs'

import { createSendHandler, type CreateSendContext, type PendingAck } from './create-send.mjs'
import {
  createGlobalMessageHandler,
  createSubscribeHandler,
  createTopicEventListener,
  type CreateSubscribeContext,
} from './create-subscribe.mjs'
import { SocketError } from './socket-error.mjs'

import type { SocketBuilderInstance } from './socket-builder-instance.mjs'
import type { SocketClient } from './socket-client.mjs'
import type { SendHandler, SubscribeHandler } from './socket-handlers.mjs'
import type { SendOptions, SocketBuilderConfig, SubscribeOptions } from './socket-options.mjs'

/**
 * Creates a socket builder instance for declarative WebSocket messaging.
 *
 * The builder allows you to define type-safe send and subscribe handlers
 * validated by any Standard Schema (Zod, Valibot, ArkType, ...). It sends over
 * a `declareWebSocket` handle, or any other client with the SocketClient
 * interface.
 *
 * @param config - Optional configuration for message formatting and error handling
 * @returns A SocketBuilderInstance with methods to define send/subscribe handlers
 *
 * @example
 * ```ts
 * import { declareWebSocket, socketBuilder } from '@navios/builder/socket'
 * // `z` is Zod here; any Standard Schema library works the same way
 *
 * // Create builder
 * const socket = socketBuilder({
 *   onError: (error) => {
 *     console.error(`Socket error (${error.kind}) on ${error.topic}:`, error.message)
 *   }
 * })
 *
 * // Open a connection
 * const connect = declareWebSocket({ url: 'ws://localhost:3000' })
 * socket.provideClient(connect())
 *
 * // Define typed send function
 * const sendMessage = socket.defineSend({
 *   topic: 'chat.message',
 *   payloadSchema: z.object({ text: z.string() })
 * })
 *
 * // Define typed subscribe function
 * const onMessage = socket.defineSubscribe({
 *   topic: 'chat.message',
 *   payloadSchema: z.object({ text: z.string(), from: z.string() })
 * })
 *
 * // Use handlers
 * sendMessage({ text: 'Hello!' })
 * const unsub = onMessage((msg) => console.log(`${msg.from}: ${msg.text}`))
 * ```
 */
export function socketBuilder(config: SocketBuilderConfig = {}): SocketBuilderInstance {
  // Client stored in closure (like HTTP builder pattern)
  let client: SocketClient | null = null

  // State for message handling
  const topicHandlers = new Listeners<(payload: unknown) => void>()
  const ackHandlers = new Map<string, PendingAck>()

  // What the builder listens to on the current client, once it does
  let listeners: [event: string, listener: (...args: unknown[]) => void][] | null = null

  // With `topics: 'events'`: the listener of each subscribed topic on the current client
  const perTopicEvents = config.topics === 'events'
  const topicListeners = new Map<string, (...args: unknown[]) => void>()

  /**
   * Gets the current socket client instance.
   *
   * @throws {NaviosError} If no client has been provided
   */
  function getClient(): SocketClient {
    if (!client) {
      throw new NaviosError('[Navios-Socket]: Client was not provided')
    }
    return client
  }

  const connectionUrl = () => client?.url

  /**
   * Listens to the client, when there is one. This is called lazily when the
   * first subscription is made or the first send waits for an acknowledgement,
   * and by `provideClient` for subscriptions made before.
   */
  function setupGlobalListener(): void {
    if (listeners || !client) {
      return
    }
    const active: [event: string, listener: (...args: unknown[]) => void][] = [
      ['disconnect', () => abandonAcks('The connection was closed')],
    ]
    if (!perTopicEvents) {
      // Every message arrives as one `message` event; parseMessage finds its topic
      const onMessage = createGlobalMessageHandler(
        config,
        topicHandlers,
        ackHandlers,
        connectionUrl,
      )
      active.unshift(['message', onMessage as (...args: unknown[]) => void])
    }
    listeners = active
    for (const [event, listener] of active) {
      client.on(event, listener)
    }
    for (const topic of topicHandlers.events()) {
      listenTopic(topic)
    }
  }

  /** With `topics: 'events'`, listens to the event of a topic that has subscribers. */
  function listenTopic(topic: string): void {
    if (!perTopicEvents || !client || !listeners || topicListeners.has(topic)) {
      return
    }
    const listener = createTopicEventListener(config, topic, topicHandlers, connectionUrl)
    topicListeners.set(topic, listener)
    client.on(topic, listener)
  }

  /** Stops listening to the event of a topic that has no subscribers left. */
  function unlistenTopic(topic: string): void {
    const listener = topicListeners.get(topic)
    if (!listener) {
      return
    }
    topicListeners.delete(topic)
    client?.off(topic, listener)
  }

  /**
   * Stops waiting for acknowledgements: clears the timers, removes their
   * listeners from the client and rejects the sends.
   */
  function abandonAcks(reason: string): void {
    // A copy: the onError hook may send again
    const pending = Array.from(ackHandlers.values())
    for (const { topic, release, reject } of pending) {
      release()
      reject(
        SocketError.report(config.onError, {
          kind: 'transport',
          topic,
          url: connectionUrl(),
          message: `[Navios-Socket]: ${reason} while acknowledgement pending`,
        }),
      )
    }
  }

  function provideClient(
    newClient: SocketClient,
    { closePrevious = false }: ProvideClientOptions = {},
  ): void {
    if (newClient === client) {
      return
    }

    if (client) {
      const previous = client
      for (const [event, listener] of listeners ?? []) {
        previous.off(event, listener)
      }
      for (const [topic, listener] of topicListeners) {
        previous.off(topic, listener)
      }
      topicListeners.clear()
      listeners = null
      abandonAcks('Client was replaced')
      if (closePrevious) {
        const close = previous.close ?? previous.disconnect
        close?.call(previous)
      }
    }

    client = newClient

    if (topicHandlers.size > 0) {
      setupGlobalListener()
    }
  }

  // Context for send handlers
  const sendContext: CreateSendContext = {
    getClient,
    config,
    ackHandlers,
    setupGlobalListener,
  }

  // Context for subscribe handlers
  const subscribeContext: CreateSubscribeContext = {
    connectionUrl,
    config,
    topicHandlers,
    setupGlobalListener,
    listenTopic,
    unlistenTopic,
  }

  return {
    provideClient,
    getClient,

    defineSend<const Options extends SendOptions>(options: Options): SendHandler<Options> {
      return createSendHandler(options, sendContext)
    },

    defineSubscribe<const Options extends SubscribeOptions>(
      options: Options,
    ): SubscribeHandler<Options> {
      return createSubscribeHandler(options, subscribeContext)
    },
  }
}
