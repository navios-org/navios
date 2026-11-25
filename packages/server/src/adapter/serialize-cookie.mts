import type { SetCookie } from '../routing/cookies.mjs'

/**
 * Serialises a cookie for a `Set-Cookie` header.
 */
export function serializeCookie({ name, value, options = {} }: SetCookie): string {
  let out = `${name}=${encodeURIComponent(value)}`
  if (options.maxAge !== undefined) {
    out += `; Max-Age=${Math.floor(options.maxAge)}`
  }
  if (options.domain) {
    out += `; Domain=${options.domain}`
  }
  out += `; Path=${options.path ?? '/'}`
  if (options.expires) {
    out += `; Expires=${options.expires.toUTCString()}`
  }
  if (options.httpOnly) {
    out += '; HttpOnly'
  }
  if (options.secure) {
    out += '; Secure'
  }
  if (options.sameSite) {
    out += `; SameSite=${options.sameSite[0].toUpperCase()}${options.sameSite.slice(1)}`
  }
  return out
}
