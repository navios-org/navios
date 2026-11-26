import type { ResponseMeta } from './response-meta.mjs'

export function getHeader(meta: ResponseMeta | null, name: string): string | null {
  return meta ? meta.headers.get(name) : null
}

export function getRetryAfterMs(meta: ResponseMeta | null): number | null {
  const raw = getHeader(meta, 'retry-after')
  if (!raw) return null
  const asInt = Number(raw)
  if (Number.isFinite(asInt)) return Math.max(0, asInt * 1000)
  const date = Date.parse(raw)
  if (Number.isFinite(date)) return Math.max(0, date - Date.now())
  return null
}

/**
 * Reads one cookie value from the response's `Set-Cookie` headers.
 *
 * Browsers do not let scripts read `Set-Cookie`: there it is always `null`, as
 * it is on runtimes without `Headers.getSetCookie`.
 */
export function getCookie(meta: ResponseMeta | null, name: string): string | null {
  if (typeof meta?.headers.getSetCookie !== 'function') return null
  const prefix = `${name}=`
  for (const entry of meta.headers.getSetCookie()) {
    const trimmed = entry.trim()
    if (trimmed.startsWith(prefix)) {
      return trimmed.slice(prefix.length).split(';')[0] ?? null
    }
  }
  return null
}

/** Something that carries response headers: `ResponseMeta`, or the `response` of `withResponse`. */
export interface HeaderSource {
  headers: Headers | Record<string, string>
}

function contentDisposition(source: HeaderSource | string | null): string | null {
  if (source === null) return null
  if (typeof source === 'string') return source
  const { headers } = source
  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get('content-disposition')
  }
  for (const [name, value] of Object.entries(headers as Record<string, string>)) {
    if (name.toLowerCase() === 'content-disposition') return String(value)
  }
  return null
}

/** Splits `a=1; b="x;y"` into its parameters, keeping quoted semicolons. */
function dispositionParams(value: string): Map<string, string> {
  const params = new Map<string, string>()
  const pattern = /;\s*([^\s=;]+)\s*=\s*("(?:\\.|[^"\\])*"|[^;]*)/g
  for (const [, name, raw] of `;${value}`.matchAll(pattern)) {
    const trimmed = raw!.trim()
    const unquoted =
      trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2
        ? trimmed.slice(1, -1).replace(/\\(.)/g, '$1')
        : trimmed
    const key = name!.toLowerCase()
    if (!params.has(key)) params.set(key, unquoted)
  }
  return params
}

/** Decodes an RFC 8187 ext-value: `charset'language'percent-encoded`. */
function decodeExtValue(value: string): string | null {
  const match = /^([^']*)'[^']*'(.*)$/.exec(value)
  if (!match) return null
  const charset = (match[1] || 'utf-8').toLowerCase()
  const encoded = match[2]!
  try {
    if (charset === 'utf-8') return decodeURIComponent(encoded)
    const bytes: number[] = []
    for (let i = 0; i < encoded.length; i++) {
      if (encoded[i] === '%' && /^[\da-f]{2}$/i.test(encoded.slice(i + 1, i + 3))) {
        bytes.push(Number.parseInt(encoded.slice(i + 1, i + 3), 16))
        i += 2
      } else {
        bytes.push(encoded.charCodeAt(i))
      }
    }
    return new TextDecoder(charset).decode(new Uint8Array(bytes))
  } catch {
    return null
  }
}

/**
 * Reads the file name a response suggests in its `Content-Disposition`
 * header, for a download.
 *
 * - `filename*` (RFC 6266 / 8187, e.g. `filename*=UTF-8''na%C3%AFve.pdf`)
 *   wins over `filename`, as the RFCs require
 * - quoted names are unquoted, with `\"` and `\\` unescaped
 * - any directory part is removed, so the result is a bare file name
 *
 * Accepts a `ResponseMeta` (`result.response` of `endpoint.safe()`, or
 * `error.response`), the `response` that `withResponse: true` delivers in
 * `@navios/react-query`, or the raw header value.
 *
 * @returns The file name, or `null` when the header is missing or names none
 *
 * @example
 * ```ts
 * const result = await downloadReport.safe({ urlParams: { id } })
 * if (result.ok) saveBlob(result.data, getFilename(result.response) ?? 'report.pdf')
 * ```
 */
export function getFilename(source: HeaderSource | string | null): string | null {
  const header = contentDisposition(source)
  if (!header) return null
  const params = dispositionParams(header)
  const extended = params.has('filename*') ? decodeExtValue(params.get('filename*')!) : null
  const name = extended ?? params.get('filename') ?? null
  if (name === null) return null
  const base = name.split(/[/\\]/).pop()!.trim()
  return base === '' || base === '.' || base === '..' ? null : base
}
