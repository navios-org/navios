import type { InferSchemaInput, Schema } from './schema.mjs'
import type { OptionalIfEmpty, Simplify } from './type-helpers.mjs'
import type { UrlHasParams, UrlParams } from './url-params.mjs'

/** What a declaration says about the URL of a call: its template and schemas. */
export interface ConnectArgsOptions {
  url: string
  querySchema?: Schema
  urlParamsSchema?: Schema
}

/**
 * The `urlParams` and `params` of a call, from the URL template and the schemas
 * of a declaration: an HTTP endpoint, `declareWebSocket` or `declareEventSource`.
 *
 * - `urlParams` when the URL has parameters: the input of `urlParamsSchema`, or
 *   `string | number` for each parameter
 * - `params` when there is a `querySchema`: its input, optional when it has no
 *   required fields
 */
export type ConnectArgs<Options extends ConnectArgsOptions> = (UrlHasParams<
  Options['url']
> extends true
  ? Options['urlParamsSchema'] extends Schema
    ? { urlParams: InferSchemaInput<Options['urlParamsSchema']> }
    : { urlParams: Simplify<UrlParams<Options['url']>> }
  : {}) &
  (Options['querySchema'] extends Schema
    ? OptionalIfEmpty<'params', InferSchemaInput<Options['querySchema']>>
    : {})
