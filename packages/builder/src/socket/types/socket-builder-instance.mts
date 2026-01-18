import type { SocketClient } from './socket-client.mjs'
import type { SendHandler, SubscribeHandler } from './socket-handlers.mjs'
import type { SendOptions, SubscribeOptions } from './socket-options.mjs'

/**
 * Socket builder instance interface.
 *
 * Provides methods for client injection and message handler definition.
 *
 * @example
 * ```ts
 * import { socketBuilder } from '@navios/builder/socket'
 * import { io } from 'socket.io-client'
 * import { z } from 'zod'
 *
 * const socket = socketBuilder()
 *
 * // Inject Socket.IO client
 * socket.provideClient(io('ws://localhost:3000'))
 *
 * // Define typed send/subscribe handlers
 * const sendMessage = socket.defineSend({
 *   topic: 'chat.message',
 *   payloadSchema: z.object({ text: z.string() })
 * })
 *
 * const onMessage = socket.defineSubscribe({
 *   topic: 'chat.message',
 *   payloadSchema: z.object({ text: z.string(), from: z.string() })
 * })
 *
 * // Use handlers
 * sendMessage({ text: 'Hello!' })
 * const unsub = onMessage((msg) => console.log(msg))
 * ```
 */
export interface SocketBuilderInstance {
  /**
   * Provide a socket client instance.
   *
   * Must be called before using any send/subscribe handlers.
   * The client must implement the SocketClient interface (Socket.IO compatible).
   *
   * @param client - Socket client (e.g., io() from socket.io-client)
   *
   * @example
   * ```ts
   * import { io } from 'socket.io-client'
   * socket.provideClient(io('ws://localhost:3000'))
   *
   * // Or with custom WebSocket wrapper
   * const wsHandle = chatSocket.connect({ roomId: '123' })
   * socket.provideClient(wsHandle)
   * ```
   */
  provideClient(client: SocketClient): void

  /**
   * Get the current socket client.
   *
   * @throws {NaviosError} If no client has been provided via provideClient
   *
   * @example
   * ```ts
   * const client = socket.getClient()
   * client.emit('custom-event', { data: 'value' })
   * ```
   */
  getClient(): SocketClient

  /**
   * Define a typed send function for a specific topic.
   *
   * Creates a function that sends messages to the server on the specified topic.
   * If ackSchema is provided, returns a Promise that resolves with the acknowledgement.
   *
   * Uses TypeScript's const generic inference for full type safety.
   *
   * @param options - Configuration for the send handler
   * @returns Send function with attached config
   *
   * @example
   * ```ts
   * // Fire-and-forget (no acknowledgement)
   * const sendMessage = socket.defineSend({
   *   topic: 'chat.message',
   *   payloadSchema: z.object({ text: z.string() })
   * })
   * sendMessage({ text: 'Hello!' }) // void
   *
   * // Request-response (with acknowledgement)
   * const createRoom = socket.defineSend({
   *   topic: 'room.create',
   *   payloadSchema: z.object({ name: z.string() }),
   *   ackSchema: z.object({ roomId: z.string(), createdAt: z.string() })
   * })
   * const room = await createRoom({ name: 'My Room' })
   * console.log(room.roomId) // Fully typed!
   * ```
   */
  defineSend<const Options extends SendOptions>(options: Options): SendHandler<Options>

  /**
   * Define a typed subscribe function for a specific topic.
   *
   * Creates a function that registers handlers for incoming messages on the topic.
   * When called with a handler, returns an unsubscribe function.
   *
   * Uses TypeScript's const generic inference for full type safety.
   *
   * @param options - Configuration for the subscribe handler
   * @returns Subscribe function with attached config
   *
   * @example
   * ```ts
   * const onMessage = socket.defineSubscribe({
   *   topic: 'chat.message',
   *   payloadSchema: z.object({
   *     text: z.string(),
   *     from: z.string(),
   *     timestamp: z.number()
   *   })
   * })
   *
   * const unsubscribe = onMessage((msg) => {
   *   // msg is fully typed: { text: string, from: string, timestamp: number }
   *   console.log(`${msg.from}: ${msg.text}`)
   * })
   *
   * // Later: stop listening
   * unsubscribe()
   * ```
   */
  defineSubscribe<const Options extends SubscribeOptions>(
    options: Options,
  ): SubscribeHandler<Options>
}
