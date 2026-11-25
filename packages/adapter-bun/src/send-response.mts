import type { ManagedBody, RouteResponse } from '@navios/server/adapter'

const encoder = new TextEncoder()

/** A body that is produced while it is being sent, as the stream that Bun takes. */
function streamFrom(
  body: ManagedBody,
  opening: string | null,
  done: () => Promise<void>,
): ReadableStream<Uint8Array> {
  let first = opening
  return new ReadableStream({
    async pull(controller) {
      if (first !== null) {
        controller.enqueue(encoder.encode(first))
        first = null
        return
      }
      try {
        const { done: ended, value } = await body.next()
        if (ended) {
          controller.close()
          void done()
          return
        }
        controller.enqueue(typeof value === 'string' ? encoder.encode(value) : value)
      } catch {
        // The server has reported the error. With it as the reason, Bun would
        // print it as well.
        controller.error()
        void done()
      }
    },
    cancel: done,
  })
}

/** Like the headers of a `GET`, for a `HEAD`: a stream, which Bun does not read. */
function unreadStream(): ReadableStream {
  return new ReadableStream({}, { highWaterMark: 0 })
}

function toHeaders(headers: RouteResponse['headers']): Headers {
  const native = new Headers()
  for (const name in headers) {
    const value = headers[name]
    if (typeof value === 'string') {
      native.set(name, value)
    } else {
      for (const item of value) {
        native.append(name, item)
      }
    }
  }
  return native
}

export function toResponse(
  response: RouteResponse,
  request: Request | undefined,
  isTest: boolean,
): Response {
  const { status, body, release } = response
  const headers = toHeaders(response.headers)
  // The server closes the body of a stream when the response is released.
  let released = false
  const done = async () => {
    if (!released) {
      released = true
      await release?.()
    }
  }

  if (
    body === null ||
    typeof body === 'string' ||
    body instanceof Uint8Array ||
    body instanceof Blob
  ) {
    if (release !== undefined) {
      // Bun does not tell when a body that is in memory has been sent.
      queueMicrotask(done)
    }
    return new Response(body as BodyInit | null, { status, headers })
  }
  if (request?.method === 'HEAD') {
    void done()
    return new Response(unreadStream(), { status, headers })
  }
  if (request?.signal.aborted) {
    void done()
  } else {
    request?.signal.addEventListener('abort', done, { once: true })
  }
  // Bun sends the headers together with the first bytes.
  const opening = isTest ? null : body.opening
  return new Response(streamFrom(body, opening, done), { status, headers })
}
