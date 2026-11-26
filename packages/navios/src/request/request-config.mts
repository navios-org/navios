import type { NaviosConfig, NaviosResponseType } from '../navios-config.mjs'

import type { HttpMethod } from './http-method.mjs'
import type { HeadersSource } from './merge-headers.mjs'

export interface NaviosRequestConfig<Data = unknown, Params extends object = object> extends Omit<
  RequestInit,
  'headers' | 'method'
> {
  url?: string
  method?: HttpMethod
  baseURL?: string
  headers?: HeadersSource
  /** Query parameters: an object, or `URLSearchParams`. */
  params?: Params | URLSearchParams
  /**
   * Request body. A string, `FormData`, `URLSearchParams`, `Blob`, buffer or
   * stream is sent as it is, anything else as JSON. `null` is no body unless
   * the content type is JSON. Not sent for `GET` and `HEAD`.
   */
  data?: Data | FormData | string
  responseType?: NaviosResponseType
  validateStatus?: (status: number) => boolean
  /**
   * Milliseconds after which the request is aborted. It rejects with an error
   * whose `code` is `ECONNABORTED` and whose `cause` is a `TimeoutError`.
   * Combined with `signal` when both are given. It covers reading the body,
   * except for `responseType: 'stream'`, where it ends with the headers.
   * `Infinity`, or more than a timer can wait for (2^31 - 1), is no timeout.
   */
  timeout?: number
  /** `true` is the same as `credentials: 'include'`, unless `credentials` is given. */
  withCredentials?: boolean
}

/** The config of one request, merged with the defaults: what request interceptors receive. */
export interface PreparedRequestConfig<
  Data = unknown,
  Params extends object = object,
> extends NaviosRequestConfig<Data, Params> {
  method: HttpMethod
  url: string
  baseURL: string
  /** Names are listed in lower case, and read, set and deleted in any. */
  headers: Record<string, string>
  responseType: NaviosResponseType
  validateStatus: (status: number) => boolean
  URLSearchParams?: NaviosConfig['URLSearchParams']
}

/** The config of `post`, `put`, `patch` and `delete`: the method and URL are their arguments. */
export type NaviosBodyConfig<Data = unknown, Params extends object = object> = Omit<
  NaviosRequestConfig<Data, Params>,
  'method' | 'url'
>

/** The config of `get`, `head` and `options`, which send no `data`. */
export type NaviosNoBodyConfig<Params extends object = object> = Omit<
  NaviosBodyConfig<void, Params>,
  'data'
>
