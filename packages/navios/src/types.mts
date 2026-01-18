import { NaviosError } from './NaviosError.mjs'

export interface NaviosResponse<T> {
  data: T
  status: number
  statusText: string
  headers: Headers
}

export interface NaviosConfig {
  adapter?: typeof globalThis.fetch
  baseURL?: string
  validateStatus?: (status: number) => boolean
  headers?: { [key: string]: string }
  responseType?: 'json' | 'text' | 'blob' | 'arrayBuffer' | 'formData' | 'stream'
  FormData?: any
  URLSearchParams?: any
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'

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
  NaviosRequestConfig<void, Params>,
  'method' | 'data' | 'url'
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
export type NaviosPromise<T = any> = Promise<NaviosResponse<T>>

export interface Navios {
  create: (baseConfig?: NaviosConfig) => Navios
  get: <Result, Params extends {} = {}>(
    url: string,
    config?: NaviosGetConfig<Params>,
  ) => Promise<NaviosResponse<Result>>
  post: <Result, Data = Result, Params extends {} = {}>(
    url: string,
    data?: any,
    config?: NaviosPostConfig<Data, Params>,
  ) => Promise<NaviosResponse<Result>>
  put: <Result, Data = Result, Params extends {} = {}>(
    url: string,
    data?: any,
    config?: NaviosPutConfig<Data, Params>,
  ) => Promise<NaviosResponse<Result>>
  delete: <Result, Params extends {} = {}>(
    url: string,
    config?: NaviosDeleteConfig<Params>,
  ) => Promise<NaviosResponse<Result>>
  patch: <Result, Data = Result, Params extends {} = {}>(
    url: string,
    data?: any,
    config?: NaviosPatchConfig<Data, Params>,
  ) => Promise<NaviosResponse<Result>>
  head: <Result, Params extends {} = {}>(
    url: string,
    config?: NaviosHeadConfig<Params>,
  ) => Promise<NaviosResponse<Result>>
  options: <Result, Params extends {} = {}>(
    url: string,
    config?: NaviosOptionsConfig<Params>,
  ) => Promise<NaviosResponse<Result>>
  request: <Result, Data = Result, Params extends {} = {}>(
    config: NaviosRequestConfig<Data, Params>,
  ) => Promise<NaviosResponse<Result>>
  defaults: NaviosConfig
  interceptors: {
    request: {
      use: (
        onInit: (onInit: NaviosRequestConfig<any, any>) => any,
        onRejected?: (config: NaviosError) => any,
      ) => number
      eject: (id: number) => void
      clear: () => void
    }
    response: {
      use: (
        onSuccess: (response: NaviosResponse<any>) => any,
        onRejected?: (error: NaviosError) => any,
      ) => number
      eject: (id: number) => void
      clear: () => void
    }
  }
}

export interface NaviosStatic extends Navios {
  <Result, Data = Result, Params extends {} = {}>(
    config: NaviosRequestConfig<Data, Params>,
  ): Promise<NaviosResponse<Result>>
}
