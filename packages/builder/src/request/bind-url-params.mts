import type { Schema } from '../types/schema.mjs'

import { parseSync } from './validate.mjs'

/**
 * Request parameters containing optional URL parameters.
 */
export interface UrlParamsRequest {
  urlParams?: Record<string, unknown>
}

/**
 * The one definition of a URL parameter: `$` followed by a letter or
 * underscore, then letters, digits or underscores. The type-level
 * `ParsePathParams` follows the same rule.
 */
const URL_PARAM_PATTERN = /\$([A-Za-z_][A-Za-z0-9_]*)/g

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

/**
 * Binds URL parameters to a URL template string.
 *
 * Replaces `$paramName` placeholders with values from `urlParams`. All values
 * are URL-encoded.
 *
 * When `urlParamsSchema` is provided, the URL parameters are validated and
 * transformed by the schema before being bound.
 *
 * @param urlPart - URL template (e.g., '/users/$userId/posts/$postId')
 * @param params - Request parameters object containing `urlParams`
 * @param urlParamsSchema - Optional schema for validating and transforming URL parameters
 * @returns The URL with parameters replaced and URL-encoded
 * @throws {Error} If required URL parameters are missing
 * @throws If urlParamsSchema is provided and validation fails (a `ZodError` for Zod schemas)
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
  params: UrlParamsRequest,
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

  // Single-pass replacement using callback to avoid issues with values containing $
  const result = urlPart.replace(URL_PARAM_PATTERN, (_, paramName: string) =>
    encodeURIComponent(String(urlParamsToUse[paramName])),
  )

  return result as Url
}
