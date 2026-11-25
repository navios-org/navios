/** One segment of a route's path: fixed text, decoded, or a url param. */
export type RouteSegment = { readonly literal: string } | { readonly param: string }

/**
 * The path of a route, taken apart. The last segment of a path with a
 * trailing slash is an empty literal.
 */
export interface RoutePath {
  readonly segments: readonly RouteSegment[]
  /** The names of the url params, in order. */
  readonly params: readonly string[]
}

const PARAM = /^\$[A-Za-z_][A-Za-z0-9_]*$/

/**
 * What fixed text cannot hold: what separates the parts of a url, and what
 * one router or another reads as a pattern.
 */
// oxlint-disable-next-line no-control-regex
const FORBIDDEN = /[\s\u0000-\u001f\u007f/\\?#*$%]/

/**
 * Takes a path in builder form (`/users/$id`) apart. A segment is fixed text
 * or, as a whole, a url param. Throws for anything else, so that a path means
 * the same on every adapter or does not start.
 */
export function compileRoutePath(path: string): RoutePath {
  const refuse = (problem: string) => new Error(`the path ${JSON.stringify(path)} ${problem}`)
  if (!path.startsWith('/')) {
    throw refuse('does not start with a slash')
  }
  const texts = path.slice(1).split('/')
  const params: string[] = []
  const segments = texts.map((text, index): RouteSegment => {
    if (PARAM.test(text)) {
      const name = text.slice(1)
      if (params.includes(name)) {
        throw refuse(`has two url params named "${name}"`)
      }
      if (name === '__proto__') {
        throw refuse('has a url param that cannot have this name')
      }
      params.push(name)
      return { param: name }
    }
    if (text.includes('$')) {
      throw refuse(
        `has the segment "${text}", but a url param has to be a whole segment: "$" and a name of ` +
          `letters, digits and underscores that does not start with a digit`,
      )
    }
    if (text.startsWith(':')) {
      throw refuse(`has the segment "${text}"; a url param is written "$name"`)
    }
    if (text === '' && index < texts.length - 1) {
      throw refuse('has an empty segment')
    }
    let literal: string
    try {
      literal = decodeURIComponent(text)
    } catch {
      throw refuse(`has the segment "${text}", which is not valid percent-encoding`)
    }
    if (literal === '.' || literal === '..' || FORBIDDEN.test(literal)) {
      throw refuse(`has the segment "${text}", which cannot be matched`)
    }
    return { literal }
  })
  return { segments, params }
}

/** Encodes what RFC 3986 does not allow in a segment as it is, and nothing else. */
function encodeSegment(text: string): string {
  return encodeURIComponent(text.toWellFormed()).replace(
    /%(?:24|26|2B|2C|3A|3B|3D|40)/g,
    decodeURIComponent,
  )
}

/**
 * Builds the function that gives the path of a request from its url params:
 * what the router matched, whatever the request target looked like.
 * @internal
 */
export function compileRequestPath({
  segments,
  params,
}: RoutePath): (urlParams: Record<string, string>) => string {
  if (params.length === 0) {
    const path = segments
      .map((segment) => `/${encodeSegment((segment as { literal: string }).literal)}`)
      .join('')
    return () => path
  }
  const parts = segments.map((segment) =>
    'param' in segment ? segment : `/${encodeSegment(segment.literal)}`,
  )
  return (urlParams) => {
    let path = ''
    for (const part of parts) {
      path += typeof part === 'string' ? part : `/${encodeSegment(urlParams[part.param])}`
    }
    return path
  }
}

/**
 * Whether a value cannot be a url param: an empty segment is not one, and a
 * dot segment means another path to everything but a router.
 * @internal
 */
export function isUnmatchable(value: string): boolean {
  return value.length <= 2 && (value === '' || value === '.' || value === '..')
}

/** Unreserved characters (RFC 3986), which mean the same encoded or not. */
const UNRESERVED = /[A-Za-z0-9\-._~]/

/**
 * The path of a request target, without scheme, authority, query and
 * fragment. Percent-encoding is brought into one form: unreserved characters
 * are decoded, and nothing else is. Adapters use it for a request that
 * matched no route; the path of one that did comes from the route.
 */
export function canonicalPath(target: string): string {
  const end = target.search(/[?#]/)
  let path = end < 0 ? target : target.slice(0, end)
  if (!path.startsWith('/')) {
    const scheme = path.indexOf('://')
    if (scheme >= 0) {
      const start = path.indexOf('/', scheme + 3)
      path = start < 0 ? '/' : path.slice(start)
    }
  }
  if (!path.includes('%')) {
    return path
  }
  return path.replace(/%[0-9A-Fa-f]{2}/g, (encoded) => {
    const char = String.fromCharCode(parseInt(encoded.slice(1), 16))
    return UNRESERVED.test(char) ? char : encoded.toUpperCase()
  })
}
