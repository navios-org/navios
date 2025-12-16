import type { EndpointFunctionArgs, HttpMethod, Util_FlatObject } from '@navios/builder'
import type { ZodObject, ZodType } from 'zod/v4'

import { getEndpointMetadata, XmlStreamAdapterToken } from '@navios/core'

import type { BaseXmlStreamConfig } from '../types/config.mjs'

export type XmlStreamParams<
  EndpointDeclaration extends {
    config: BaseXmlStreamConfig<any, any, any, any>
  },
  Url extends string = EndpointDeclaration['config']['url'],
  QuerySchema = EndpointDeclaration['config']['querySchema'],
> = QuerySchema extends ZodObject
  ? EndpointDeclaration['config']['requestSchema'] extends ZodType
    ? Util_FlatObject<EndpointFunctionArgs<Url, QuerySchema, EndpointDeclaration['config']['requestSchema'], true>>
    : Util_FlatObject<EndpointFunctionArgs<Url, QuerySchema, undefined, true>>
  : EndpointDeclaration['config']['requestSchema'] extends ZodType
    ? Util_FlatObject<EndpointFunctionArgs<Url, undefined, EndpointDeclaration['config']['requestSchema'], true>>
    : Util_FlatObject<EndpointFunctionArgs<Url, undefined, undefined, true>>

/**
 * Decorator for XML Stream endpoints that return JSX-based XML responses.
 *
 * @example
 * ```typescript
 * import { XmlStream } from '@navios/adapter-xml'
 * import { Controller } from '@navios/core'
 *
 * const getRssFeed = declareXmlStream({
 *   method: 'GET',
 *   url: '/feed.xml',
 *   querySchema: undefined,
 *   requestSchema: undefined,
 *   contentType: 'application/rss+xml',
 * })
 *
 * @Controller('/api')
 * class FeedController {
 *   @XmlStream(getRssFeed)
 *   async getFeed() {
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
export function XmlStream<
  Method extends HttpMethod = HttpMethod,
  Url extends string = string,
  QuerySchema = undefined,
  RequestSchema = ZodType,
>(endpoint: { config: BaseXmlStreamConfig<Method, Url, QuerySchema, RequestSchema> }) {
  return (
    target: (
      params: QuerySchema extends ZodObject
        ? RequestSchema extends ZodType
          ? Util_FlatObject<EndpointFunctionArgs<Url, QuerySchema, RequestSchema, true>>
          : Util_FlatObject<EndpointFunctionArgs<Url, QuerySchema, undefined, true>>
        : RequestSchema extends ZodType
          ? Util_FlatObject<EndpointFunctionArgs<Url, undefined, RequestSchema, true>>
          : Util_FlatObject<EndpointFunctionArgs<Url, undefined, undefined, true>>,
    ) => Promise<any>, // Returns XmlNode
    context: ClassMethodDecoratorContext,
  ) => {
    if (typeof target !== 'function') {
      throw new Error('[Navios] XmlStream decorator can only be used on functions.')
    }
    if (context.kind !== 'method') {
      throw new Error('[Navios] XmlStream decorator can only be used on methods.')
    }

    const config = endpoint.config
    if (context.metadata) {
      const endpointMetadata = getEndpointMetadata<BaseXmlStreamConfig>(target, context)
      if (endpointMetadata.config && endpointMetadata.config.url) {
        throw new Error(`[Navios] Endpoint ${config.method} ${config.url} already exists.`)
      }
      // @ts-expect-error We don't need to set correctly in the metadata
      endpointMetadata.config = config
      endpointMetadata.adapterToken = XmlStreamAdapterToken
      endpointMetadata.classMethod = target.name
      endpointMetadata.httpMethod = config.method
      endpointMetadata.url = config.url
    }
    return target
  }
}
