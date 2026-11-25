/**
 * A request sent through `adapter.inject()` / `app.inject()` without a
 * network socket.
 */
export interface TestRequest {
  method: string
  /** Path with optional query string. */
  url: string
  headers?: Record<string, string>
  /**
   * Sent as JSON unless it is a string, bytes, `FormData`, `URLSearchParams`,
   * `Blob` or a stream, which are sent as `fetch` sends them: a string without
   * a content type among `headers` is `text/plain`.
   */
  body?: unknown
  /** The address the request comes from, for `ctx.ip`. */
  remoteAddress?: string
}

export interface TestResponse {
  status: number
  headers: Record<string, string>
  /** The values of the `set-cookie` header, one per cookie. */
  cookies: string[]
  /** The raw response body. */
  text: string
  /** The body parsed as JSON when the content type is JSON, else `undefined`. */
  body: unknown
}
