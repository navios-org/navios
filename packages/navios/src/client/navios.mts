import type { InterceptorManager } from '../interceptors/index.mjs'
import type { NaviosConfig, NaviosDefaults } from '../navios-config.mjs'
import type {
  NaviosDeleteConfig,
  NaviosGetConfig,
  NaviosHeadConfig,
  NaviosOptionsConfig,
  NaviosPatchConfig,
  NaviosPostConfig,
  NaviosPutConfig,
  NaviosRequestConfig,
  PreparedRequestConfig,
} from '../request/index.mjs'
import type { NaviosResponse } from '../response/index.mjs'

export interface Navios {
  create: (baseConfig?: NaviosConfig) => Navios
  get: <Result, Params extends object = object>(
    url: string,
    config?: NaviosGetConfig<Params>,
  ) => Promise<NaviosResponse<Result>>
  post: <Result, Data = unknown, Params extends object = object>(
    url: string,
    data?: Data,
    config?: NaviosPostConfig<Data, Params>,
  ) => Promise<NaviosResponse<Result>>
  put: <Result, Data = unknown, Params extends object = object>(
    url: string,
    data?: Data,
    config?: NaviosPutConfig<Data, Params>,
  ) => Promise<NaviosResponse<Result>>
  delete: <Result, Params extends object = object>(
    url: string,
    config?: NaviosDeleteConfig<Params>,
  ) => Promise<NaviosResponse<Result>>
  patch: <Result, Data = unknown, Params extends object = object>(
    url: string,
    data?: Data,
    config?: NaviosPatchConfig<Data, Params>,
  ) => Promise<NaviosResponse<Result>>
  head: <Result, Params extends object = object>(
    url: string,
    config?: NaviosHeadConfig<Params>,
  ) => Promise<NaviosResponse<Result>>
  options: <Result, Params extends object = object>(
    url: string,
    config?: NaviosOptionsConfig<Params>,
  ) => Promise<NaviosResponse<Result>>
  request: <Result, Data = unknown, Params extends object = object>(
    config: NaviosRequestConfig<Data, Params>,
  ) => Promise<NaviosResponse<Result>>
  /** The configuration of the client. Changes apply to every later request. */
  defaults: NaviosDefaults
  interceptors: {
    /** Run before the request is serialised, so they can change `params`, `data` and `headers`. */
    request: InterceptorManager<PreparedRequestConfig>
    /** Run after the body was read. */
    response: InterceptorManager<NaviosResponse<unknown>>
  }
}

export interface NaviosStatic extends Navios {
  <Result, Data = unknown, Params extends object = object>(
    config: NaviosRequestConfig<Data, Params>,
  ): Promise<NaviosResponse<Result>>
}
