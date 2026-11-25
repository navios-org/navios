import type { PreparedRequestConfig } from './request/request-config.mjs'
import type { NaviosResponse } from './response/navios-response.mjs'

export interface HttpClientErrorInit<Data = unknown> {
  config: PreparedRequestConfig
  response?: NaviosResponse<Data> | null
  code?: string
  cause?: unknown
}

/**
 * The one error of the client: a response with an error status, a body that
 * could not be parsed, or no response at all.
 *
 * What an interceptor throws is not wrapped; it reaches the caller as it is.
 */
export class HttpClientError<Data = unknown> extends Error {
  /** The response, or `null` when none was received. */
  readonly response: NaviosResponse<Data> | null
  /** The status of `response`. */
  declare readonly status?: number
  /**
   * The axios code of a failure without a response: `ECONNABORTED` for a
   * timeout, `ERR_CANCELED` for an aborted request, `ERR_BAD_OPTION_VALUE`
   * for a request that could not be built (nothing was sent).
   */
  declare readonly code?: string
  /**
   * The request, as the interceptors saw it. It can be sent again with
   * `client.request(error.config)`. Not enumerable, because it holds
   * credentials and loggers copy enumerable fields.
   */
  declare readonly config: PreparedRequestConfig

  constructor(message: string, init: HttpClientErrorInit<Data>) {
    super(message, 'cause' in init ? { cause: init.cause } : undefined)
    this.name = 'HttpClientError'
    this.response = init.response ?? null
    if (init.response) this.status = init.response.status
    if (init.code !== undefined) this.code = init.code
    Object.defineProperty(this, 'config', { value: init.config, enumerable: false })
  }

  /** Plain-object form for loggers, without headers, bodies and query. */
  toJSON(): {
    name: string
    message: string
    code?: string
    status?: number
    method: string
    url: string
  } {
    return {
      name: this.name,
      message: this.message,
      ...(this.code !== undefined ? { code: this.code } : {}),
      ...(this.status !== undefined ? { status: this.status } : {}),
      method: this.config.method,
      url: this.config.url.split('?', 1)[0]!,
    }
  }
}

/** Type guard for {@link HttpClientError}, for a `catch` block where the value is `unknown`. */
export function isHttpClientError<Data = unknown>(error: unknown): error is HttpClientError<Data> {
  return error instanceof HttpClientError
}
