import { ManagedBody } from '@navios/server/adapter'
import { FastResponse } from 'srvx'

import type { RouteResponse } from '@navios/server/adapter'

import type { SrvxRequest } from './environment.mjs'

const encoder = new TextEncoder()

/**
 * A body that is produced while it is being sent, as a web stream. It is read
 * no faster than the client takes it.
 */
function streamFrom(
  body: ManagedBody,
  opening: string | null,
  done: () => Promise<void>,
  abandon: (() => void) | undefined,
  isCut: () => boolean,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (opening !== null) {
        controller.enqueue(encoder.encode(opening))
      }
    },
    async pull(controller) {
      try {
        const { done: ended, value } = await body.next()
        if (ended) {
          void done()
          if (isCut()) {
            // Closing has given up on the stream, and closed what produces
            // it. The client must not take what it got for all of it.
            controller.error()
            abandon?.()
          } else {
            controller.close()
          }
          return
        }
        controller.enqueue(typeof value === 'string' ? encoder.encode(value) : value)
      } catch {
        // The server has reported the error. What is left is to end the
        // response where it is, which closes the connection. Bun prints a
        // reason, and srvx leaves the response of Node open without one.
        void done()
        controller.error()
        abandon?.()
      }
    },
    cancel: done,
  })
}

function byteLength(body: string | Uint8Array | Blob): number {
  if (typeof body === 'string') {
    return encoder.encode(body).byteLength
  }
  return body instanceof Blob ? body.size : body.byteLength
}

/**
 * The web `Response` of a route's response. `headers` are its headers, with
 * what the adapter has added. `finished` is called once, when the response
 * holds nothing any more. `isCut` says whether the server has stopped waiting
 * for streams to end.
 */
export function toResponse(
  response: RouteResponse,
  headers: Headers,
  request: SrvxRequest,
  isTest: boolean,
  finished: () => void,
  isCut: () => boolean,
): Response {
  const { status, body, release } = response
  if (!(body instanceof ManagedBody)) {
    if (release !== undefined) {
      // No runtime tells when a body that is in memory has been sent.
      queueMicrotask(release)
    }
    finished()
    if (request.method !== 'HEAD' || body === null) {
      return new FastResponse(body as BodyInit | null, { status, headers })
    }
    // Not every runtime drops the body of an answer to `HEAD`: what makes the
    // result of a function of Lambda does not. The headers stay those of
    // `GET`, with the length that the body would have had.
    if (!headers.has('content-length')) {
      headers.set('content-length', String(byteLength(body)))
    }
    return new FastResponse(null, { status, headers })
  }
  // The server closes the body of a stream when the response is released.
  let released = false
  const done = async () => {
    if (!released) {
      released = true
      finished()
      await release?.()
    }
  }
  if (request.method === 'HEAD') {
    void done()
    return new FastResponse(null, { status, headers })
  }
  const { signal } = request
  if (signal.aborted) {
    void done()
  } else {
    signal.addEventListener('abort', done, { once: true })
  }
  // A server sends the headers together with the first bytes.
  const opening = isTest ? null : body.opening
  const native = request.runtime?.node?.res
  const abandon = native === undefined ? undefined : () => void native.destroy()
  return new FastResponse(streamFrom(body, opening, done, abandon, isCut), { status, headers })
}
