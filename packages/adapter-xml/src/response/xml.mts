import { isCustomResult, result } from '@navios/server'

import type { CustomResult } from '@navios/server'

import type { AnyXmlNode, XmlRenderable } from '../nodes/xml-node.mjs'

/** The response kind `xml()` produces and `xmlPlugin()` encodes. */
export const XML_RESULT_KIND = 'xml'

export interface XmlResponseOptions {
  /**
   * Media type of the response. A `charset=utf-8` parameter is added when the
   * value has no charset.
   * @default 'application/xml'
   */
  contentType?: string
  /** Include the XML declaration. @default true */
  declaration?: boolean
  /** Encoding named in the XML declaration. @default 'UTF-8' */
  encoding?: string
  /** Pretty print with indentation. @default false */
  pretty?: boolean
  /** Response status. @default 200 */
  status?: number
}

/** What an `xml()` result carries to the encoder: the tree, not yet rendered. */
export interface XmlPayload {
  readonly node: AnyXmlNode
  readonly options: XmlResponseOptions
}

/**
 * An XML document a handler answers with. Created with `xml()`; rendered by
 * the encoder `xmlPlugin()` registers for the `xml` response kind.
 */
export type XmlResponse = CustomResult<typeof XML_RESULT_KIND, XmlPayload>

/**
 * Answers a request with an XML document.
 *
 * Use it in the handler of an endpoint declared with `response: 'text'`
 * (`'stream'` and `'blob'` work too). The tree is rendered after the handler
 * returns: components receive the request context, and an error thrown by a
 * component becomes an error response like any other handler error.
 *
 * ```tsx
 * const feed = api.declareEndpoint({ method: 'GET', url: '/feed.xml', response: 'text' })
 *
 * @Controller()
 * class FeedController {
 *   feed = handler(feed, () => xml(<Feed />, { contentType: 'application/rss+xml' }))
 * }
 * ```
 *
 * Requires `xmlPlugin()`.
 */
export function xml(node: XmlRenderable, options: XmlResponseOptions = {}): XmlResponse {
  return result(
    XML_RESULT_KIND,
    { node: node as AnyXmlNode, options },
    options.status === undefined ? {} : { status: options.status },
  )
}

export function isXmlResponse(value: unknown): value is XmlResponse {
  return isCustomResult(value) && value.kind === XML_RESULT_KIND
}
