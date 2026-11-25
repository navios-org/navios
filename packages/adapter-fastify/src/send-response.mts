import type { ServerResponse } from 'node:http'
import { Readable } from 'node:stream'

import type { ManagedBody, RouteResponse } from '@navios/server/adapter'
import type { FastifyReply } from 'fastify'

/**
 * A body that is produced while it is being sent, as the stream that Fastify
 * takes. The server closes the body when the response is released.
 */
class BodyStream extends Readable {
  private started = false
  private pulling = false

  constructor(
    private readonly body: ManagedBody,
    private readonly raw: ServerResponse,
  ) {
    // One chunk ahead: what a generator yields is not collected for a client
    // that reads slowly.
    super({ objectMode: true, highWaterMark: 1 })
  }

  override _read(): void {
    if (!this.started) {
      this.started = true
      if (!this.body.isStarted) {
        setImmediate(() => this.sendHeaders())
      }
    }
    if (!this.pulling) {
      this.pulling = true
      void this.pull()
    }
  }

  private async pull(): Promise<void> {
    try {
      // One chunk after the other, for as long as they are taken. Then
      // `_read()` is called again when there is room for another.
      let isTaken: boolean
      do {
        const { done, value } = await this.body.next()
        isTaken = this.push(done ? null : value)
      } while (isTaken)
      this.pulling = false
    } catch {
      // The server has reported it. Fastify would answer an error of the
      // stream itself, if nothing has been sent; the response has been
      // decided, so the client sees the connection close instead.
      this.raw.destroy()
    }
  }

  /** A source that is idle at first must not keep the client waiting for the headers. */
  private sendHeaders(): void {
    const { raw } = this
    // Fastify sets them when it takes the stream, which a hook may delay.
    if (!raw.headersSent && !raw.destroyed && raw.hasHeader('content-type')) {
      raw.flushHeaders()
    }
  }
}

function toPayload(reply: FastifyReply, body: Exclude<RouteResponse['body'], null | string>) {
  if (body instanceof Uint8Array) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength)
  }
  if (body instanceof Blob) {
    return body.arrayBuffer().then((buffer) => Buffer.from(buffer))
  }
  // The headers of `HEAD` are those of `GET`, so there is a stream. Fastify
  // reads it to its end, which one that is produced may not have.
  return reply.request.method === 'HEAD' ? Readable.from([]) : new BodyStream(body, reply.raw)
}

export function write(
  reply: FastifyReply,
  response: RouteResponse,
): FastifyReply | Promise<FastifyReply> {
  const { raw } = reply
  const { status, headers, body, release, takenOver } = response
  if (raw.destroyed) {
    // The client is gone: there is nothing to write to, and 'close' has
    // already fired, so release now.
    void release?.()
    return reply
  }
  if (release !== undefined) {
    // 'finish' covers a completed response, 'close' a connection that went
    // away first. Whichever comes first releases; the other is ignored.
    let released = false
    const done = () => {
      if (!released) {
        released = true
        void release()
      }
    }
    raw.once('finish', done)
    raw.once('close', done)
  }
  if (reply.sent) {
    // The response was taken over through ctx.raw.reply. If the handler failed
    // after that and before it wrote anything, nobody else will end it.
    if (status >= 400 && !takenOver && !raw.headersSent) {
      raw.destroy()
    }
    return reply
  }
  reply.code(status)
  for (const name in headers) {
    // `@fastify/cors` sets it as well, and a cache has to know about both.
    const set = name === 'vary' ? reply.getHeader(name) : undefined
    reply.header(name, set === undefined ? headers[name] : [set, headers[name]].join(', '))
  }
  if (body === null) {
    return reply.send()
  }
  if (typeof body === 'string') {
    return reply.send(body)
  }
  const payload = toPayload(reply, body)
  return payload instanceof Promise
    ? payload.then((value) => reply.send(value))
    : reply.send(payload)
}
