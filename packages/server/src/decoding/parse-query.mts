/**
 * A query string as `RouteInput.query()` gives it: a repeated parameter is a
 * list, and the object has no prototype, since the names come from the client
 * and `constructor` or `__proto__` are names like any other. `search` may
 * start with `?`.
 */
export function parseQuery(search: string): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = Object.create(null)
  if (search === '' || search === '?') {
    return query
  }
  for (const [name, value] of new URLSearchParams(search)) {
    const existing = query[name]
    if (existing === undefined) {
      query[name] = value
    } else if (Array.isArray(existing)) {
      existing.push(value)
    } else {
      query[name] = [existing, value]
    }
  }
  return query
}
