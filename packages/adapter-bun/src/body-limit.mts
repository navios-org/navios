import { HttpException } from '@navios/server'

/** The default of `Bun.serve`. */
export const DEFAULT_BODY_LIMIT = 128 * 1024 * 1024

export const BODY_TOO_LARGE = 'Request body is too large'

const READERS = ['text', 'json', 'bytes', 'arrayBuffer', 'blob', 'formData', 'clone'] as const

/**
 * Limits the body of `request`, which has no declared length (chunked transfer
 * encoding, or `inject()`). Reading it fails with a 413 as soon as more than
 * `limit` bytes have arrived, whoever reads it: the pipeline, or a handler
 * through `ctx.raw.request`.
 *
 * The request stays the one that Bun knows, with its `params` and `cookies`
 * and for `server.requestIP()`; what reads its body is replaced.
 */
export function limitBody(request: Request, limit: number): void {
  const body = request.body!
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let size = 0
  // Bun leaves the url relative when the request names no valid host.
  const url = request.url.startsWith('/') ? `http://localhost${request.url}` : request.url
  const limited = new Request(url, {
    method: request.method,
    headers: request.headers,
    signal: request.signal,
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
          controller.error(new HttpException(413, BODY_TOO_LARGE))
          return
        }
        controller.enqueue(value)
      },
      cancel(reason) {
        return (reader ?? body).cancel(reason)
      },
    }),
  })
  for (const name of READERS) {
    Object.defineProperty(request, name, { value: () => limited[name](), configurable: true })
  }
  for (const name of ['body', 'bodyUsed'] as const) {
    Object.defineProperty(request, name, { get: () => limited[name], configurable: true })
  }
}
