import type { BaseEndpointOptions } from './endpoint-options.mjs'
import type { CallArgs } from './request-args.mjs'

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
  /**
   * Query parameters (will be appended to URL): a plain object. `undefined` and
   * `null` are to be left out, and an array repeats its key for each item.
   */
  params?: Record<string, unknown> | URLSearchParams
  /** HTTP method */
  method?: HttpMethod
  /** Request URL with path parameters already bound */
  url: string
  /**
   * Request body. `undefined` is no body, `FormData` is sent as it is, and so is
   * a string: the builder has encoded it already, with a `content-type` header.
   * Anything else is to be sent as JSON.
   */
  data?: unknown
  /** Additional request headers */
  headers?: Record<string, string>
  /** AbortSignal for request cancellation. Absent when the call has none. */
  signal?: AbortSignal
  /** Request timeout in milliseconds (recognised by axios, @navios/http, etc.) */
  timeout?: number
  /**
   * Expected response body type. Set by the builder from the endpoint's
   * `response` option (`'blob'`, `'text'`, `'stream'`, and `'text'` for
   * `'void'`, whose body is discarded); absent for JSON.
   *
   * Only values that axios, `@navios/http` and `fetch` wrappers all spell the
   * same way are used, so an axios instance is a {@link Client} as it is.
   */
  responseType?: 'json' | 'text' | 'blob' | 'stream'
  /** Client-specific keys merged in from the endpoint's `clientOptions`. */
  [key: string]: unknown
}

/**
 * What the builder tells a {@link Client} about the call behind a request,
 * as the second argument of `request`.
 *
 * Clients that only send requests ignore it (axios and `@navios/http` do).
 * It is for clients that answer per endpoint, such as the mock client of
 * `@navios/builder/mock`.
 */
export interface ClientRequestContext {
  /**
   * The declaration of the endpoint that makes the request: the same object
   * as the handler's `config`, so it can be compared by identity.
   */
  readonly endpoint: BaseEndpointOptions
  /** The call's arguments, as the caller passed them. */
  readonly args: Readonly<CallArgs>
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
 * A `fetch` wrapper is therefore a valid client. One that covers everything a
 * declaration can ask for (query arrays, uploads, empty bodies, the non-JSON
 * responses) is at https://navios.tech/docs/builder/essentials/http-client.
 */
export interface Client {
  /**
   * Makes an HTTP request.
   *
   * @param config - Request configuration
   * @param context - The endpoint and arguments of the call; most clients
   *   ignore it
   * @returns A promise that resolves to the HTTP response
   */
  request: <T = unknown>(
    config: AbstractRequestConfig,
    context?: ClientRequestContext,
  ) => Promise<AbstractResponse<T>>
}
