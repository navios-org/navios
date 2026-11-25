import type { SetCookie } from './cookies.mjs'

/**
 * How a response body is written. Core ships encoders for the first five;
 * a package may register more (for example `xml`).
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
