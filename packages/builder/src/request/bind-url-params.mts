import type { ZodObject } from 'zod/v4'

/**
 * Request parameters containing optional URL parameters.
 */
export interface UrlParamsRequest {
  urlParams?: Record<string, string | number>
}

/**
 * Binds URL parameters to a URL template string.
 *
 * Replaces placeholders in the format `$paramName` with actual values from `urlParams`.
 * All parameter values are URL-encoded to ensure safe inclusion in URLs.
 *
 * When `urlParamsSchema` is provided, the URL parameters are validated and transformed
 * using the schema before being bound to the URL. This enables:
 * - Type coercion (e.g., `z.coerce.number()` to convert string to number)
 * - Validation (e.g., `z.string().uuid()` to ensure valid UUID format)
 * - Default values and transformations
 *
 * @param urlPart - URL template with parameter placeholders (e.g., '/users/$userId/posts/$postId')
 * @param params - Request parameters object containing `urlParams` with parameter values
 * @param urlParamsSchema - Optional Zod schema for validating and transforming URL parameters
 * @returns The URL with parameters replaced and URL-encoded
 * @throws {Error} If required URL parameters are missing
 * @throws {ZodError} If urlParamsSchema is provided and validation fails
 *
 * @example
 * ```ts
 * // Basic usage
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
 *
 * // With schema validation
 * const url3 = bindUrlParams(
 *   '/users/$userId',
 *   { urlParams: { userId: '123e4567-e89b-12d3-a456-426614174000' } },
 *   z.object({ userId: z.string().uuid() })
 * )
 * // Validates UUID format, returns: '/users/123e4567-e89b-12d3-a456-426614174000'
 * ```
 */
export function bindUrlParams<Url extends string>(
  urlPart: Url,
  params: UrlParamsRequest,
  urlParamsSchema?: ZodObject,
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

  // If urlParamsSchema is provided, validate and transform the URL params
  // This allows for type coercion, validation, and transformations
  let urlParamsToUse = params.urlParams as Record<string, unknown>
  if (urlParamsSchema) {
    urlParamsToUse = urlParamsSchema.parse(urlParamsToUse) as Record<string, unknown>
  }

  // Validate that all required params are present (after schema transformation)
  const missingParams = requiredParams.filter(
    (param) => urlParamsToUse[param] === undefined,
  )
  if (missingParams.length > 0) {
    throw new Error(
      `Missing required URL parameters: ${missingParams.join(', ')}`,
    )
  }

  // Single-pass replacement using callback to avoid issues with values containing $
  const result = urlPart.replace(placement, (_, paramName: string) => {
    const value = urlParamsToUse[paramName]
    return encodeURIComponent(String(value))
  })

  return result as Url
}
