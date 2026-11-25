import { Readable } from 'node:stream'

import { serializeCookie } from '@navios/server'

import type { RouteResult } from '@navios/server'
import type { FastifyReply } from 'fastify'

/* eslint-disable @typescript-eslint/no-explicit-any */

const DEFAULT_CONTENT_TYPES: Record<string, string> = {
  text: 'text/plain; charset=utf-8',
  blob: 'application/octet-stream',
  stream: 'application/octet-stream',
  sse: 'text/event-stream',
}

function toNodeBody(result: RouteResult): unknown | Promise<unknown> {
  const { body } = result
  if (body === undefined || body === null) {
    return undefined
  }
  if (typeof body === 'string' || Buffer.isBuffer(body) || body instanceof Readable) {
    return body
  }
  if (body instanceof Blob) {
    return body.arrayBuffer().then((buffer) => Buffer.from(buffer))
  }
  if (body instanceof ArrayBuffer) {
    return Buffer.from(body)
  }
  if (ArrayBuffer.isView(body)) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength)
  }
  if (typeof (body as any).getReader === 'function') {
    return Readable.fromWeb(body as any)
  }
  if (typeof (body as any)[Symbol.asyncIterator] === 'function') {
    return Readable.from(body as AsyncIterable<unknown>)
  }
  return body
}

export function write(
  reply: FastifyReply,
  result: RouteResult,
): FastifyReply | Promise<FastifyReply> {
  const { raw } = reply
  if (raw.destroyed) {
    // The client is gone: there is nothing to write to, and 'close' has
    // already fired, so release now.
    void result.release?.()
    return reply
  }
  if (result.release !== undefined) {
    // 'finish' covers a completed response, 'close' a connection that went
    // away first. Whichever comes first releases; the other is ignored.
    let release: RouteResult['release'] | null = result.release
    const done = () => {
      const pending = release
      release = null
      if (pending) {
        void pending()
      }
    }
    raw.once('finish', done)
    raw.once('close', done)
  }
  if (reply.sent) {
    // The handler wrote through ctx.raw.reply and took the response over.
    return reply
  }
  reply.code(result.status)
  if (result.headers !== undefined) {
    reply.headers(result.headers)
  }
  if (result.cookies !== undefined && result.cookies.length > 0) {
    reply.header('set-cookie', result.cookies.map(serializeCookie))
  }
  switch (result.kind) {
    case 'json':
      if (result.headers?.['content-type'] === undefined) {
        reply.type('application/json; charset=utf-8')
      }
      return reply.send(JSON.stringify(result.body))
    case 'empty':
      return reply.send()
    default: {
      if (result.headers?.['content-type'] === undefined) {
        const type = DEFAULT_CONTENT_TYPES[result.kind]
        if (type !== undefined) {
          reply.type(type)
        }
      }
      const body = toNodeBody(result)
      return body instanceof Promise ? body.then((value) => reply.send(value)) : reply.send(body)
    }
  }
}
