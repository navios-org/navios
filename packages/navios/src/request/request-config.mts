import type { NaviosConfig } from '../navios-config.mjs'

import type { HttpMethod } from './http-method.mjs'

export interface NaviosRequestConfig<
  Data,
  Params extends Record<string, string | number> | URLSearchParams,
> extends RequestInit {
  url?: string
  method?: HttpMethod
  baseURL?: string
  headers?: any
  params?: Params
  data?: Data | FormData | string | undefined
  credentials?: RequestCredentials
  responseType?: NaviosConfig['responseType']
  validateStatus?: (status: number) => boolean
  cancelToken?: AbortSignal
  /**
   * Milliseconds after which the request is aborted. It rejects with an error
   * whose `code` is `ECONNABORTED` and whose `cause` is the `TimeoutError`.
   * Combined with `signal` when both are given.
   */
  timeout?: number
}

export interface PreparedRequestConfig<
  Data,
  Params extends Record<string, string | number>,
> extends NaviosRequestConfig<Data, Params> {
  method: HttpMethod
  url: string
  headers: Record<string, string>
  validateStatus: (status: number) => boolean
  FormData: any
  URLSearchParams: any
}

export type NaviosGetConfig<Params extends {}> = Omit<
  NaviosRequestConfig<void, Params>,
  'method' | 'data' | 'url'
>
export type NaviosPostConfig<Data, Params extends {}> = Omit<
  NaviosRequestConfig<Data, Params>,
  'method' | 'url'
>
export type NaviosPutConfig<Data, Params extends {}> = Omit<
  NaviosRequestConfig<Data, Params>,
  'method' | 'url'
>
export type NaviosDeleteConfig<Params extends {}> = Omit<
  NaviosRequestConfig<unknown, Params>,
  'method' | 'url'
>
export type NaviosPatchConfig<Data, Params extends {}> = Omit<
  NaviosRequestConfig<Data, Params>,
  'method' | 'url'
>
export type NaviosHeadConfig<Params extends {}> = Omit<
  NaviosRequestConfig<void, Params>,
  'method' | 'data' | 'url'
>
export type NaviosOptionsConfig<Params extends {}> = Omit<
  NaviosRequestConfig<void, Params>,
  'method' | 'data' | 'url'
>
