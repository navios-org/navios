import type { ManagedBody, RouteResponse } from '@navios/server/adapter'

/**
 * A body that is produced while it is being sent, as the stream that Bun takes.
 * A direct one writes to the connection, without a queue between the two.
 */
function streamFrom(
  body: ManagedBody,
  opening: string | null,
  done: () => Promise<void>,
): ReadableStream<Uint8Array> {
  const source: Bun.DirectUnderlyingSource<Uint8Array> = {
    type: 'direct',
    async pull(controller) {
      try {
        if (opening !== null) {
          controller.write(opening)
          controller.flush()
        }
        for (;;) {
          const { done: ended, value } = await body.next()
          if (ended) {
            controller.close()
            return
          }
          const written = controller.write(value)
          controller.flush()
          if (typeof written !== 'number') {
            // The client reads more slowly than the body is produced. Only this
            // holds the producer back, `flush()` does not.
            await written
          }
        }
      } catch {
        // The server has reported the error. Bun closes the connection for any
        // reason, and prints one that is an error as well.
        throw undefined
      } finally {
        void done()
      }
    },
    cancel: done,
  }
  // The type of the constructor is that of the DOM.
  return new ReadableStream(source as unknown as UnderlyingDefaultSource<Uint8Array>)
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

  if (
    body === null ||
    typeof body === 'string' ||
    body instanceof Uint8Array ||
    body instanceof Blob
  ) {
    if (release !== undefined) {
      // Bun does not tell when a body that is in memory has been sent.
      queueMicrotask(release)
    }
    return new Response(body as BodyInit | null, { status, headers })
  }
  // The server closes the body of a stream when the response is released.
  let released = false
  const done = async () => {
    if (!released) {
      released = true
      await release?.()
    }
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
