import { encodeSse } from './sse-message.mjs'

import type { SseMessage } from './sse-message.mjs'

const sseBrand: unique symbol = Symbol.for('navios.core.SseStream')

/**
 * A stream of server-sent events, created with `sseStream()`.
 */
export interface SseStream {
  readonly [sseBrand]: true
  readonly source: AsyncIterable<SseMessage>
}

/**
 * Answers a `response: 'stream'` endpoint with server-sent events. Iteration
 * stops when the client disconnects.
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

/** @internal */
export async function* encodeSseStream(stream: SseStream): AsyncGenerator<string> {
  for await (const message of stream.source) {
    yield encodeSse(message)
  }
}
