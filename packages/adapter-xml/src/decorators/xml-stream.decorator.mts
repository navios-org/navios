import { getEndpointMetadata, XmlStreamAdapterToken } from '@navios/core'

import type { ServerRequestArgs, Simplify } from '@navios/builder'

import type { XmlStreamConfig } from '../types/config.mjs'

/**
 * Extracts the typed parameters for an XML stream endpoint handler function.
 *
 * Similar to `EndpointParams`, but specifically for XML streaming endpoints.
 *
 * @typeParam EndpointDeclaration - The XML stream endpoint declaration from @navios/builder
 */
export type XmlStreamParams<
  EndpointDeclaration extends { config: XmlStreamConfig },
  Config extends XmlStreamConfig = EndpointDeclaration['config'],
> = Simplify<ServerRequestArgs<Config>>

/**
 * Checks that `@XmlStream` is applied to a declaration it can serve: a JSON
 * (or absent) request body, and no `response: 'json'` / `'void'`, because the
 * reply is always an XML document.
 */
function assertXmlStreamDeclaration(config: {
  method: string
  url: string
  body?: string
  response?: string
}): void {
  if (config.body !== undefined && config.body !== 'json') {
    throw new Error(
      `[Navios] @XmlStream cannot serve ${config.method} ${config.url}: the endpoint is declared with body: '${config.body}', but @XmlStream needs body: 'json' (or no body option).`,
    )
  }
  if (config.response === 'json' || config.response === 'void') {
    throw new Error(
      `[Navios] @XmlStream cannot serve ${config.method} ${config.url}: the endpoint is declared with response: '${config.response}', but @XmlStream answers with an XML document and needs response: 'text', 'blob' or 'stream' (or no response option, as declareXmlStream leaves it).`,
    )
  }
}

/**
 * Decorator that marks a method as an XML streaming endpoint.
 *
 * Use this decorator for endpoints that stream XML data (e.g., RSS feeds, sitemaps).
 * The endpoint must be defined using `declareXmlStream` (a `declareEndpoint` declaration with a byte or text `response` kind also works).
 * The method returns JSX elements, which will be automatically rendered to XML.
 *
 * The declaration must not use `body: 'multipart'`, `response: 'json'` or
 * `response: 'void'` (the reply is always an XML document); such a declaration
 * does not compile and throws when the decorator is applied. Its schemas must
 * be Zod schemas.
 *
 * @param endpoint - The XML stream endpoint declaration from @navios/builder
 * @returns A method decorator
 *
 * @example
 * ```typescript
 * const getRssFeed = api.declareXmlStream({
 *   method: 'get',
 *   url: '/feed.xml',
 *   contentType: 'application/rss+xml',
 * })
 *
 * @Controller()
 * export class FeedController {
 *   @XmlStream(getRssFeed)
 *   async getFeed(request: XmlStreamParams<typeof getRssFeed>) {
 *     return (
 *       <rss version="2.0">
 *         <channel>
 *           <title>My Feed</title>
 *         </channel>
 *       </rss>
 *     )
 *   }
 * }
 * ```
 */
export function XmlStream<Config extends XmlStreamConfig>(endpoint: {
  config: Config
}): (
  target: (params: ServerRequestArgs<Config>, reply: any) => any,
  context: ClassMethodDecoratorContext,
) => void
// Bun doesn't support reply parameter
export function XmlStream<Config extends XmlStreamConfig>(endpoint: {
  config: Config
}): (
  target: (params: ServerRequestArgs<Config>) => any,
  context: ClassMethodDecoratorContext,
) => void
export function XmlStream<Config extends XmlStreamConfig>(endpoint: {
  config: Config
}): (target: () => any, context: ClassMethodDecoratorContext) => void
export function XmlStream<Config extends XmlStreamConfig>(endpoint: { config: Config }) {
  type Params = ServerRequestArgs<Config>

  type Handler = ((params: Params, reply: any) => any) | ((params: Params) => any) | (() => any)

  return (target: Handler, context: ClassMethodDecoratorContext) => {
    if (context.kind !== 'method') {
      throw new Error('[Navios] Endpoint decorator can only be used on methods.')
    }
    const config = endpoint.config
    assertXmlStreamDeclaration(config)
    if (context.metadata) {
      let endpointMetadata = getEndpointMetadata<XmlStreamConfig>(target, context)
      if (endpointMetadata.config && endpointMetadata.config.url) {
        throw new Error(
          `[Navios] Endpoint ${config.method} ${config.url} already exists. Please use a different method or url.`,
        )
      }
      endpointMetadata.config = config
      endpointMetadata.adapterToken = XmlStreamAdapterToken
      endpointMetadata.classMethod = target.name
      endpointMetadata.httpMethod = config.method
      endpointMetadata.url = config.url
    }
    return target
  }
}
