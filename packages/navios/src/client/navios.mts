import type { NaviosConfig } from '../navios-config.mjs'
import type { NaviosError } from '../navios-error.mjs'
import type {
  NaviosDeleteConfig,
  NaviosGetConfig,
  NaviosHeadConfig,
  NaviosOptionsConfig,
  NaviosPatchConfig,
  NaviosPostConfig,
  NaviosPutConfig,
  NaviosRequestConfig,
} from '../request/request-config.mjs'
import type { NaviosResponse } from '../response/navios-response.mjs'

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
