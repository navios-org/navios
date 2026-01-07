import { NaviosError } from '../errors/index.mjs'

import type { SocketClient } from './types/socket-client.mjs'
import type { SendOptions, SocketBuilderConfig, SubscribeOptions } from './types/socket-options.mjs'
import type { SendHandler, SubscribeHandler } from './types/socket-handlers.mjs'
import type { SocketBuilderInstance } from './types/socket-builder-instance.mjs'

import { createSendHandler, type CreateSendContext } from './handlers/create-send.mjs'
import { createGlobalMessageHandler, createSubscribeHandler, type CreateSubscribeContext } from './handlers/create-subscribe.mjs'

/**
 * Creates a socket builder instance for declarative WebSocket/Socket.IO messaging.
 *
 * The builder allows you to define type-safe send and subscribe handlers with
 * Zod schema validation. It uses a Socket.IO-compatible interface, so it works
 * with socket.io-client or any WebSocket wrapper implementing the SocketClient interface.
 *
 * @param config - Optional configuration for message formatting and error handling
 * @returns A SocketBuilderInstance with methods to define send/subscribe handlers
 *
 * @example
 * ```ts
 * import { socketBuilder } from '@navios/builder/socket'
 * import { io } from 'socket.io-client'
 * import { z } from 'zod'
 *
 * // Create builder
 * const socket = socketBuilder({
 *   onValidationError: (error, topic, data) => {
 *     console.error(`Validation failed for ${topic}:`, error)
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
export function socketBuilder(
  config: SocketBuilderConfig = {},
): SocketBuilderInstance {
  // Client stored in closure (like HTTP builder pattern)
  let client: SocketClient | null = null

  // State for message handling
  const topicHandlers = new Map<string, Set<(payload: unknown) => void>>()
  const ackHandlers = new Map<string, {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
    timeoutId: ReturnType<typeof setTimeout>
  }>()

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
   * This is called lazily when the first subscribe handler is created.
   */
  function setupGlobalListener(): void {
    if (globalListenerSetup) {
      return
    }

    const currentClient = getClient()
    globalMessageHandler = createGlobalMessageHandler(config, topicHandlers)

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

      // Clear all pending acknowledgement handlers to prevent memory leaks
      // and avoid calling off() on the wrong client during timeout
      ackHandlers.forEach(({ timeoutId, reject }) => {
        clearTimeout(timeoutId)
        reject(new Error('[Navios-Socket]: Client was replaced while acknowledgement pending'))
      })
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

    defineSend<const Options extends SendOptions>(
      options: Options,
    ): SendHandler<Options> {
      return createSendHandler(options, sendContext)
    },

    defineSubscribe<const Options extends SubscribeOptions>(
      options: Options,
    ): SubscribeHandler<Options> {
      return createSubscribeHandler(options, subscribeContext)
    },
  }
}
