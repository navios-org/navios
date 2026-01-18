import type { AbstractHttpCorsOptions } from '@navios/core'

/**
 * Function type for dynamic origin validation.
 * Called with the request origin and a callback to return the validation result.
 */
export type OriginFunction = (
  origin: string | undefined,
  callback: (error: Error | null, allow?: boolean | string) => void,
) => void

/**
 * Extended CORS options for the Bun adapter.
 * Extends the core AbstractHttpCorsOptions with support for function-based origin.
 */
export interface BunCorsOptions extends Omit<AbstractHttpCorsOptions, 'origin' | 'logLevel'> {
  /**
   * Configures the Access-Control-Allow-Origin CORS header.
   * Can be a string, boolean, RegExp, array of these, or a function for dynamic validation.
   */
  origin?: string | boolean | RegExp | (string | boolean | RegExp)[] | OriginFunction
}

/**
 * CORS headers that can be set on a response.
 */
export interface CorsHeaders {
  'Access-Control-Allow-Origin'?: string
  'Access-Control-Allow-Credentials'?: string
  'Access-Control-Expose-Headers'?: string
  'Access-Control-Allow-Headers'?: string
  'Access-Control-Allow-Methods'?: string
  'Access-Control-Max-Age'?: string
  'Cache-Control'?: string
  Vary?: string
}

/**
 * Default allowed methods for CORS.
 */
const DEFAULT_METHODS = 'GET,HEAD,PUT,PATCH,POST,DELETE'

/**
 * Checks if the origin is allowed based on the CORS configuration.
 * Returns the origin to reflect or false if not allowed.
 */
async function matchOrigin(
  requestOrigin: string | undefined,
  origin: BunCorsOptions['origin'],
): Promise<string | false> {
  // No origin header = same-origin request, allow but don't add CORS header
  if (!requestOrigin) {
    return false
  }

  // Boolean true = allow all origins (reflect the request origin)
  if (origin === true) {
    return requestOrigin
  }

  // Boolean false = no CORS
  if (origin === false) {
    return false
  }

  // String match
  if (typeof origin === 'string') {
    if (origin === '*') {
      return '*'
    }
    return origin === requestOrigin ? requestOrigin : false
  }

  // RegExp match
  if (origin instanceof RegExp) {
    return origin.test(requestOrigin) ? requestOrigin : false
  }

  // Array - check if any entry matches
  if (Array.isArray(origin)) {
    for (const entry of origin) {
      const result = await matchOrigin(requestOrigin, entry)
      if (result) {
        return result
      }
    }
    return false
  }

  // Function - promisify the callback style
  if (typeof origin === 'function') {
    return new Promise((resolve) => {
      origin(requestOrigin, (error, allow) => {
        if (error) {
          resolve(false)
          return
        }
        if (allow === true) {
          resolve(requestOrigin)
        } else if (typeof allow === 'string') {
          resolve(allow)
        } else {
          resolve(false)
        }
      })
    })
  }

  return false
}

/**
 * Normalizes a string or array of strings to a comma-separated string.
 */
function normalizeToString(value: string | string[] | undefined): string {
  if (!value) return ''
  if (Array.isArray(value)) {
    return value.join(', ')
  }
  return value
}

/**
 * Calculates CORS headers for a request based on the provided options.
 *
 * @param requestOrigin - The Origin header from the request
 * @param options - CORS configuration options
 * @returns CORS headers object or null if origin is not allowed
 */
