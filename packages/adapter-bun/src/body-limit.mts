import { HttpException } from '@navios/server'

/** The default of `Bun.serve`. */
export const DEFAULT_BODY_LIMIT = 128 * 1024 * 1024

export const BODY_TOO_LARGE = 'Request body is too large'

/**
 * A request with the body of `request`, which has no declared length (chunked
 * transfer encoding, or `inject()`). Reading it fails with a 413 as soon as
 * more than `limit` bytes have arrived, whoever reads it: the pipeline, or a
 * handler through `ctx.raw.request`.
 */
export function limitBody(request: Request, limit: number): Request {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let size = 0
  return new Request(request, {
    // eslint-disable-next-line unicorn/no-invalid-fetch-options -- `request` has a body
    body: new ReadableStream({
      async pull(controller) {
        reader ??= request.body!.getReader() as ReadableStreamDefaultReader<Uint8Array>
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
        return (reader ?? request.body!).cancel(reason)
      },
    }),
  })
}
