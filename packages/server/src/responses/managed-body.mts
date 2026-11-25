import { describeValue } from '../internal/describe-value.mjs'
import { ignore } from '../internal/promises.mjs'
import { settledOrAborted } from '../internal/waiting.mjs'
import { SseBody } from '../sse/sse-body.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/** A comment of an event stream, which a client ignores. */
const OPENING_COMMENT = ':\n\n'

/** Who produced a lazy body. */
export interface BodyOwner {
  /** What the body belongs to, for messages: `GET /feed`. */
  readonly name: string
  /** Reads from or closes a source, for example in an async context. */
  step<Step extends keyof Source>(source: Source, step: Step): ReturnType<Source[Step]>
  /** Receives what producing the body failed with. */
  failed(error: unknown): void
  /** Receives what closing the body failed with. */
  closeFailed(error: unknown): void
}

/** One chunk of a lazy body, or its end. */
type Chunk = IteratorResult<string | Uint8Array, undefined>

/** How one of the four kinds of lazy body is read and closed. */
export interface Source {
  next(): PromiseLike<{ done?: boolean; value?: unknown }>
  close(): unknown
}

/**
 * Whether a body is produced while it is being sent: a web stream, a Node
 * stream, an async generator or another async iterable.
 * @internal
 */
export function isLazyBody(body: unknown): body is object {
  return (
    typeof body === 'object' &&
    body !== null &&
    (typeof (body as any)[Symbol.asyncIterator] === 'function' ||
      typeof (body as any).getReader === 'function')
  )
}

class WebSource implements Source {
  private reader: ReadableStreamDefaultReader | null = null

  constructor(private readonly stream: ReadableStream) {}

  next(): Promise<{ done: boolean; value?: unknown }> {
    return (this.reader ??= this.stream.getReader()).read()
  }

  close(): unknown {
    if (this.reader !== null) {
      return this.reader.cancel()
    }
    // A stream that someone else has locked is theirs to close.
    return this.stream.locked ? undefined : this.stream.cancel()
  }
}

interface NodeStream extends AsyncIterable<unknown> {
  closed?: boolean
  destroy(): unknown
  on(event: string, listener: (error: unknown) => void): unknown
  once(event: string, listener: () => void): unknown
}

class IterableSource implements Source {
  private iterator: AsyncIterator<unknown> | null = null

  constructor(private readonly iterable: AsyncIterable<unknown>) {}

  private started(): AsyncIterator<unknown> {
    return (this.iterator ??= this.iterable[Symbol.asyncIterator]())
  }

  next(): Promise<IteratorResult<unknown>> {
    return this.started().next()
  }

  close(): unknown {
    // Also for one that was never read: it may have subscribed to something
    // when it was created.
    return this.started().return?.()
  }
}

class NodeSource extends IterableSource {
  constructor(private readonly stream: NodeStream) {
    super(stream)
    // A stream that fails before it is read, while nobody listens, would end
    // the process. Reading it gives the error as well.
    stream.on('error', ignore)
  }

  override close(): unknown {
    const { stream } = this
    return stream.closed
      ? undefined
      : new Promise<void>((resolve) => {
          stream.once('close', resolve)
          stream.destroy()
        })
  }
}

function isNodeStream(body: object): body is NodeStream {
  const { destroy, pipe, on } = body as any
  return typeof destroy === 'function' && typeof pipe === 'function' && typeof on === 'function'
}

function sourceOf(body: object): Source {
  if (typeof (body as ReadableStream).getReader === 'function') {
    return new WebSource(body as ReadableStream)
  }
  return isNodeStream(body)
    ? new NodeSource(body)
    : new IterableSource(body as AsyncIterable<unknown>)
}

/**
 * A response body that is produced while it is being sent. The server owns
 * it: an adapter reads it with `next()` until `done`, or stops reading, and in
 * every case calls `release()` of the response, which closes it.
 *
 * A failed `next()` has been reported. The adapter ends the response so that
 * the client sees a failure; there is no way left to change its status.
 */
export class ManagedBody implements AsyncIterableIterator<string | Uint8Array> {
  private readonly source: Source
  private ended = false
  private failed = false
  private first: Promise<Chunk> | null = null
  private closing: Promise<void> | null = null

  /** @internal */
  constructor(
    /** @internal */
    readonly body: object,
    private readonly owner: BodyOwner,
  ) {
    this.source = sourceOf(body)
  }

  /**
   * What may be sent before the first chunk and means nothing to the client,
   * if there is such a thing: for a server that sends the headers of a
   * response together with the first bytes of its body, which an event stream
   * may not have for a long time.
   */
  get opening(): string | null {
    return this.body instanceof SseBody ? OPENING_COMMENT : null
  }

  /**
   * Whether there is something to close, and it has not been.
   * @internal
   */
  get isOpen(): boolean {
    return !this.ended && this.closing === null
  }

  /**
   * Whether the first chunk has been read already, so that the next one is
   * there at once.
   */
  get isStarted(): boolean {
    return this.first !== null
  }

  [Symbol.asyncIterator](): this {
    return this
  }

  next(): Promise<Chunk> {
    const { first } = this
    if (first !== null) {
      this.first = null
      return first
    }
    return this.read(true)
  }

  /**
   * Reads the first chunk before the response is sent. Rejects with what a
   * source that cannot start fails with: that can still be answered. Waits no
   * longer than the client does.
   * @internal
   */
  prime(signal: () => AbortSignal): Promise<void> {
    this.first = this.read(false)
    return settledOrAborted(this.first, signal)
  }

  /**
   * Takes the first chunk from whoever has read it from the source. Throws for
   * one that cannot be sent.
   * @internal
   */
  accept({ done, value }: IteratorResult<unknown>): void {
    this.first = Promise.resolve(this.toChunk(done, value))
  }

  private async read(report: boolean): Promise<Chunk> {
    if (this.ended || this.closing !== null) {
      return { done: true, value: undefined }
    }
    try {
      const { done, value } = await this.owner.step(this.source, 'next')
      return this.toChunk(done, value)
    } catch (error) {
      if (this.closing !== null) {
        // It was closed while this read was under way, so nobody reads on.
        return { done: true, value: undefined }
      }
      this.failed = true
      if (report) {
        this.owner.failed(error)
      }
      throw error
    }
  }

  private toChunk(done: boolean | undefined, value: unknown): Chunk {
    if (done) {
      this.ended = true
      return { done: true, value: undefined }
    }
    if (typeof value === 'string' || value instanceof Uint8Array) {
      return { done: false, value }
    }
    if (value instanceof ArrayBuffer) {
      return { done: false, value: new Uint8Array(value) }
    }
    throw new Error(
      `[Navios] ${this.owner.name} yielded ${describeValue(value)} as a chunk of its response. ` +
        `Yield strings or Uint8Arrays.`,
    )
  }

  /** Stops the body, for a reader that uses `for await`. */
  async return(): Promise<Chunk> {
    await this.close()
    return { done: true, value: undefined }
  }

  /**
   * Closes what produces the body, unless it has come to its end. Never
   * rejects; may wait for as long as the producer does.
   * @internal
   */
  close(): Promise<void> {
    return (this.closing ??= this.closeSource())
  }

  private async closeSource(): Promise<void> {
    if (this.ended) {
      return
    }
    try {
      await this.owner.step(this.source, 'close')
    } catch (error) {
      // A source that has failed may answer with the same error again.
      if (!this.failed) {
        this.owner.closeFailed(error)
      }
    }
  }
}
