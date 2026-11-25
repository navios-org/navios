import { serializeCookie } from '@navios/server'

import type { RouteResult } from '@navios/server'

/* eslint-disable @typescript-eslint/no-explicit-any */

const DEFAULT_CONTENT_TYPES: Record<string, string> = {
  json: 'application/json; charset=utf-8',
  text: 'text/plain; charset=utf-8',
  blob: 'application/octet-stream',
  stream: 'application/octet-stream',
  sse: 'text/event-stream',
}

function streamFrom(iterable: AsyncIterable<unknown>, done: () => void): ReadableStream {
  const iterator = iterable[Symbol.asyncIterator]()
  const encoder = new TextEncoder()
  return new ReadableStream({
    async pull(controller) {
      try {
        const next = await iterator.next()
        if (next.done) {
          controller.close()
          done()
          return
        }
        controller.enqueue(
          typeof next.value === 'string' ? encoder.encode(next.value) : (next.value as Uint8Array),
        )
      } catch (error) {
        done()
        controller.error(error)
      }
    },
    async cancel() {
      await iterator.return?.()
      done()
    },
  })
}

export function toResponse(result: RouteResult, request: Request): Response {
  const headers = new Headers(result.headers)
  if (result.cookies !== undefined) {
    for (const cookie of result.cookies) {
      headers.append('set-cookie', serializeCookie(cookie))
    }
  }

  // Release when the response is done: right away for a body that is already
  // in memory, at the end of a stream otherwise, or when the client goes away.
  let release = result.release ?? null
  const done = () => {
    const pending = release
    release = null
    if (pending) {
      void pending()
    }
  }

  let body: any = null
  // `null` is a JSON value; for any other kind it means that there is no body.
  if (
    result.kind !== 'empty' &&
    result.body !== undefined &&
    (result.body !== null || result.kind === 'json')
  ) {
    if (!headers.has('content-type')) {
      const type = DEFAULT_CONTENT_TYPES[result.kind]
      if (type !== undefined) {
        headers.set('content-type', type)
      }
    }
    const value = result.body as any
    if (result.kind === 'json') {
      body = JSON.stringify(value)
    } else if (typeof value === 'string' || value instanceof Blob || value instanceof ArrayBuffer) {
      body = value
    } else if (ArrayBuffer.isView(value)) {
      body = value
    } else if (
      typeof value[Symbol.asyncIterator] === 'function' ||
      typeof value.getReader === 'function'
    ) {
      const response = new Response(streamFrom(value as AsyncIterable<unknown>, done), {
        status: result.status,
        headers,
      })
      if (request.signal.aborted) {
        done()
      } else if (release !== null) {
        request.signal.addEventListener('abort', done, { once: true })
      }
      return response
    } else {
      body = value
    }
  }
  const response = new Response(body, { status: result.status, headers })
  if (release !== null) {
    queueMicrotask(done)
  }
  return response
}
