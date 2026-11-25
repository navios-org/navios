/**
 * Appends query parameters to a URL.
 *
 * Shared by `declareWebSocket` and `declareEventSource`, which both open a
 * connection from a URL template plus a validated query object.
 *
 * - `undefined` and `null` values are skipped, also inside arrays.
 * - A `Date` is written as `toISOString()`.
 * - An array is written once per item, repeating the key (`tag=a&tag=b`).
 * - Everything else is written as `String(value)`.
 * - A URL that already has a query string is continued with `&`, and a
 *   `#fragment` stays at the end.
 */
export function appendQuery(
  url: string,
  query: Record<string, unknown> | null | undefined,
): string {
  if (!query) {
    return url
  }

  const searchParams = new URLSearchParams()
  const append = (key: string, value: unknown) => {
    if (value === undefined || value === null) {
      return
    }
    searchParams.append(key, value instanceof Date ? value.toISOString() : String(value))
  }
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        append(key, item)
      }
    } else {
      append(key, value)
    }
  }

  const queryString = searchParams.toString()
  if (!queryString) {
    return url
  }

  const hashIndex = url.indexOf('#')
  const base = hashIndex === -1 ? url : url.slice(0, hashIndex)
  const fragment = hashIndex === -1 ? '' : url.slice(hashIndex)

  let separator = '?'
  if (base.includes('?')) {
    separator = base.endsWith('?') || base.endsWith('&') ? '' : '&'
  }
  return `${base}${separator}${queryString}${fragment}`
}
