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
 * HTTP request configuration.
 *
 * This interface defines the shape of request configurations accepted by HTTP clients.
 * Compatible with axios, @navios/http, and other standard HTTP clients.
 *
 * Common fields are first-class. Anything genuinely client-specific (e.g. axios
 * `adapter`, fetch `credentials` overrides) should be routed through
 * `clientOptions` rather than relying on an open index signature, so consumer
 * sites stay strongly typed.
 */
export interface AbstractRequestConfig {
  /** Query parameters (will be appended to URL) */
  params?: Record<string, unknown> | URLSearchParams
  /** HTTP method */
  method?: HttpMethod
  /** Request URL (can include path parameters) */
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
   * Expected response body type. Standard fetch/axios-style hint used by
   * streaming endpoints to request a `Blob` body and by clients that need
   * the raw bytes/text instead of JSON.
   */
  responseType?: 'json' | 'text' | 'blob' | 'arrayBuffer' | 'formData' | 'stream'
  /**
   * Additional client-specific options forwarded verbatim to the underlying
   * HTTP client. Use this for keys the abstract config does not model.
   */
  clientOptions?: Record<string, unknown>
}

/**
 * HTTP client interface.
 *
 * Any HTTP client that implements this interface can be used with the builder.
 * Compatible with axios, @navios/http, and other standard HTTP clients.
 *
 * @example
 * ```ts
 * const client: Client = {
 *   request: async (config) => {
 *     const response = await fetch(config.url, {
 *       method: config.method,
 *       body: config.data,
 *       headers: config.headers
 *     })
 *     return {
 *       data: await response.json(),
 *       status: response.status,
 *       statusText: response.statusText,
 *       headers: Object.fromEntries(response.headers.entries())
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
