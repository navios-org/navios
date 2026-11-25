import type { NaviosRequestConfig } from './request/request-config.mjs'
import type { NaviosResponse } from './response/navios-response.mjs'

export class NaviosError extends Error {
  response: NaviosResponse<any> | null
  config: NaviosRequestConfig<any, any>

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