export async function calculateCorsHeaders(
  requestOrigin: string | undefined,
  options: BunCorsOptions,
): Promise<CorsHeaders | null> {
  const allowedOrigin = await matchOrigin(requestOrigin, options.origin)

  // If origin not allowed, return null (no CORS headers)
  if (!allowedOrigin) {
    return null
  }

  // Security: Cannot use wildcard origin with credentials
  // Per CORS spec, Access-Control-Allow-Origin cannot be '*' when credentials are included
  if (allowedOrigin === '*' && options.credentials) {
    throw new Error(
      'CORS configuration error: Cannot use wildcard origin (*) with credentials: true. ' +
        'Set a specific origin or use origin: true to reflect the request origin.',
    )
  }

  const headers: CorsHeaders = {
    'Access-Control-Allow-Origin': allowedOrigin,
  }

  // Always set Vary: Origin when not using wildcard
  if (allowedOrigin !== '*') {
    headers.Vary = 'Origin'
  }

  // Credentials
  if (options.credentials) {
    headers['Access-Control-Allow-Credentials'] = 'true'
  }

  // Exposed headers (for actual requests)
  if (options.exposedHeaders) {
    headers['Access-Control-Expose-Headers'] = normalizeToString(options.exposedHeaders)
  }

  return headers
}

/**
 * Calculates CORS headers specifically for preflight (OPTIONS) requests.
 *
 * @param requestOrigin - The Origin header from the request
 * @param requestMethod - The Access-Control-Request-Method header
 * @param requestHeaders - The Access-Control-Request-Headers header
 * @param options - CORS configuration options
 * @returns CORS headers object or null if origin is not allowed
 */
export async function calculatePreflightHeaders(
  requestOrigin: string | undefined,
  requestMethod: string | null,
  requestHeaders: string | null,
  options: BunCorsOptions,
): Promise<CorsHeaders | null> {
  const baseHeaders = await calculateCorsHeaders(requestOrigin, options)

  if (!baseHeaders) {
    return null
  }

  // Add preflight-specific headers
  const headers: CorsHeaders = { ...baseHeaders }

  // Allowed methods
  headers['Access-Control-Allow-Methods'] = options.methods
    ? normalizeToString(options.methods)
    : DEFAULT_METHODS

  // Allowed headers - reflect request headers if not specified
  if (options.allowedHeaders) {
    headers['Access-Control-Allow-Headers'] = normalizeToString(options.allowedHeaders)
  } else if (requestHeaders) {
    // Reflect the requested headers
    headers['Access-Control-Allow-Headers'] = requestHeaders
    // Add Vary for Access-Control-Request-Headers since we're reflecting
    headers.Vary = headers.Vary
      ? `${headers.Vary}, Access-Control-Request-Headers`
      : 'Access-Control-Request-Headers'
  }

  // Max age
  if (options.maxAge !== undefined) {
    headers['Access-Control-Max-Age'] = String(options.maxAge)
  }

  // Cache control for preflight
  if (options.cacheControl !== undefined) {
    if (typeof options.cacheControl === 'number') {
      headers['Cache-Control'] = `max-age=${options.cacheControl}`
    } else {
      headers['Cache-Control'] = options.cacheControl
    }
  }

  return headers
}

/**
 * Checks if a request is a CORS preflight request.
 *
 * @param method - The HTTP method of the request
 * @param origin - The Origin header value
 * @param accessControlRequestMethod - The Access-Control-Request-Method header
 * @returns true if this is a preflight request
 */
export function isPreflight(
  method: string,
  origin: string | null,
  accessControlRequestMethod: string | null,
): boolean {
  return method === 'OPTIONS' && !!origin && accessControlRequestMethod !== null
}

/**
 * Applies CORS headers to a Response object.
 *
 * @param response - The original response
 * @param requestOrigin - The Origin header from the request
 * @param options - CORS configuration options
 * @returns A new Response with CORS headers, or the original if origin not allowed
 */
export async function applyCorsToResponse(
  response: Response,
  requestOrigin: string | null,
  options: BunCorsOptions | null,
): Promise<Response> {
  if (!options) {
    return response
  }

  const corsHeaders = await calculateCorsHeaders(requestOrigin ?? undefined, options)

  if (!corsHeaders) {
    return response
  }

  const headers = new Headers(response.headers)
  for (const [key, value] of Object.entries(corsHeaders)) {
    if (value) {
      headers.set(key, value)
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
