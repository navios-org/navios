import type { SetCookie } from '../routing/cookies.mjs'

import { TOKEN } from './response-headers.mjs'

/** What `Path` and `Domain` may hold: no `;`, which would start an attribute, and no control character. */
const ATTRIBUTE = /^[\x20-\x3a\x3c-\x7e]*$/

const SAME_SITE = { strict: 'Strict', lax: 'Lax', none: 'None' }

function invalid(name: string, problem: string): Error {
  return new Error(`[Navios] The cookie ${JSON.stringify(name)} cannot be sent: ${problem}.`)
}

/**
 * Serialises a cookie for a `Set-Cookie` header. Throws for one a browser
 * would misread or drop without a word.
 */
export function serializeCookie({ name, value, options = {} }: SetCookie): string {
  if (!TOKEN.test(name)) {
    throw invalid(name, 'its name has characters a cookie name cannot have')
  }
  const { maxAge, domain, path = '/', expires, httpOnly, secure, sameSite, partitioned } = options
  if (secure !== true) {
    if (name.startsWith('__Host-') || name.startsWith('__Secure-')) {
      throw invalid(name, 'the prefix of its name needs secure: true')
    }
    if (sameSite === 'none') {
      throw invalid(name, "sameSite: 'none' needs secure: true")
    }
    if (partitioned === true) {
      throw invalid(name, 'partitioned: true needs secure: true')
    }
  }
  if (name.startsWith('__Host-') && (path !== '/' || domain)) {
    throw invalid(name, "the prefix of its name needs path: '/' and no domain")
  }
  let out = `${name}=${encodeURIComponent(value)}`
  if (maxAge !== undefined) {
    if (!Number.isFinite(maxAge)) {
      throw invalid(name, `maxAge is ${String(maxAge)}`)
    }
    out += `; Max-Age=${Math.floor(maxAge)}`
  }
  if (domain) {
    if (!ATTRIBUTE.test(domain)) {
      throw invalid(name, 'its domain is not valid')
    }
    out += `; Domain=${domain}`
  }
  if (path !== '/' && !ATTRIBUTE.test(path)) {
    throw invalid(name, 'its path is not valid')
  }
  out += `; Path=${path}`
  if (expires) {
    if (Number.isNaN(expires.getTime())) {
      throw invalid(name, 'expires is an invalid date')
    }
    out += `; Expires=${expires.toUTCString()}`
  }
  if (httpOnly) {
    out += '; HttpOnly'
  }
  if (secure) {
    out += '; Secure'
  }
  if (sameSite) {
    if (!Object.hasOwn(SAME_SITE, sameSite)) {
      throw invalid(name, `sameSite is ${JSON.stringify(sameSite)}`)
    }
    out += `; SameSite=${SAME_SITE[sameSite]}`
  }
  if (partitioned) {
    out += '; Partitioned'
  }
  return out
}

/**
 * What makes a cookie the same cookie for a browser: setting it again
 * replaces it.
 * @internal
 */
export function cookieKey({ name, options }: SetCookie): string {
  return `${name};${options?.domain?.toLowerCase() ?? ''};${options?.path ?? '/'}`
}
