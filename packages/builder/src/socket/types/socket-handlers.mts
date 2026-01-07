import type { z, ZodType } from 'zod/v4'

import type { SendOptions, SubscribeOptions } from './socket-options.mjs'

/**
 * Unsubscribe function returned by subscribe handlers.
 */
export type Unsubscribe = () => void

/**
 * Type inference for send handler payload parameter.
 *
 * - If payloadSchema is provided: z.input<PayloadSchema>
 * - Otherwise: unknown
 */
export type InferSendPayload<Options extends SendOptions> =
  Options['payloadSchema'] extends ZodType
    ? z.input<Options['payloadSchema']>
    : unknown

/**
 * Type inference for send handler return type.
 *
 * - If ackSchema is provided: Promise<z.output<AckSchema>>
 * - Otherwise: void
 */
export type InferSendReturn<Options extends SendOptions> =
  Options['ackSchema'] extends ZodType
    ? Promise<z.output<Options['ackSchema']>>
    : void

/**
 * Type inference for subscribe handler callback parameter.
 *
 * - If payloadSchema is provided: z.output<PayloadSchema>
 * - Otherwise: unknown
 */
export type InferSubscribePayload<Options extends SubscribeOptions> =
  Options['payloadSchema'] extends ZodType
    ? z.output<Options['payloadSchema']>
    : unknown

/**
 * Send handler function type.
 *
 * The return type depends on whether ackSchema is provided:
 * - Without ackSchema: void (fire-and-forget)
 * - With ackSchema: Promise<AckType> (request-response)
 *
 * @example
 * ```ts
 * // Without ack - returns void
 * const sendMessage = socket.defineSend({
 *   topic: 'chat.message',
 *   payloadSchema: z.object({ text: z.string() })
 * })
 * sendMessage({ text: 'Hello!' }) // void
 *
 * // With ack - returns Promise
 * const createRoom = socket.defineSend({
 *   topic: 'room.create',
 *   payloadSchema: z.object({ name: z.string() }),
 *   ackSchema: z.object({ roomId: z.string() })
 * })
 * const room = await createRoom({ name: 'My Room' }) // Promise<{ roomId: string }>
 * ```
 */
export type SendHandler<Options extends SendOptions> = ((
  payload: InferSendPayload<Options>,
) => InferSendReturn<Options>) & {
  /** Original options used to create this handler */
  config: Options
}

/**
 * Subscribe handler function type.
 *
 * When called with a handler function, registers the handler for incoming
 * messages on the topic. Returns an unsubscribe function.
 *
 * @example
 * ```ts
 * const onMessage = socket.defineSubscribe({
 *   topic: 'chat.message',
 *   payloadSchema: z.object({ text: z.string(), from: z.string() })
 * })
 *
 * const unsubscribe = onMessage((msg) => {
 *   console.log(`${msg.from}: ${msg.text}`)
 * })
 *
 * // Later: stop listening
 * unsubscribe()
 * ```
 */
export type SubscribeHandler<Options extends SubscribeOptions> = ((
  handler: (payload: InferSubscribePayload<Options>) => void,
) => Unsubscribe) & {
  /** Original options used to create this handler */
  config: Options
}
