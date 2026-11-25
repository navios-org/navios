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
 */
export function getCookie(meta: ResponseMeta | null, name: string): string | null {
  if (!meta) return null
  const prefix = `${name}=`
  for (const entry of meta.headers.getSetCookie()) {
    const trimmed = entry.trim()
    if (trimmed.startsWith(prefix)) {
      return trimmed.slice(prefix.length).split(';')[0] ?? null
    }
  }
  return null
}
