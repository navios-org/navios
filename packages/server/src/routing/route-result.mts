import type { SetCookie } from './cookies.mjs'

/**
 * How a response body is written. A package may add a kind (for example
 * `xml`) by registering an encoder that turns it into one of the named ones.
 */
export type ResponseKind = 'json' | 'text' | 'blob' | 'stream' | 'sse' | 'empty' | (string & {})

/** Response headers. A list is sent as one header line per value. */
export type ResponseHeaders = Record<string, string | string[]>

/**
 * What a route produced, before it is encoded: the form interceptors,
 * encoders, error mappers and error responders work on.
 */
export interface RouteResult {
  status: number
  /** Over those of `ctx.reply`, whatever the case of a name. */
  headers?: ResponseHeaders
  cookies?: SetCookie[]
  body: unknown
  kind: ResponseKind
}
