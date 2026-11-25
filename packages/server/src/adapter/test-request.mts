/**
 * A request sent through `adapter.inject()` / `app.inject()` without a
 * network socket.
 */
export interface TestRequest {
  method: string
  /** Path with optional query string. */
  url: string
  headers?: Record<string, string>
  /** Sent as JSON unless it is a string, `FormData`, `Blob` or stream. */
  body?: unknown
}

export interface TestResponse {
  status: number
  headers: Record<string, string>
  /** The raw response body. */
  text: string
  /** The body parsed as JSON when the content type is JSON, else `undefined`. */
  body: unknown
}
