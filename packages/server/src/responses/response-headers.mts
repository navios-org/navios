import type { RouteResponse } from '../routing/route-response.mjs'
import type { ResponseHeaders } from '../routing/route-result.mjs'

/**
 * The characters of a header or a cookie name.
 * @internal
 */
export const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/

/** What a response header may be set to. A number is sent as its digits. */
export type HeaderValue = string | number | readonly (string | number)[]

/** A character that no server can send in a header value. */
const FORBIDDEN = /[^\t\x20-\x7e\x80-\xff]/

function toText(name: string, value: unknown): string {
  const text = typeof value === 'number' && Number.isFinite(value) ? String(value) : value
  if (typeof text !== 'string') {
    throw new Error(
      `[Navios] The value of the response header "${name}" is ` +
        `${value === null ? 'null' : typeof value === 'number' ? value : `of type ${typeof value}`}, ` +
        `not a string or a number.`,
    )
  }
  if (FORBIDDEN.test(text)) {
    throw new Error(
      `[Navios] The value of the response header "${name}" has a character that cannot be sent.`,
    )
  }
  return text
}

/**
 * Puts a header into `target` under its lower-case name, in place of what is
 * there. Throws for a name or a value that cannot be sent.
 * @internal
 */
export function setHeader(target: ResponseHeaders, name: string, value: HeaderValue): void {
  if (!TOKEN.test(name)) {
    throw new Error(`[Navios] ${JSON.stringify(name)} is not the name of a response header.`)
  }
  const key = name.toLowerCase()
  target[key] = Array.isArray(value) ? value.map((item) => toText(key, item)) : toText(key, value)
}

/**
 * Like `setHeader`, next to what is there.
 * @internal
 */
export function appendHeader(target: ResponseHeaders, name: string, value: HeaderValue): void {
  const key = name.toLowerCase()
  const existing = target[key]
  setHeader(target, name, value)
  if (existing !== undefined) {
    target[key] = [existing, target[key]].flat()
  }
}

/**
 * Headers that describe the body a handler was going to send, or how long it
 * may be kept. On an error response they would be wrong: cached for a year,
 * or labelled as compressed.
 */
const ENTITY_HEADERS = new Set([
  'accept-ranges',
  'cache-control',
  'content-digest',
  'content-disposition',
  'content-encoding',
  'content-language',
  'content-length',
  'content-location',
  'content-md5',
  'content-range',
  'content-type',
  'digest',
  'etag',
  'expires',
  'last-modified',
  'repr-digest',
])

/** Whether a `cache-control` takes from a cache, and gives it no time to keep the response. */
function restrictsCaching(value: string): boolean {
  const directives = value
    .toLowerCase()
    .split(',')
    .map((directive) => directive.trim())
  if (directives.includes('no-store') || directives.includes('no-cache')) {
    return true
  }
  return (
    directives.some((directive) => directive === 'private' || /^max-age=0+$/.test(directive)) &&
    !directives.some((directive) => /^(?:max-age|s-maxage)="?0*[1-9]/.test(directive))
  )
}

/**
 * Whether a header that was set for a successful response must not be sent
 * with the error response in its place. Two values may be: a `cache-control`
 * that restricts, and a `content-range` that names no range, which belongs to
 * a 416.
 */
export function describesSuccess(
  name: string,
  value: string | readonly string[] | number,
): boolean {
  if (!ENTITY_HEADERS.has(name)) {
    return false
  }
  const text = String(value)
  switch (name) {
    case 'cache-control':
      return !restrictsCaching(text)
    case 'content-range':
      return !/^\w+ \*\//.test(text)
    default:
      return true
  }
}

const EVENT_STREAM = /^\s*text\/event-stream\s*(?:;|$)/i

/**
 * Whether a response with these headers is a stream of server-sent events,
 * which may have nothing to send for a long time.
 */
export function isEventStream(headers: RouteResponse['headers'] | null): boolean {
  const type = headers?.['content-type']
  return type !== undefined && EVENT_STREAM.test(String(type))
}
