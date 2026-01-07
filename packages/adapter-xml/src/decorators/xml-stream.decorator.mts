import type {
  BaseEndpointOptions,
  RequestArgs,
  Simplify,
  StreamHandler,
} from '@navios/builder'

import { getEndpointMetadata, XmlStreamAdapterToken } from '@navios/core'

import type { BaseXmlStreamConfig } from '../index.mjs'

/**
 * Extracts the typed parameters for an XML stream endpoint handler function.
 *
 * Similar to `EndpointParams`, but specifically for XML streaming endpoints.
 *
 * @typeParam EndpointDeclaration - The XML stream endpoint declaration from @navios/builder
 */
export type XmlStreamParams<
  EndpointDeclaration extends StreamHandler<Config, false>,
  Config extends BaseXmlStreamConfig = EndpointDeclaration['config'],
> = Simplify<
  RequestArgs<
    Config['url'],
    Config['querySchema'],
    Config['requestSchema'],
    Config['urlParamsSchema'],
    true
  >
>

/**
 * Decorator that marks a method as an XML streaming endpoint.
 *
 * Use this decorator for endpoints that stream XML data (e.g., RSS feeds, sitemaps).
 * The endpoint must be defined using @navios/builder's `declareXmlStream` method.
 * The method returns JSX elements, which will be automatically rendered to XML.
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
export function XmlStream<Config extends BaseEndpointOptions>(endpoint: {
  config: Config
}): (
  target: (
    params: RequestArgs<
      Config['url'],
      Config['querySchema'],
      Config['requestSchema'],
      Config['urlParamsSchema'],
      true
    >,
    reply: any,
  ) => any,
  context: ClassMethodDecoratorContext,
) => void
// Bun doesn't support reply parameter
export function XmlStream<Config extends BaseEndpointOptions>(endpoint: {
  config: Config
}): (
  target: (
    params: RequestArgs<
      Config['url'],
      Config['querySchema'],
      Config['requestSchema'],
      Config['urlParamsSchema'],
      true
    >,
  ) => any,
  context: ClassMethodDecoratorContext,
) => void
export function XmlStream<Config extends BaseEndpointOptions>(endpoint: {
  config: Config
}): (target: () => any, context: ClassMethodDecoratorContext) => void
export function XmlStream<Config extends BaseEndpointOptions>(endpoint: {
  config: Config
}) {
  type Params = RequestArgs<
    Config['url'],
    Config['querySchema'],
    Config['requestSchema'],
    Config['urlParamsSchema'],
    true
  >

  type Handler =
    | ((params: Params, reply: any) => any)
    | ((params: Params) => any)
    | (() => any)

  return (target: Handler, context: ClassMethodDecoratorContext) => {
    if (context.kind !== 'method') {
      throw new Error(
        '[Navios] Endpoint decorator can only be used on methods.',
      )
    }
    const config = endpoint.config
    if (context.metadata) {
      let endpointMetadata = getEndpointMetadata<BaseEndpointOptions>(
        target,
        context,
      )
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
