import type { SseMessage } from './sse-message.mjs'

const sseBrand: unique symbol = Symbol.for('navios.server.SseStream')

/**
 * A stream of server-sent events, created with `sseStream()`.
 */
export interface SseStream {
  readonly [sseBrand]: true
  readonly source: AsyncIterable<SseMessage>
}

/**
 * Answers a `response: 'stream'` endpoint with server-sent events. When the
 * client disconnects, the source is closed: its `return()` is called.
 *
 * The response is decided before the source runs. An error the source throws
 * ends the stream, so what may refuse the request belongs before this call.
 *
 * ```ts
 * feed = handler(feedEndpoint, (_params, ctx) =>
 *   sseStream(async function* () {
 *     for await (const user of joins(ctx.signal)) {
 *       yield sse(userJoined, { userId: user.id })
 *     }
 *   }()),
 * )
 * ```
 */
export function sseStream(source: AsyncIterable<SseMessage>): SseStream {
  return { [sseBrand]: true, source }
}

export function isSseStream(value: unknown): value is SseStream {
  return typeof value === 'object' && value !== null && sseBrand in value
}
