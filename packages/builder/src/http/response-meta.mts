import type { AbstractResponse } from './client.mjs'

/**
 * Metadata about an HTTP response. Always present on a successful
 * {@link SafeResult}; `null` on a failure where no response was received
 * (network failure, abort, request validation, missing client).
 */
export interface ResponseMeta {
  status: number
  statusText: string
  headers: Headers
}

type ResponseLike = Pick<AbstractResponse<unknown>, 'status' | 'statusText' | 'headers'>

/**
 * Normalizes response metadata into the canonical {@link ResponseMeta}
 * shape. Plain-object header bags are upgraded to a `Headers` instance.
 */
export function toResponseMeta(r: ResponseLike): ResponseMeta {
  return { status: r.status, statusText: r.statusText ?? '', headers: toHeaders(r.headers) }
}

/**
 * Builds a `Headers` instance from whatever header bag a client reports.
 *
 * `new Headers(bag)` throws on a name or value the Fetch spec rejects and
 * joins array values into one string. Headers are metadata, so a bad entry
 * must not turn a finished request into a failure: entries are appended one
 * by one, array values (axios reports `set-cookie` this way) once per item,
 * and anything `Headers` refuses is skipped.
 */
function toHeaders(source: unknown): Headers {
  if (source instanceof Headers) return source
  const headers = new Headers()
  if (typeof source !== 'object' || source === null) return headers
  for (const [name, value] of Object.entries(source)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item === undefined || item === null) continue
      try {
        headers.append(name, String(item))
      } catch {
        // Not representable as a header; leave it out.
      }
    }
  }
  return headers
}
