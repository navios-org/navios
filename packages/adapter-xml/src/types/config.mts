import type { BaseStreamConfig, HttpMethod } from '@navios/builder'

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
