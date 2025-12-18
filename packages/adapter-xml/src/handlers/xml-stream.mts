import type { HttpMethod } from '@navios/builder'

import type { BaseXmlStreamConfig } from '../types/config.mjs'

/**
 * Declares an XML Stream endpoint configuration for use with `@XmlStream` decorator.
 *
 * This function creates an endpoint declaration that can be used with the `@XmlStream`
 * decorator to mark controller methods that return JSX-based XML responses.
 *
 * @template Method - The HTTP method (GET, POST, etc.).
 * @template Url - The URL path pattern (supports parameters like `/posts/:id`).
 * @template QuerySchema - Optional Zod schema for query parameter validation.
 * @template RequestSchema - Optional Zod schema for request body validation.
 *
 * @param config - The endpoint configuration including method, URL, schemas, and XML options.
 * @returns An endpoint declaration object to be used with `@XmlStream` decorator.
 *
 * @example
 * ```typescript
 * import { declareXmlStream } from '@navios/adapter-xml'
 * import { z } from 'zod/v4'
 *
 * // Simple endpoint
 * export const getRssFeed = declareXmlStream({
 *   method: 'GET',
 *   url: '/feed.xml',
 *   contentType: 'application/rss+xml',
 * })
 *
 * // With query parameters
 * export const getSitemap = declareXmlStream({
 *   method: 'GET',
 *   url: '/sitemap.xml',
 *   querySchema: z.object({
 *     page: z.string().optional(),
 *   }),
 *   contentType: 'application/xml',
 *   xmlDeclaration: true,
 *   encoding: 'UTF-8',
 * })
 * ```
 */
export function declareXmlStream<
  Method extends HttpMethod,
  Url extends string,
  QuerySchema = undefined,
  RequestSchema = undefined,
>(
  config: BaseXmlStreamConfig<Method, Url, QuerySchema, RequestSchema>,
): { config: BaseXmlStreamConfig<Method, Url, QuerySchema, RequestSchema> } {
  return { config }
}
