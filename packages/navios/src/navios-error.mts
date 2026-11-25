import type { NaviosRequestConfig } from './request/request-config.mjs'
import type { NaviosResponse } from './response/navios-response.mjs'

export class NaviosError extends Error {
  response: NaviosResponse<any> | null
  config: NaviosRequestConfig<any, any>
  /** `ECONNABORTED` for a timeout, `ERR_CANCELED` for an aborted request (the axios codes). */
  code?: string

  constructor(
    message: string,
    response: NaviosResponse<any> | null,
    config: NaviosRequestConfig<any, any>,
  ) {
    super(message)
    this.response = response
    this.config = config
  }
}

export class NaviosInternalError extends Error {
  response: Response | NaviosResponse<any> | null
  config: NaviosRequestConfig<any, any>
  /** `ECONNABORTED` for a timeout, `ERR_CANCELED` for an aborted request (the axios codes). */
  code?: string

  constructor(
    message: string,
    response: Response | NaviosResponse<any> | null,
    config: NaviosRequestConfig<any, any>,
  ) {
    super(message)
    this.response = response
    this.config = config
  }
}
