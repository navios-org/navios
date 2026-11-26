import type { ProvideClientOptions } from '../shared/realtime.mjs'

import type { SocketClient } from './socket-client.mjs'
import type { SendHandler, SubscribeHandler } from './socket-handlers.mjs'
import type { SendOptions, SubscribeOptions } from './socket-options.mjs'

/** Options of `provideClient`. */
export type ProvideSocketClientOptions = ProvideClientOptions

/**
 * Socket builder instance interface.
 *
 * Provides methods for client injection and message handler definition.
 *
 * @example
 * ```ts
 * import { declareWebSocket, socketBuilder } from '@navios/builder/socket'
 * // `z` is Zod here; any Standard Schema library works the same way
 *
 * const socket = socketBuilder()
 *
 * // Open a connection
 * const connect = declareWebSocket({ url: 'ws://localhost:3000' })
 * socket.provideClient(connect())
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
   * Sets the client messages are sent and received over.
   *
   * Sending needs a client; subscriptions made before are attached when it
   * arrives. Another client takes over the subscriptions, and sends that wait
   * for an acknowledgement are rejected. Providing the client it already has
   * does nothing.
   *
   * @param client - A `declareWebSocket` handle, or anything with the
   *   `SocketClient` interface
   *
   * @example
   * ```ts
   * const connect = declareWebSocket({ url: 'wss://api.example.com/rooms/$roomId' })
   * socket.provideClient(connect({ urlParams: { roomId: '123' } }))
   *
   * // Move on to another room
   * socket.provideClient(connect({ urlParams: { roomId: '456' } }), { closePrevious: true })
   * ```
   */
  provideClient(client: SocketClient, options?: ProvideSocketClientOptions): void

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
