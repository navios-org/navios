import type { AttributeValue } from '@opentelemetry/api'

/**
 * Standard HTTP attributes following OpenTelemetry semantic conventions.
 */
export const HttpAttributes = {
  METHOD: 'http.method',
  URL: 'http.url',
  ROUTE: 'http.route',
  STATUS_CODE: 'http.status_code',
  REQUEST_CONTENT_LENGTH: 'http.request_content_length',
  RESPONSE_CONTENT_LENGTH: 'http.response_content_length',
  USER_AGENT: 'http.user_agent',
  CLIENT_IP: 'http.client_ip',
  SCHEME: 'http.scheme',
  HOST: 'http.host',
  TARGET: 'http.target',
} as const

/**
 * Navios-specific attributes for framework context.
 */
export const NaviosAttributes = {
  CONTROLLER: 'navios.controller',
  HANDLER: 'navios.handler',
  MODULE: 'navios.module',
  GUARD: 'navios.guard',
  SERVICE: 'navios.service',
  METHOD: 'navios.method',
} as const

/**
 * Creates HTTP request attributes from a request object.
 *
 * @param request - Object with request properties
 * @returns Record of attribute key-value pairs
 */
export function createHttpRequestAttributes(request: {
  method: string
  url: string
  headers?: Record<string, string | string[] | undefined>
}): Record<string, AttributeValue> {
  const attributes: Record<string, AttributeValue> = {
    [HttpAttributes.METHOD]: request.method,
    [HttpAttributes.URL]: request.url,
  }

  if (request.headers) {
    const userAgent = getHeader(request.headers, 'user-agent')
    if (userAgent) {
      attributes[HttpAttributes.USER_AGENT] = userAgent
    }

    const contentLength = getHeader(request.headers, 'content-length')
    if (contentLength) {
      const length = parseInt(contentLength, 10)
      if (!isNaN(length)) {
        attributes[HttpAttributes.REQUEST_CONTENT_LENGTH] = length
      }
    }

    // Try to get client IP from common headers
    const clientIp =
      getHeader(request.headers, 'x-forwarded-for') || getHeader(request.headers, 'x-real-ip')
    if (clientIp) {
      // x-forwarded-for can contain multiple IPs, take the first one
      attributes[HttpAttributes.CLIENT_IP] = clientIp.split(',')[0].trim()
    }
  }

  return attributes
}

/**
 * Creates Navios-specific attributes.
 *
 * @param context - Navios context information
 * @returns Record of attribute key-value pairs
 */
export function createNaviosAttributes(context: {
  controller?: string
  handler?: string
  module?: string
  guard?: string
  service?: string
  method?: string
}): Record<string, AttributeValue> {
  const attributes: Record<string, AttributeValue> = {}

  if (context.controller) {
    attributes[NaviosAttributes.CONTROLLER] = context.controller
  }
  if (context.handler) {
    attributes[NaviosAttributes.HANDLER] = context.handler
  }
  if (context.module) {
    attributes[NaviosAttributes.MODULE] = context.module
  }
  if (context.guard) {
    attributes[NaviosAttributes.GUARD] = context.guard
  }
  if (context.service) {
    attributes[NaviosAttributes.SERVICE] = context.service
  }
  if (context.method) {
    attributes[NaviosAttributes.METHOD] = context.method
  }

  return attributes
}

/**
 * Helper to get a header value from a headers object.
 */
function getHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const value = headers[name] || headers[name.toLowerCase()]
  if (Array.isArray(value)) {
    return value[0]
  }
  return value
}

/**
 * Parses a URL and extracts attributes.
 *
 * @param url - Full URL or path
 * @returns Record of URL-related attributes
 */
export function parseUrlAttributes(url: string): Record<string, AttributeValue> {
  const attributes: Record<string, AttributeValue> = {}

  try {
    // Handle both full URLs and paths
    if (url.startsWith('/')) {
      attributes[HttpAttributes.TARGET] = url.split('?')[0]
    } else {
      const parsed = new URL(url)
      attributes[HttpAttributes.SCHEME] = parsed.protocol.replace(':', '')
      attributes[HttpAttributes.HOST] = parsed.host
      attributes[HttpAttributes.TARGET] = parsed.pathname
    }
  } catch {
    // If parsing fails, just use the raw URL as target
    attributes[HttpAttributes.TARGET] = url
  }

  return attributes
}
