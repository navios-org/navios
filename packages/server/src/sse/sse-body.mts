import { encodeSse } from './sse-message.mjs'

import type { SseMessage } from './sse-message.mjs'
import type { SseStream } from './sse-stream.mjs'

/**
 * The text of an event stream. Not a generator around the source: `return()`
 * on one that was never pulled would not reach the source, which may have
 * subscribed to something when it was created.
 * @internal
 */
export class SseBody implements AsyncIterableIterator<string> {
  private source: AsyncIterator<SseMessage> | null = null

  constructor(private readonly stream: SseStream) {}

  private iterator(): AsyncIterator<SseMessage> {
    return (this.source ??= this.stream.source[Symbol.asyncIterator]())
  }

  [Symbol.asyncIterator](): this {
    return this
  }

  async next(): Promise<IteratorResult<string, undefined>> {
    const { done, value } = await this.iterator().next()
    return done ? { done, value: undefined } : { done: false, value: encodeSse(value) }
  }

  async return(): Promise<IteratorResult<string, undefined>> {
    await this.iterator().return?.()
    return { done: true, value: undefined }
  }
}
