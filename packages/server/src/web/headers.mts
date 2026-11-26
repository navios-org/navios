import type { RouteResponse } from '../adapter/route-response.mjs'

/** The headers of a route's response as web `Headers`, a list as one line per value. */
export function toWebHeaders(headers: RouteResponse['headers']): Headers {
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
