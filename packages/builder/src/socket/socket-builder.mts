import { NaviosError } from '../errors/index.mjs'

import {
  createSendHandler,
  type CreateSendContext,
  type PendingAck,
} from './handlers/create-send.mjs'
import {
  createGlobalMessageHandler,
  createSubscribeHandler,
  type CreateSubscribeContext,
} from './handlers/create-subscribe.mjs'
import { reportSocketError } from './report-error.mjs'

import type { SocketBuilderInstance } from './types/socket-builder-instance.mjs'
import type { SocketClient } from './types/socket-client.mjs'
import type { SendHandler, SubscribeHandler } from './types/socket-handlers.mjs'
import type { SendOptions, SocketBuilderConfig, SubscribeOptions } from './types/socket-options.mjs'

/**
 * Creates a socket builder instance for declarative WebSocket/Socket.IO messaging.
 *
 * The builder allows you to define type-safe send and subscribe handlers
 * validated by any Standard Schema (Zod, Valibot, ArkType, ...). It uses a
 * Socket.IO-compatible interface, so it works with socket.io-client or any WebSocket wrapper implementing the SocketClient interface.
 *
 * @param config - Optional configuration for message formatting and error handling
 * @returns A SocketBuilderInstance with methods to define send/subscribe handlers
 *
 * @example
 * ```ts
 * import { socketBuilder } from '@navios/builder/socket'
 * import { io } from 'socket.io-client'
 * // `z` is Zod here; any Standard Schema library works the same way
 *
 * // Create builder
 * const socket = socketBuilder({
 *   onError: (error) => {
 *     console.error(`Socket error (${error.kind}) on ${error.topic}:`, error.message)
 *   }
 * })
 *
 * // Provide Socket.IO client
 * socket.provideClient(io('ws://localhost:3000'))
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
  const topicHandlers = new Map<string, Set<(payload: unknown) => void>>()
  const ackHandlers = new Map<string, PendingAck>()

  // Track if global listener is set up
  let globalListenerSetup = false
  let globalMessageHandler: ((data: unknown) => void) | null = null

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

  /**
   * Sets up the global message listener on the client.
   * This is called lazily when the first subscribe handler is created or the
   * first send waits for an acknowledgement.
   */
  function setupGlobalListener(): void {
    if (globalListenerSetup) {
      return
    }

    const currentClient = getClient()
    globalMessageHandler = createGlobalMessageHandler(config, topicHandlers, ackHandlers)

    // Listen for the 'message' event (common pattern)
    currentClient.on('message', globalMessageHandler)

    globalListenerSetup = true
  }

  /**
   * Sets the socket client instance.
   *
   * @param newClient - Socket client (Socket.IO or compatible)
   */
  function provideClient(newClient: SocketClient): void {
    // If switching clients, clean up old state
    if (client) {
      // Remove global listener
      if (globalListenerSetup && globalMessageHandler) {
        client.off('message', globalMessageHandler)
        globalListenerSetup = false
        globalMessageHandler = null
      }

      // Stop waiting for acknowledgements on the old client: clear the timers,
      // remove their listeners from it and reject the sends
      const previousUrl = client.url
      for (const { topic, release, reject } of ackHandlers.values()) {
        release()
        reject(
          reportSocketError(config.onError, {
            kind: 'transport',
            topic,
            url: previousUrl,
            message: '[Navios-Socket]: Client was replaced while acknowledgement pending',
          }),
        )
      }
      ackHandlers.clear()
    }

    client = newClient

    // Re-setup global listener if we have subscribers
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
    getClient,
    config,
    topicHandlers,
    get globalListenerSetup() {
      return globalListenerSetup
    },
    setupGlobalListener,
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
