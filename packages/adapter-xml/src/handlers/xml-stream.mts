import type { HttpMethod } from '@navios/builder'

import type { BaseXmlStreamConfig } from '../types/config.mjs'

/**
 * Declares an XML Stream endpoint configuration for use with @XmlStream decorator.
 *
 * @example
 * ```typescript
 * import { declareXmlStream } from '@navios/adapter-xml'
 *
 * export const getRssFeed = declareXmlStream({
 *   method: 'GET',
 *   url: '/feed.xml',
 *   querySchema: undefined,
 *   requestSchema: undefined,
 *   contentType: 'application/rss+xml',
 *   xmlDeclaration: true,
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
