/**
 * Supported HTTP methods for API requests.
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'

/**
 * Standard HTTP response structure.
 *
 * This interface defines the shape of responses returned by HTTP clients.
 * Compatible with axios, @navios/http, and other standard HTTP clients.
 *
 * @template T - The type of the response data
 */
export interface AbstractResponse<T> {
  /** The response body data */
  data: T
  /** HTTP status code (e.g., 200, 404, 500) */
  status: number
  /** HTTP status text (e.g., 'OK', 'Not Found') */
  statusText: string
  /** Response headers */
  headers: Record<string, string> | Headers
}

/**
 * HTTP request configuration handed to the {@link Client}.
 *
 * The builder owns the keys declared here. Anything an endpoint passes in its
 * `clientOptions` is merged into the same object, so client-specific keys
 * (axios `withCredentials`, fetch `credentials`, ...) reach the client under
 * their own names. Builder-owned keys always win over `clientOptions`.
 */
export interface AbstractRequestConfig {
  /** Query parameters (will be appended to URL) */
  params?: Record<string, unknown> | URLSearchParams
  /** HTTP method */
  method?: HttpMethod
  /** Request URL with path parameters already bound */
  url: string
  /** Request body data */
  data?: unknown
  /** Additional request headers */
  headers?: Record<string, string>
  /** AbortSignal for request cancellation */
  signal?: AbortSignal | null
  /** Request timeout in milliseconds (recognised by axios, @navios/http, etc.) */
  timeout?: number
  /**
   * Expected response body type. Set by the builder from the endpoint's
   * `response` option (`'blob'`, `'text'`, `'stream'`, and `'text'` for
   * `'void'`, whose body is discarded); absent for JSON.
   */
  responseType?: 'json' | 'text' | 'blob' | 'arrayBuffer' | 'formData' | 'stream'
  /** Client-specific keys merged in from the endpoint's `clientOptions`. */
  [key: string]: unknown
}

/**
 * HTTP client interface.
 *
 * Any HTTP client that implements this interface can be used with the builder.
 *
 * ## Contract
 *
 * - `request` may **resolve or reject** for a non-2xx response. The builder
 *   checks `status` itself and treats anything outside 200–299 as an error.
 * - A rejection that carries a `response` property shaped like
 *   {@link AbstractResponse} (the axios / @navios/http convention) is handled
 *   exactly like a resolved non-2xx response.
 * - A rejection that carries a `response` with a 2xx status means the client
 *   could not parse the body; it is reported as `response-validation`.
 * - A rejection without `response` is a transport failure and is classified
 *   as `network`, `timeout` or `aborted`.
 *
 * A thin `fetch` wrapper is therefore a valid client:
 *
 * @example
 * ```ts
 * const client: Client = {
 *   request: async (config) => {
 *     const response = await fetch(config.url, {
 *       method: config.method,
 *       body: config.data ? JSON.stringify(config.data) : undefined,
 *       headers: config.headers,
 *       signal: config.signal,
 *     })
 *     return {
 *       data: await response.json(),
 *       status: response.status,
 *       statusText: response.statusText,
 *       headers: response.headers,
 *     }
 *   }
 * }
 * ```
 */
export interface Client {
  /**
   * Makes an HTTP request.
   *
   * @param config - Request configuration
   * @returns A promise that resolves to the HTTP response
   */
  request: <T = unknown>(config: AbstractRequestConfig) => Promise<AbstractResponse<T>>
}
