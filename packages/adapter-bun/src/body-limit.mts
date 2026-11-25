import { HttpException } from '@navios/core'

/** The default of `Bun.serve`. */
export const DEFAULT_BODY_LIMIT = 128 * 1024 * 1024

export const BODY_TOO_LARGE = 'Request body is too large'

/** Whether a request declares a body that is larger than `limit`. */
export function declaresTooLarge(request: Request, limit: number): boolean {
  const declared = request.headers.get('content-length')
  return declared !== null && Number(declared) > limit
}

/**
 * Reads a body of unknown length, giving up as soon as it is over `limit`.
 * The result has the `text()` and `formData()` of the request.
 */
export async function readLimited(request: Request, limit: number): Promise<Request | Response> {
  const { body } = request
  if (body === null) {
    return request
  }
  const reader = body.getReader()
  const chunks: BlobPart[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    size += value.byteLength
    if (size > limit) {
      void reader.cancel().catch(() => {})
      throw new HttpException(413, BODY_TOO_LARGE)
    }
    chunks.push(value as BlobPart)
  }
  const contentType = request.headers.get('content-type')
  return new Response(new Blob(chunks), {
    headers: contentType === null ? undefined : { 'content-type': contentType },
  })
}
