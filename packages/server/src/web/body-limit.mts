import { bodyTooLarge } from '../decoding/request-errors.mjs'

const READERS = ['text', 'json', 'bytes', 'arrayBuffer', 'blob', 'formData', 'clone'] as const

/**
 * Limits the body of `request`, which has no declared length: it is sent with
 * chunked transfer encoding (one of `inject()` always has a length). Reading
 * it fails with a 413 as soon as more than `limit` bytes have arrived, whoever
 * reads it: the pipeline, or a handler through `ctx.raw.request`.
 *
 * The request stays the one that the runtime knows, for what it keeps by it
 * (the `params` and `server.requestIP()` of Bun); what reads its body is
 * replaced.
 *
 * A GET or HEAD request is left as it is, as is one without a body: a web
 * `Request` of those methods cannot have a body, so there is none to put in
 * its place, and the pipeline reads no body of theirs.
 */
export function limitBody(request: Request, limit: number): void {
  const { body, method } = request
  if (body === null || method === 'GET' || method === 'HEAD') {
    return
  }
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let size = 0
  // Bun leaves the url relative when the request names no valid host.
  const url = request.url.startsWith('/') ? `http://localhost${request.url}` : request.url
  const limited = new Request(url, {
    method: request.method,
    headers: request.headers,
    signal: request.signal,
    // Node takes a stream with this only.
    duplex: 'half',
    body: new ReadableStream({
      async pull(controller) {
        reader ??= body.getReader() as ReadableStreamDefaultReader<Uint8Array>
        const { done, value } = await reader.read()
        if (done) {
          controller.close()
          return
        }
        size += value.byteLength
        if (size > limit) {
          void reader.cancel().catch(() => {})
          controller.error(bodyTooLarge())
          return
        }
        controller.enqueue(value)
      },
      cancel(reason) {
        return (reader ?? body).cancel(reason)
      },
    }),
  } as RequestInit)
  for (const name of READERS) {
    Object.defineProperty(request, name, { value: () => limited[name](), configurable: true })
  }
  for (const name of ['body', 'bodyUsed'] as const) {
    Object.defineProperty(request, name, { get: () => limited[name], configurable: true })
  }
}
