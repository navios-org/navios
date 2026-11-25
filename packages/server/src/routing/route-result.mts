import type { SetCookie } from './cookies.mjs'

/**
 * How a response body is written. Every adapter writes the named kinds; a
 * package may add a kind (for example `xml`) by registering an encoder that
 * turns it into one of them.
 */
export type ResponseKind = 'json' | 'text' | 'blob' | 'stream' | 'sse' | 'empty' | (string & {})

/**
 * What a route produced, in adapter-neutral form. An adapter writes it to the
 * native response.
 */
export interface RouteResult {
  status: number
  headers?: Record<string, string>
  cookies?: SetCookie[]
  body: unknown
  kind: ResponseKind
  /**
   * Present when the request holds resources (a DI scope, request values
   * with a `dispose` hook). The adapter calls it once the response has been
   * fully sent, or the connection is gone.
   */
  release?: () => void | Promise<void>
}
