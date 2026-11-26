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
          controller.close()
          void done()
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

/**
 * The web `Response` of a route's response. `headers` are its headers, with
 * what the adapter has added. `finished` is called once, when the response
 * holds nothing any more.
 */
export function toResponse(
  response: RouteResponse,
  headers: Headers,
  request: SrvxRequest,
  isTest: boolean,
  finished: () => void,
): Response {
  const { status, body, release } = response
  if (!(body instanceof ManagedBody)) {
    if (release !== undefined) {
      // No runtime tells when a body that is in memory has been sent.
      queueMicrotask(release)
    }
    finished()
    return new FastResponse(body as BodyInit | null, { status, headers })
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
  return new FastResponse(streamFrom(body, opening, done, abandon), { status, headers })
}
