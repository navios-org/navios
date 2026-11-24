import type { HttpMethod } from '@navios/builder'
import type { ZodBaseEndpointOptions } from '@navios/core'
import type { ZodObject, ZodType } from 'zod/v4'

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
export interface XmlStreamConfig extends ZodBaseEndpointOptions {
  /**
   * XML endpoints read a JSON request body (when they have a `requestSchema`).
   * Multipart bodies are not supported.
   */
  body?: 'json'
  /**
   * How a client reads the reply. The server always answers with rendered XML,
   * so only the byte/text kinds make sense; `'json'` and `'void'` are rejected.
   * `declareXmlStream` configs normally leave this out.
   */
  response?: 'text' | 'blob' | 'stream'
  contentType?: 'application/xml' | 'text/xml' | 'application/rss+xml' | 'application/atom+xml'
  xmlDeclaration?: boolean
  encoding?: string
}

export interface BaseXmlStreamConfig<
  Method extends HttpMethod = HttpMethod,
  Url extends string = string,
  QuerySchema extends ZodObject | undefined = undefined,
  RequestSchema extends ZodType | undefined = undefined,
> extends XmlStreamConfig {
  method: Method
  url: Url
  querySchema?: QuerySchema
  requestSchema?: RequestSchema
}
