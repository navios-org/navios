import type { BaseEndpointConfig, NaviosZodRequest } from '../types/index.mjs'

/**
 * Binds URL parameters to a URL template string.
 *
 * Replaces placeholders in the format `$paramName` with actual values from `urlParams`.
 * All parameter values are URL-encoded to ensure safe inclusion in URLs.
 *
 * @param urlPart - URL template with parameter placeholders (e.g., '/users/$userId/posts/$postId')
 * @param params - Request parameters object containing `urlParams` with parameter values
 * @returns The URL with parameters replaced and URL-encoded
 * @throws {Error} If required URL parameters are missing
 *
 * @example
 * ```ts
 * const url = bindUrlParams('/users/$userId/posts/$postId', {
 *   urlParams: { userId: '123', postId: '456' }
 * })
 * // Returns: '/users/123/posts/456'
 *
 * // With special characters (automatically encoded)
 * const url2 = bindUrlParams('/search/$query', {
 *   urlParams: { query: 'hello world' }
 * })
 * // Returns: '/search/hello%20world'
 * ```
 */
export function bindUrlParams<Url extends string>(
  urlPart: Url,
  params: NaviosZodRequest<BaseEndpointConfig<any, Url, any, any, any>>,
) {
  const placement = /\$([a-zA-Z0-9]+)/g
  const matches = Array.from(urlPart.matchAll(placement))

  if (matches.length === 0) {
    return urlPart
  }

  // Extract all required param names
  const requiredParams = matches.map(([, group]) => group)

  // Validate that urlParams exists and contains all required params
  if (!params.urlParams) {
    throw new Error(
      `Missing urlParams. Required parameters: ${requiredParams.join(', ')}`,
    )
  }

  // Validate that all required params are present
  const missingParams = requiredParams.filter(
    (param) => params.urlParams![param as string] === undefined,
  )
  if (missingParams.length > 0) {
    throw new Error(
      `Missing required URL parameters: ${missingParams.join(', ')}`,
    )
  }

  // Single-pass replacement using callback to avoid issues with values containing $
  const result = urlPart.replace(placement, (_, paramName: string) => {
    const value = params.urlParams![paramName]
    return encodeURIComponent(String(value))
  })

  return result as Url
}
