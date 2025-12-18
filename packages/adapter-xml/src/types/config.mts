import type { BaseStreamConfig, HttpMethod } from '@navios/builder'

/**
 * Configuration interface for XML Stream endpoints.
 *
 * Extends the base stream configuration with XML-specific options including
 * content type, XML declaration, and encoding settings.
 *
 * @template Method - The HTTP method (GET, POST, etc.).
 * @template Url - The URL path pattern (supports parameters like `/posts/:id`).
 * @template QuerySchema - Optional Zod schema for query parameter validation.
 * @template RequestSchema - Optional Zod schema for request body validation.
 *
 * @example
 * ```typescript
 * const config: BaseXmlStreamConfig = {
 *   method: 'GET',
 *   url: '/feed.xml',
 *   contentType: 'application/rss+xml',
 *   xmlDeclaration: true,
 *   encoding: 'UTF-8',
 * }
 * ```
 */
export interface BaseXmlStreamConfig<
  Method extends HttpMethod = HttpMethod,
  Url extends string = string,
  QuerySchema = undefined,
  RequestSchema = undefined,
> extends BaseStreamConfig<Method, Url, QuerySchema, RequestSchema> {
  /** Content-Type header, defaults to 'application/xml' */
  contentType?: 'application/xml' | 'text/xml' | 'application/rss+xml' | 'application/atom+xml'
  /** Include XML declaration (<?xml version="1.0"?>) - defaults to true */
  xmlDeclaration?: boolean
  /** XML encoding, defaults to 'UTF-8' */
  encoding?: string
}
