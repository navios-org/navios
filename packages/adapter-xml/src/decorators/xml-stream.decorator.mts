import type { EndpointFunctionArgs, HttpMethod, Util_FlatObject } from '@navios/builder'
import type { ZodObject, ZodType } from 'zod/v4'

import { getEndpointMetadata, XmlStreamAdapterToken } from '@navios/core'

import type { BaseXmlStreamConfig } from '../types/config.mjs'

/**
 * Type helper that extracts the parameter types for an XML Stream endpoint handler.
 *
 * This type automatically infers the correct parameter types based on the endpoint
 * configuration, including URL parameters, query parameters, and request body.
 *
 * @template EndpointDeclaration - The endpoint declaration type from `declareXmlStream`.
 * @template Url - The URL path pattern.
 * @template QuerySchema - The query parameter schema type.
 *
 * @example
 * ```typescript
 * const getFeed = declareXmlStream({
 *   method: 'GET',
 *   url: '/feed/:category',
 *   querySchema: z.object({ page: z.string() }),
 * })
 *
 * // XmlStreamParams<typeof getFeed> resolves to:
 * // { urlParams: { category: string }, query: { page: string } }
 * ```
 */
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
 * This decorator marks controller methods that return JSX elements, which will be
 * automatically rendered to XML and sent with the appropriate Content-Type header.
 * The method can be async and can contain async components, class components, and
 * regular JSX elements.
 *
 * @template Method - The HTTP method (GET, POST, etc.).
 * @template Url - The URL path pattern (supports parameters like `/posts/:id`).
 * @template QuerySchema - Optional Zod schema for query parameter validation.
 * @template RequestSchema - Optional Zod schema for request body validation.
 *
 * @param endpoint - The endpoint declaration created with `declareXmlStream`.
 * @returns A method decorator function.
 *
 * @throws {Error} If used on a non-function or non-method.
 * @throws {Error} If the endpoint URL already exists.
 *
 * @example
 * ```typescript
 * import { XmlStream, declareXmlStream } from '@navios/adapter-xml'
 * import { Controller } from '@navios/core'
 *
 * const getRssFeed = declareXmlStream({
 *   method: 'GET',
 *   url: '/feed.xml',
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
 *
 * @example
 * ```typescript
 * // With query parameters
 * const getSitemap = declareXmlStream({
 *   method: 'GET',
 *   url: '/sitemap.xml',
 *   querySchema: z.object({ page: z.string().optional() }),
 * })
 *
 * @Controller()
 * class SitemapController {
 *   @XmlStream(getSitemap)
 *   async getSitemap(params: { query?: { page?: string } }) {
 *     const page = params.query?.page
 *     return <urlset>...</urlset>
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
