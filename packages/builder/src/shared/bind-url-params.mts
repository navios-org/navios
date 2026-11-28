import { parseSync } from './validate.mjs'

import type { Schema } from './schema.mjs'

/**
 * The one definition of a URL parameter: `$` followed by a letter or
 * underscore, then letters, digits or underscores. The type-level
 * `ParsePathParams` follows the same rule. A `*` after the name makes it a
 * rest param (`/files/$path*`), whose value may hold slashes.
 */
const URL_PARAM_PATTERN = /\$([A-Za-z_][A-Za-z0-9_]*)(\*?)/g

/** The names of the rest params of a URL template. */
function restParamNames(urlPart: string): Set<string> {
  const names = new Set<string>()
  for (const [, name, star] of urlPart.matchAll(URL_PARAM_PATTERN)) {
    if (name !== undefined && star === '*') names.add(name)
  }
  return names
}

/**
 * Lists the parameter names in a URL template, in order of first appearance.
 *
 * @example
 * ```ts
 * getUrlParamNames('/users/$user_id/files/$name.json') // ['user_id', 'name']
 * ```
 */
export function getUrlParamNames(urlPart: string): string[] {
  const names: string[] = []
  for (const [, name] of urlPart.matchAll(URL_PARAM_PATTERN)) {
    if (name !== undefined && !names.includes(name)) names.push(name)
  }
  return names
}

/** Writes a value as it appears in a URL, or returns `null` when it has no such form. */
function toUrlText(value: unknown): string | null {
  switch (typeof value) {
    case 'string':
    case 'boolean':
    case 'bigint':
      return String(value)
    case 'number':
      return Number.isFinite(value) ? String(value) : null
    default:
      return value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString() : null
  }
}

/**
 * Binds URL parameters to a URL template string.
 *
 * Replaces `$paramName` placeholders with values from `urlParams`. All values
 * are URL-encoded. A `Date` is written as ISO string.
 *
 * When `urlParamsSchema` is provided, the URL parameters are validated and
 * transformed by the schema before being bound.
 *
 * @param urlPart - URL template (e.g., '/users/$userId/posts/$postId')
 * @param params - Request parameters object containing `urlParams`
 * @param urlParamsSchema - Optional schema for validating and transforming URL parameters
 * @returns The URL with parameters replaced and URL-encoded
 * @throws {Error} If required URL parameters are missing, or a value is
 *   exactly `.` or `..`, or has no form in a URL (an object, an array, `NaN`)
 * @throws If urlParamsSchema is provided and validation fails: the schema
 *   library's own error when it has one (a `ZodError` for Zod), a
 *   `NaviosError` otherwise
 *
 * @example
 * ```ts
 * bindUrlParams('/users/$userId/posts/$postId', {
 *   urlParams: { userId: '123', postId: '456' }
 * })
 * // '/users/123/posts/456'
 * ```
 */
export function bindUrlParams<Url extends string>(
  urlPart: Url,
  params: { urlParams?: Record<string, unknown> },
  urlParamsSchema?: Schema,
) {
  const requiredParams = getUrlParamNames(urlPart)

  if (requiredParams.length === 0) {
    return urlPart
  }

  if (!params.urlParams) {
    throw new Error(`Missing urlParams. Required parameters: ${requiredParams.join(', ')}`)
  }

  let urlParamsToUse = params.urlParams
  if (urlParamsSchema) {
    urlParamsToUse = parseSync(urlParamsSchema, urlParamsToUse) as Record<string, unknown>
  }

  // An empty string would silently collapse the path (`/users/$id` -> `/users/`)
  // and hit a different route, so it counts as missing.
  const missingParams = requiredParams.filter(
    (param) =>
      urlParamsToUse[param] === undefined ||
      urlParamsToUse[param] === null ||
      urlParamsToUse[param] === '',
  )
  if (missingParams.length > 0) {
    throw new Error(`Missing required URL parameters: ${missingParams.join(', ')}`)
  }

  const texts = new Map<string, string | null>(
    requiredParams.map((param) => [param, toUrlText(urlParamsToUse[param])]),
  )
  const unwritable = requiredParams.filter((param) => texts.get(param) === null)
  if (unwritable.length > 0) {
    throw new Error(
      `Invalid URL parameters (not a string, finite number, boolean or Date): ${unwritable.join(', ')}`,
    )
  }

  // `encodeURIComponent` leaves dots alone, and a `.` or `..` segment is
  // resolved away by URL parsing (`/users/../profile` -> `/profile`), so the
  // request would hit a different route.
  const rest = restParamNames(urlPart)
  const dotParams = requiredParams.filter(
    (param) => !rest.has(param) && ['.', '..'].includes(texts.get(param)!),
  )
  if (dotParams.length > 0) {
    throw new Error(
      `Invalid URL parameters (a value cannot be "." or ".."): ${dotParams.join(', ')}`,
    )
  }
  // A rest param keeps its slashes, so each of its segments is a segment of
  // the path: none may be empty or a dot segment.
  const badRest = [...rest].filter((param) =>
    texts
      .get(param)!
      .split('/')
      .some((segment) => ['', '.', '..'].includes(segment)),
  )
  if (badRest.length > 0) {
    throw new Error(
      `Invalid URL parameters (a segment of a rest param cannot be empty, "." or ".."): ${badRest.join(', ')}`,
    )
  }

  // Single-pass replacement using callback to avoid issues with values containing $
  const result = urlPart.replace(URL_PARAM_PATTERN, (_, paramName: string, star: string) =>
    star === '*'
      ? texts.get(paramName)!.split('/').map(encodeURIComponent).join('/')
      : encodeURIComponent(texts.get(paramName)!),
  )

  return result as Url
}
